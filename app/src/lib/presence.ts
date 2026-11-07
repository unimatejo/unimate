import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { sharedChannel } from './realtime';
import { supabase } from './supabase';
import { t } from './i18n';

/**
 * Activity status like Instagram, without a live channel for the whole app (one app-wide presence channel sends
 * every open / close to every other student: traffic grows with the square of the people online, and the realtime
 * message quota with it). Instead the app writes last_seen_at every 90 s while it's on screen, and anyone seen in the
 * last 4 minutes counts as "active now". The people on screen are looked up together (one call), at most every 60 s.
 * Someone who turned "show activity status" off is never tracked and sees nobody else's status.
 */
// touch_seen writes at most every 2 minutes, so 'active now' allows a little more than that
const ACTIVE_MS = 4 * 60_000, REFRESH_MS = 60_000;
const seenAt = new Map<string, { at: number | null; fetched: number }>();
const subs = new Set<() => void>();
let enabled = false;
const emit = () => subs.forEach((f) => f());
const wanted = new Set<string>();
let batch: ReturnType<typeof setTimeout> | null = null;

function want(id: string) {
  const hit = seenAt.get(id);
  if (hit && Date.now() - hit.fetched < REFRESH_MS) return;
  wanted.add(id);
  if (batch) return;
  batch = setTimeout(async () => {
    batch = null;
    const ids = [...wanted].slice(0, 100);
    ids.forEach((x) => wanted.delete(x));
    if (!ids.length) return;
    const now = Date.now();
    ids.forEach((x) => seenAt.set(x, { at: seenAt.get(x)?.at ?? null, fetched: now })); // no second ask meanwhile
    const { data } = await supabase.rpc('last_seen_of', { ids }).then((r) => r, () => ({ data: null }));
    for (const r of (data ?? []) as { id?: string; user_id?: string; last_seen_at: string | null }[]) {
      const k = r.id ?? r.user_id;
      if (k) seenAt.set(k, { at: r.last_seen_at ? new Date(r.last_seen_at).getTime() : null, fetched: now });
    }
    emit();
  }, 300);
}

/** Start once from the signed-in shell (TabBar). */
export function usePresenceTracker(userId?: string, show = true) {
  useEffect(() => {
    enabled = !!userId && show;
    emit();
    if (!userId || !show) return;
    let active = AppState.currentState === 'active';
    const seen = () => { if (active) supabase.rpc('touch_seen').then(() => {}, () => {}); };
    seen();
    const iv = setInterval(seen, 90_000);
    const sub = AppState.addEventListener('change', (s) => { active = s === 'active'; seen(); });
    return () => { clearInterval(iv); sub.remove(); };
  }, [userId, show]);
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
const lastSeen = (id: string) => seenAt.get(id)?.at ?? null;
const isOn = (id?: string | null) => { const at = id && enabled ? lastSeen(id) : null; return !!at && Date.now() - at < ACTIVE_MS; };
/** minutes since last seen, or null */
const minsAgo = (id?: string | null) => { const at = id && enabled ? lastSeen(id) : null; return at ? Math.floor((Date.now() - at) / 60000) : null; };

/** True when this person had UniMate open in the last few minutes (and both of you share activity status). */
export function useOnline(id?: string | null) {
  useEffect(() => { if (id && enabled) want(id); }, [id]);
  return useSyncExternalStore(subscribe, () => isOn(id), () => false);
}

/** "نشط الآن" / "نشط قبل 5 د" / null for one person. */
export function useActivityLine(id?: string | null) {
  const on = useOnline(id);
  const mins = useSyncExternalStore(subscribe, () => minsAgo(id), () => null);
  if (!id || !enabled) return null;
  if (on) return t('نشط الآن');
  if (mins == null) return null;
  if (mins < 60) return t('نشط قبل {0} د', [Math.max(4, mins)]);
  const h = Math.floor(mins / 60);
  if (h < 24) return t('نشط قبل {0} س', [h]);
  return null; // older than a day: say nothing, like Instagram
}

// ---------- "typing…" in the inbox ----------
// The chat screen already broadcasts typing inside the conversation; it also pings each other member's
// personal inbox channel so their inbox row can show "عم يكتب…".
const typingNow = new Map<string, number>(); // conversation id → until
const typingSubs = new Set<() => void>();
let typingVer = 0;
const typingEmit = () => { typingVer++; typingSubs.forEach((f) => f()); };

export function useInboxTyping(userId?: string) {
  useEffect(() => {
    if (!userId) return;
    const ch = sharedChannel(`inbox-typing-${userId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const c = payload?.conversation as string | undefined;
        if (!c) return;
        typingNow.set(c, Date.now() + 4000);
        typingEmit();
        setTimeout(typingEmit, 4100);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);
  useSyncExternalStore((f) => { typingSubs.add(f); return () => { typingSubs.delete(f); }; }, () => typingVer, () => 0);
  return (conversationId: string) => (typingNow.get(conversationId) ?? 0) > Date.now();
}

/** Tell the other members' inboxes that I'm typing in this conversation (throttled by the caller). */
export function pingInboxTyping(conversationId: string, memberIds: string[]) {
  for (const m of memberIds.slice(0, 20)) {
    const ch = supabase.channel(`inbox-typing-${m}`, { config: { broadcast: { self: false } } });
    // sending on a channel we never joined goes over HTTP; nothing is stored
    ch.send({ type: 'broadcast', event: 'typing', payload: { conversation: conversationId } }).finally(() => { supabase.removeChannel(ch); });
  }
}
