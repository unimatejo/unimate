import { useEffect, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';
import { t } from './i18n';

/**
 * Activity status like Instagram: one app-wide realtime presence channel says who is open right now,
 * and last_seen_at (written at most every 2 minutes) says "active 5 m ago". Someone who turned
 * "show activity status" off is never tracked and sees nobody else's status.
 */
let online = new Set<string>();
const subs = new Set<() => void>();
let enabled = false;
const emit = () => subs.forEach((f) => f());

/** Start once from the signed-in shell (TabBar). */
export function usePresenceTracker(userId?: string, show = true) {
  useEffect(() => {
    enabled = !!userId && show;
    if (!userId || !show) { online = new Set(); emit(); return; }
    const ch = supabase.channel('online', { config: { presence: { key: userId } } });
    const sync = () => {
      online = new Set(Object.keys(ch.presenceState()));
      emit();
    };
    ch.on('presence', { event: 'sync' }, sync).on('presence', { event: 'join' }, sync).on('presence', { event: 'leave' }, sync);
    let active = AppState.currentState === 'active';
    const track = () => { if (active) ch.track({ at: Date.now() }).catch(() => {}); else ch.untrack().catch(() => {}); };
    ch.subscribe((st) => { if (st === 'SUBSCRIBED') track(); });
    const seen = () => { if (active) supabase.rpc('touch_seen').then(() => {}, () => {}); };
    seen();
    const iv = setInterval(seen, 120000);
    const sub = AppState.addEventListener('change', (s) => { active = s === 'active'; track(); seen(); });
    return () => { clearInterval(iv); sub.remove(); supabase.removeChannel(ch); online = new Set(); emit(); };
  }, [userId, show]);
}

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

/** True while this person has UniMate open (and both of you share activity status). */
export function useOnline(id?: string | null) {
  return useSyncExternalStore(subscribe, () => !!id && enabled && online.has(id), () => false);
}

/** "نشط الآن" / "نشط قبل 5 د" / null for one person. */
export function useActivityLine(id?: string | null) {
  const on = useOnline(id);
  const [last, setLast] = useState<string | null>(null);
  useEffect(() => {
    if (!id || !enabled) { setLast(null); return; }
    supabase.rpc('last_seen_of', { ids: [id] }).then(({ data }) => setLast((data as { last_seen_at: string | null }[] | null)?.[0]?.last_seen_at ?? null), () => {});
  }, [id, on]);
  if (!id || !enabled) return null;
  if (on) return t('نشط الآن');
  if (!last) return null;
  const mins = Math.floor((Date.now() - new Date(last).getTime()) / 60000);
  if (mins < 2) return t('نشط الآن');
  if (mins < 60) return t('نشط قبل {0} د', [mins]);
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
    const ch = supabase.channel(`inbox-typing-${userId}`, { config: { broadcast: { self: false } } })
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
