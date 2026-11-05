import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Eye } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar, Row, T } from '../ui';
import { Act, Panel, confirm, promptText, Muted } from './kit';
import { ContactBubble, FileBubble, LocationBubble, PollBubble, StickerBubble } from '../ChatAttach';
import { bubble, DateSep, inkOn, ReactionChips, type Reaction } from '../ChatExtras';
import { VoiceBubble } from '../Voice';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { timeAgo } from '@/lib/util';
import type { Message } from '@/lib/types';

export type Member = { id: string; name: string; state?: string; avatar_url?: string | null; username?: string | null };

/** Image bubble with a signed link from the private chat bucket (same size as the real chat). */
function Pic({ src, mine, label }: { src?: string; mine: boolean; label?: string }) {
  return (
    <View style={[{ width: 220, height: 170, overflow: 'hidden' }, bubble(mine, C.card)]}>
      {src ? <Image source={{ uri: src }} style={{ flex: 1 }} contentFit="cover" transition={150} /> : null}
      {label ? (
        <Row gap={4} style={{ position: 'absolute', top: 8, start: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
          <Eye size={12} color="#fff" /><T v="tiny" color="#fff">{label}</T>
        </Row>
      ) : null}
    </View>
  );
}

/**
 * Read-only copy of the real chat screen for admins: same bubbles, day separators, names and avatars in groups,
 * reactions, times under each run. `rightId` is the person shown on the right (the user being inspected, or the first member).
 * Opening is logged by admin_conversation_messages; new messages keep arriving while it's open. Long-press a message to delete it.
 */
export function ChatViewer({ conversationId, members, presetReason, rightId }: { conversationId: string; members: Member[]; presetReason?: string; rightId?: string }) {
  const [msgs, setMsgs] = useState<Message[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [media, setMedia] = useState<Record<string, string>>({});
  const [reacts, setReacts] = useState<Record<string, Reaction[]>>({});
  const [busy, setBusy] = useState(false);
  const [people, setPeople] = useState<Record<string, Member>>({});

  useEffect(() => { setMsgs(null); }, [conversationId]);
  // members may come without photos: fill them in once
  useEffect(() => {
    const base = Object.fromEntries(members.map((m) => [m.id, m]));
    setPeople(base);
    const ids = members.filter((m) => m.avatar_url === undefined).map((m) => m.id);
    if (ids.length) supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids).then(({ data }) => {
      if (data) setPeople((p) => ({ ...p, ...Object.fromEntries(data.map((x) => [x.id, { ...(p[x.id] ?? { id: x.id }), name: p[x.id]?.name ?? x.full_name, avatar_url: x.avatar_url }])) }));
    }, () => {});
  }, [members]);

  async function sign(list: Message[]) {
    const paths = list.filter((m) => m.media_url && !/^https?:/.test(m.media_url) && ['image', 'view_once'].includes(m.kind)).map((m) => m.media_url!);
    if (!paths.length) return;
    const { data: signed } = await supabase.storage.from('chat').createSignedUrls(paths, 3600);
    setMedia((x) => ({ ...x, ...Object.fromEntries((signed ?? []).filter((s) => s.signedUrl && s.path).map((s) => [s.path as string, s.signedUrl as string])) }));
  }
  async function loadReacts(list: Message[]) {
    if (!list.length) return;
    const { data } = await supabase.from('message_reactions').select('message_id, user_id, emoji').in('message_id', list.map((m) => m.id));
    const by: Record<string, Reaction[]> = {};
    for (const r of (data ?? []) as { message_id: string; user_id: string; emoji: string }[]) (by[r.message_id] ??= []).push({ user_id: r.user_id, emoji: r.emoji });
    setReacts((x) => ({ ...x, ...by }));
  }

  async function open() {
    setError(null); setBusy(true);
    const { data, error: e } = await supabase.rpc('admin_conversation_messages', { conv: conversationId, reason: presetReason?.trim() || 'browse' });
    setBusy(false);
    if (e) { setError(e.message); return; }
    const list = (data ?? []) as Message[];
    setMsgs(list);
    sign(list); loadReacts(list);
  }
  // opens straight away and keeps following new messages live
  useEffect(() => { if (!msgs && !busy) open(); }, [conversationId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!msgs) return;
    const tick = setInterval(async () => {
      const last = msgs[msgs.length - 1]?.created_at ?? new Date(0).toISOString();
      const { data } = await supabase.rpc('admin_conversation_since', { conv: conversationId, after: last });
      const fresh = (data ?? []) as Message[];
      if (fresh.length) {
        setMsgs((x) => [...(x ?? []), ...fresh.filter((f) => !(x ?? []).some((y) => y.id === f.id))]);
        sign(fresh); loadReacts(fresh);
      }
    }, 4000);
    return () => clearInterval(tick);
  }, [msgs, conversationId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function del(m: Message) {
    if (m.deleted_at) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    if (!(await confirm(t('تحذف هالرسالة؟'), t('بتنحذف عند الكل، وبينسجل الحذف باسمك.'), t('احذف')))) return;
    const r = await promptText(t('ليش بدك تحذف هالرسالة؟'));
    if (r === null) return;
    await supabase.rpc('admin_delete_message', { msg: m.id, reason: r });
    setMsgs((x) => x?.map((y) => (y.id === m.id ? { ...y, deleted_at: new Date().toISOString() } : y)) ?? null);
  }

  const right = rightId ?? members[0]?.id;
  const group = members.length > 2;

  if (!msgs) return (
    <Panel>
      {error ? <T v="small" color={C.red}>{error}</T> : <Muted>{t('عم نفتح المحادثة…')}</Muted>}
      {error && <Act label={t('جرّب كمان مرة')} kind="primary" loading={busy} onPress={open} />}
    </Panel>
  );

  return (
    <View style={{ gap: 4, backgroundColor: C.bg, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 8 }}>
      {msgs.length === 0 && <Muted>{t('ما في رسائل.')}</Muted>}
      {msgs.length > 0 && <T v="tiny" color={C.faint} style={{ textAlign: 'center', marginBottom: 4 }}>{t('اضغط مطوّل على أي رسالة لحذفها')}</T>}
      {msgs.map((m, i) => {
        const mine = m.sender_id === right;
        const prev = msgs[i - 1];
        const next = msgs[i + 1];
        const newDay = !prev || new Date(prev.created_at).toDateString() !== new Date(m.created_at).toDateString();
        const sep = newDay || (prev && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() > 60 * 60000);
        const showName = !mine && !!m.sender_id && (group || !right) && (prev?.sender_id !== m.sender_id || sep);
        const endOfRun = !next || next.sender_id !== m.sender_id || new Date(next.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60000;
        const vanished = !!m.vanishes_at && new Date(m.vanishes_at) < new Date() && !m.is_saved;
        const who = m.sender_id ? people[m.sender_id] : undefined;
        if (m.kind === 'system') return (
          <View key={m.id}>{sep && <DateSep iso={m.created_at} />}
            <View style={{ alignSelf: 'center', backgroundColor: C.soft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><T v="tiny" color={C.ink2}>{m.body}</T></View>
          </View>
        );
        const src = m.media_url ? (/^https?:/.test(m.media_url) ? m.media_url : media[m.media_url]) : undefined;
        const plain = !['image', 'voice', 'sticker', 'file', 'location', 'contact', 'poll', 'view_once'].includes(m.kind) || ((m.kind === 'image' || m.kind === 'voice' || m.kind === 'file') && !m.media_url);
        return (
          <View key={m.id}>
            {sep && <DateSep iso={m.created_at} />}
            <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', gap: 3, marginTop: showName ? 6 : 0, opacity: m.deleted_at ? 0.5 : 1 }}>
              {showName && who && (
                <Row gap={6}>
                  <Avatar id={who.id} name={who.name} url={who.avatar_url ?? null} size={20} />
                  <T v="tiny" color={C.muted}>{who.name}</T>
                </Row>
              )}
              <Pressable onLongPress={() => del(m)} delayLongPress={320} accessibilityHint={t('اضغط مطوّل للحذف')}>
                {m.kind === 'image' && m.media_url ? <Pic src={src} mine={mine} /> :
                 m.kind === 'view_once' && m.media_url ? <Pic src={src} mine={mine} label={m.viewed_once_at ? t('لمرة وحدة · انشافت') : t('لمرة وحدة')} /> :
                 m.kind === 'voice' && m.media_url ? <VoiceBubble path={m.media_url} seconds={Number(m.body) || 0} mine={mine} /> :
                 m.kind === 'sticker' ? <StickerBubble m={m} /> :
                 m.kind === 'file' && m.media_url ? <FileBubble m={m} mine={mine} /> :
                 m.kind === 'location' ? <LocationBubble m={m} mine={mine} /> :
                 m.kind === 'contact' ? <ContactBubble m={m} mine={mine} /> :
                 m.kind === 'poll' ? <PollBubble m={m} mine={mine} /> :
                 plain ? (
                  <View style={[{ paddingHorizontal: 14, paddingVertical: 10 }, bubble(mine)]}>
                    {m.kind === 'story_reply' && <T v="tiny" color={inkOn(mine)} style={{ opacity: 0.7 }}>{t('ردّ على ستوري')}</T>}
                    <T v="body" color={inkOn(mine)} style={{ fontSize: 15, lineHeight: 22, fontFamily: mine ? F.bodyMd : F.body }}>{m.body ?? ''}</T>
                  </View>
                 ) : null}
              </Pressable>
              <ReactionChips list={reacts[m.id] ?? []} mine={mine} onPress={() => {}} />
              {(endOfRun || m.deleted_at || vanished || m.is_saved) && (
                <T v="tiny" color={m.deleted_at ? C.red : C.faint} style={{ fontSize: 11, alignSelf: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}>
                  {[timeAgo(m.created_at), m.deleted_at ? t('محذوفة') : vanished ? t('اختفت عند المستخدمين') : null, m.is_saved ? t('محفوظة') : null].filter(Boolean).join(' · ')}
                </T>
              )}
            </View>
          </View>
        );
      })}
    </View>
  );
}
