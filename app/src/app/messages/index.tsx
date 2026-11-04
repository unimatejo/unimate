import { router, useFocusEffect } from 'expo-router';
import { BadgeCheck, Camera, Inbox as InboxIcon, MessageCircle, PenSquare, Search, Users, UsersRound } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutLeft, LinearTransition } from 'react-native-reanimated';

import { GlyphTile } from '@/components/Glyph';
import { PushNudge } from '@/components/PushNudge';
import { Avatar, Button, Empty, Header, IconButton, Row, Screen, StateView, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { optimistic } from '@/lib/run';
import { inviteFriends } from '@/lib/invite';
import { supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t, ta } from '@/lib/i18n';
import { ListSkeleton } from '@/components/Skeleton';

type Person = { id: string; full_name: string; avatar_url: string | null; is_verified?: boolean };
type Item = {
  id: string; kind: string; title: string; other?: Person | null; state: string; created_by: string | null;
  last?: string | null; last_at: string; unread: boolean; count?: number; streak: number; context?: string | null;
};

const TABS = [t('الرئيسية'), t('الطلبات'), t('الجروبات')] as const;

function preview(m?: { kind: string; body: string | null } | null) {
  if (!m) return null;
  return m.kind === 'image' ? t('📷 صورة') : m.kind === 'view_once' ? t('📸 صورة بتنشاف مرة') : m.kind === 'voice' ? t('🎤 رسالة صوتية')
    : m.kind === 'post_share' ? t('شارك منشور') : m.kind === 'story_reply' ? t('رد على قصتك: {0}', [m.body ?? ''])
    : m.kind === 'sticker' ? t('ستيكر') : m.kind === 'file' ? t('📄 ملف') : m.kind === 'location' ? t('📍 موقع') : m.kind === 'contact' ? t('👤 حساب: {0}', [m.body ?? ''])
    : m.kind === 'poll' ? t('📊 استطلاع رأي') : m.body;
}

/** Inbox like Instagram: chats with people you know, message requests, and groups (auto groups for your college, major and cohort). */
export default function Messages() { return <Inbox />; }

export function Inbox({ inTab }: { inTab?: boolean }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [friends, setFriends] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setFailed(false);
    try {
    const { data: mine } = await supabase.from('conversation_members')
      .select('state, last_read_at, conversation:conversations(id, kind, title, context_label, streak_days, last_message_at, created_by)')
      .eq('user_id', profile.id).neq('state', 'left');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = ((mine ?? []) as any[]).filter((r) => r.conversation);
    const ids = rows.map((r) => r.conversation.id);
    const [{ data: members }, { data: lasts }, { data: counts }] = ids.length ? await Promise.all([
      supabase.from('conversation_members').select('conversation_id, user_id, profile:profiles(id, full_name, avatar_url, is_verified)').in('conversation_id', ids).neq('user_id', profile.id),
      supabase.rpc('inbox_last_messages', { conv_ids: ids }),
      supabase.rpc('unread_counts', { conv_ids: ids }),
    ]) : [{ data: [] }, { data: [] }, { data: [] }];
    const countBy = new Map(((counts ?? []) as { conversation_id: string; n: number }[]).map((x) => [x.conversation_id, x.n]));
    const lastBy = new Map<string, { kind: string; body: string | null; sender_id: string | null }>();
    for (const m of (lasts ?? []) as { conversation_id: string; kind: string; body: string | null; sender_id: string | null }[]) if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m);
    const out: Item[] = rows.map((r) => {
      const c = r.conversation;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const other = c.kind === 'direct' ? ((members ?? []) as any[]).find((m) => m.conversation_id === c.id)?.profile ?? null : null;
      return {
        id: c.id, kind: c.kind, state: r.state, created_by: c.created_by, title: other?.full_name ?? c.title ?? t('محادثة'), other, context: c.context_label,
        last: preview(lastBy.get(c.id)) ?? c.context_label, last_at: c.last_message_at,
        // my own last message is never "unread"
        // unread = real messages from others after I last opened the chat (an empty group isn't "unread")
        unread: (countBy.get(c.id) ?? 0) > 0, streak: c.streak_days, count: countBy.get(c.id) ?? 0,
      };
    });
    out.sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''));
    setItems(out);
    // mutual friends for the quick row
    const { data: f } = await supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, full_name, avatar_url, is_verified)').eq('follower_id', profile.id).eq('status', 'accepted').limit(30);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setFriends(((f ?? []) as any[]).map((x) => x.p).filter(Boolean));
    } catch (e) {
      reportError(e); setFailed(true);
    } finally { setLoading(false); }
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function answer(id: string, accept: boolean) {
    const prev = items;
    const ok = await optimistic(`answer-${id}`,
      () => setItems((all) => all.map((x) => (x.id === id ? { ...x, state: accept ? 'active' : 'left' } : x))),
      () => setItems(prev),
      () => supabase.rpc('answer_request', { conv: id, accept }));
    if (ok && accept) router.push({ pathname: '/messages/[id]', params: { id } });
  }

  async function openWith(p: Person) {
    const { data } = await supabase.rpc('start_direct', { target: p.id, context: null });
    if (data) router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  const requests = items.filter((i) => i.state === 'request');
  const shown = items.filter((i) => i.state !== 'left' && (tab === 0 ? i.kind === 'direct' && i.state === 'active' : tab === 1 ? i.state === 'request' : i.kind !== 'direct' && i.state === 'active'))
    .filter((i) => !q || i.title.includes(q));
  const unreadDirect = items.filter((i) => i.kind === 'direct' && i.state === 'active' && i.unread).length;
  const unreadGroups = items.filter((i) => i.kind !== 'direct' && i.state === 'active' && i.unread).length;
  const badges = [unreadDirect, requests.length, unreadGroups];

  return (
    <Screen>
      <Header back={!inTab} title={profile?.username ? `\u200E@${profile.username}` : t('الرسائل')} right={<IconButton label={t('رسالة جديدة')} onPress={() => router.push('/messages/new')}><PenSquare size={20} color={C.ink} /></IconButton>} />
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120, gap: 2 }}
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 6 }}>
            <PushNudge />
            <Row gap={8} style={{ minHeight: 46, borderRadius: 15, backgroundColor: C.soft, paddingHorizontal: 14 }}>
              <Search size={19} color={C.muted} />
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث بالمحادثات')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 15, textAlign: ta, color: C.ink }} />
            </Row>
            {tab === 0 && friends.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 4 }}>
                {friends.map((p) => (
                  <Tap key={p.id} onPress={() => openWith(p)} style={{ alignItems: 'center', gap: 5, width: 64 }} accessibilityLabel={t('راسل {0}', [p.full_name])}>
                    <View style={[{ padding: 2.5, borderRadius: 34, backgroundColor: C.card }, shadow]}><Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={60} /></View>
                    <T v="tiny" numberOfLines={1}>{(p.full_name ?? '').split(' ')[0]}</T>
                  </Tap>
                ))}
              </ScrollView>
            )}
            <Row gap={8}>
              {TABS.map((tb, i) => (
                <Tap key={tb} onPress={() => setTab(i)} accessibilityRole="tab" accessibilityState={{ selected: tab === i }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: tab === i ? C.inverse : C.card }}>
                  <T v="bold" style={{ fontSize: 14 }} color={tab === i ? C.onInverse : C.ink}>{tb}</T>
                  {badges[i] > 0 && <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: i === 1 ? C.pink : C.primary, alignItems: 'center', justifyContent: 'center' }}><T v="tiny" color={C.white} style={{ fontSize: 11 }}>{badges[i]}</T></View>}
                </Tap>
              ))}
            </Row>
            {tab === 1 && shown.length > 0 && <T v="tiny" color={C.muted}>{t('المرسل ما بيعرف إذا شفت رسالته. لما تتابعوا بعض، الطلب بينقل للرئيسية لحاله.')}</T>}
            {tab === 2 && <Button kind="soft" title={t('جروب جديد')} icon={<UsersRound size={18} color={C.primary} />} onPress={() => router.push({ pathname: '/messages/new', params: { group: '1' } })} style={{ minHeight: 44 }} />}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35)} exiting={FadeOutLeft} layout={LinearTransition}>
            <Tap scale={0.985} haptic={false} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 72, paddingVertical: 8, borderRadius: 18 }}>
              {item.kind === 'direct' ? <Avatar id={item.other?.id} name={item.title} url={item.other?.avatar_url} size={56} />
                : <GlyphTile icon={item.kind === 'community' ? Users : UsersRound} colors={item.kind === 'community' ? ['#34D399', '#059669'] : ['#A78BFA', '#7C3AED']} size={56} />}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Row gap={5}>
                  <T v={item.unread ? 'bold' : 'bodyMd'} numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>{item.title}</T>
                  {item.other?.is_verified && <BadgeCheck size={14} color={C.white} fill={C.primary} />}
                  {item.streak > 1 && <T v="tiny" color="#E8590C">🔥{item.streak}</T>}
                </Row>
                <Row gap={4}>
                  <T v="small" numberOfLines={1} style={{ flexShrink: 1 }} color={item.unread ? C.ink : C.muted}>{item.last ?? (item.kind === 'community' ? t('جروب تلقائي') : '')}</T>
                  {item.last_at ? <T v="small" color={C.faint}>{(item.last ?? (item.kind === 'community' ? 'x' : '')) ? '· ' : ''}{timeAgo(item.last_at)}</T> : null}
                </Row>
                {item.state === 'request' && (
                  <Row gap={8} style={{ marginTop: 6 }}>
                    <Button title={t('قبول')} onPress={() => answer(item.id, true)} style={{ flex: 1, minHeight: 36, borderRadius: 12 }} />
                    <Button kind="soft" title={t('تجاهل')} onPress={() => answer(item.id, false)} style={{ flex: 1, minHeight: 36, borderRadius: 12 }} />
                  </Row>
                )}
              </View>
              {item.unread && (item.count ?? 0) > 1 ? (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="tiny" color={C.white} style={{ fontSize: 11 }}>{(item.count ?? 0) >= 99 ? '99+' : item.count}</T>
                </View>
              ) : item.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary }} />
                : item.kind === 'direct' && item.state === 'active' ? <Camera size={22} color={C.faint} strokeWidth={1.8} /> : null}
            </Tap>
          </Animated.View>
        )}
        ListEmptyComponent={loading ? <ListSkeleton n={6} /> : failed ? <StateView error onRetry={load} /> : tab === 1
          ? <Empty icon={<InboxIcon size={28} color={C.primary} />} title={t('ما في طلبات')} body={t('لما حدا ما بتتابعه يراسلك، بيوصل هون أول.')} />
          : tab === 2 ? <Empty icon={<Users size={28} color={C.primary} />} title={t('ما في جروبات لهلأ')} body={t('بتنضاف لحالك لجروب كليتك وتخصصك ودفعتك لما تكمّل معلوماتك.')} />
          : <Empty icon={<MessageCircle size={28} color={C.primary} />} title={t('ما في محادثات لهلأ')} body={t('اكبس على القلم فوق وابدأ مع زميل.')}
              action={<Button kind="soft" title={t('ادعي زملاءك')} onPress={() => inviteFriends()} style={{ marginTop: 10, paddingHorizontal: 20 }} />} />}
      />
    </Screen>
  );
}
