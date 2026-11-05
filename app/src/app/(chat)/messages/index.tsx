import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BadgeCheck, BookOpen, Camera, Inbox as InboxIcon, MessageCircle, PenSquare, Plus, Search, Users, UsersRound } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeInDown, FadeOutLeft } from 'react-native-reanimated';

import { TitleBadge } from '@/components/profile/TitleBadge';
import { PushNudge } from '@/components/shell/PushNudge';
import { OnlineDot } from '@/components/chat/OnlineDot';
import { useInboxTyping } from '@/lib/presence';
import { Avatar, Button, Empty, Header, IconButton, Row, Screen, StateView, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { optimistic } from '@/lib/run';
import { inviteFriends } from '@/lib/invite';
import { supabase } from '@/lib/supabase';
import { C, F, R, isDark } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t, ta } from '@/lib/i18n';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useScreenTimer } from '@/lib/perf';

type Person = { id: string; full_name: string; avatar_url: string | null; is_verified?: boolean; academic_title?: string | null; title_verified?: boolean };
type Item = {
  id: string; kind: string; course?: boolean; title: string; other?: Person | null; state: string; created_by: string | null;
  last?: string | null; last_at: string; unread: boolean; count?: number; streak: number; context?: string | null;
};

const TABS = [t('الكل'), t('المواد'), t('المجموعات'), t('الطلبات')] as const;
type Note = { user_id: string; body: string };

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
  const isTyping = useInboxTyping(profile?.id);
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [friends, setFriends] = useState<Person[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  useScreenTimer('inbox', !loading);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true); setFailed(false);
    try {
    const { data: mine } = await supabase.from('conversation_members')
      .select('state, last_read_at, conversation:conversations(id, kind, title, context_label, streak_days, last_message_at, created_by, community:communities(kind))')
      .eq('user_id', profile.id).neq('state', 'left');
     
    const rows = ((mine ?? []) as any[]).filter((r) => r.conversation);
    const ids = rows.map((r) => r.conversation.id);
    const [{ data: members }, { data: lasts }, { data: counts }] = ids.length ? await Promise.all([
      supabase.from('conversation_members').select('conversation_id, user_id, profile:profiles(id, full_name, avatar_url, is_verified, academic_title, title_verified)').in('conversation_id', ids).neq('user_id', profile.id),
      supabase.rpc('inbox_last_messages', { conv_ids: ids }),
      supabase.rpc('unread_counts', { conv_ids: ids }),
    ]) : [{ data: [] }, { data: [] }, { data: [] }];
    const countBy = new Map(((counts ?? []) as { conversation_id: string; n: number }[]).map((x) => [x.conversation_id, x.n]));
    const lastBy = new Map<string, { kind: string; body: string | null; sender_id: string | null }>();
    for (const m of (lasts ?? []) as { conversation_id: string; kind: string; body: string | null; sender_id: string | null }[]) if (!lastBy.has(m.conversation_id)) lastBy.set(m.conversation_id, m);
    const out: Item[] = rows.map((r) => {
      const c = r.conversation;
       
      const other = c.kind === 'direct' ? ((members ?? []) as any[]).find((m) => m.conversation_id === c.id)?.profile ?? null : null;
      return {
        id: c.id, kind: c.kind, course: c.community?.kind === 'course_section', state: r.state, created_by: c.created_by, title: other?.full_name ?? c.title ?? t('محادثة'), other, context: c.context_label,
        last: preview(lastBy.get(c.id)) ?? c.context_label, last_at: c.last_message_at,
        // my own last message is never "unread"
        // unread = real messages from others after I last opened the chat (an empty group isn't "unread")
        unread: (countBy.get(c.id) ?? 0) > 0, streak: c.streak_days, count: countBy.get(c.id) ?? 0,
      };
    });
    out.sort((a, b) => (b.last_at ?? '').localeCompare(a.last_at ?? ''));
    setItems(out);
    // mutual friends for the quick row
    const { data: f } = await supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, full_name, avatar_url, is_verified, academic_title, title_verified)').eq('follower_id', profile.id).eq('status', 'accepted').limit(30);
     
    const fr: Person[] = ((f ?? []) as any[]).map((x) => x.p).filter(Boolean);
    // people you chat with directly also show in the notes row
    for (const it of out) if (it.other && !fr.some((p) => p.id === it.other!.id)) fr.push(it.other);
    const { data: ns } = await supabase.from('notes').select('user_id, body').in('user_id', [profile.id, ...fr.map((p) => p.id)]).gt('expires_at', new Date().toISOString());
    const nb = Object.fromEntries(((ns ?? []) as Note[]).map((n) => [n.user_id, n.body]));
    setNotes(nb);
    // friends with a note first
    setFriends(fr.sort((a, b) => Number(!!nb[b.id]) - Number(!!nb[a.id])));
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

  async function saveNote(clear?: boolean) {
    if (!profile || noteBusy) return;
    const body = noteText.trim();
    if (!clear && !body) return;
    setNoteBusy(true);
    const { error } = clear ? await supabase.rpc('clear_note') : await supabase.rpc('set_note', { p_body: body });
    setNoteBusy(false);
    if (error) { reportError(error); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setNotes((n) => { const c = { ...n }; if (clear) delete c[profile.id]; else c[profile.id] = body; return c; });
    setNoteOpen(false);
  }

  const requests = items.filter((i) => i.state === 'request');
  const active = items.filter((i) => i.state === 'active');
  const matches = (i: Item, k: number) => k === 0 ? i.state === 'active' : k === 1 ? i.state === 'active' && !!i.course : k === 2 ? i.state === 'active' && i.kind !== 'direct' && !i.course : i.state === 'request';
  const shown = items.filter((i) => matches(i, tab)).filter((i) => !q || i.title.includes(q));
  const badges = [active.filter((i) => i.unread).length, active.filter((i) => i.course && i.unread).length, active.filter((i) => i.kind !== 'direct' && !i.course && i.unread).length, requests.length];
  const myNote = profile ? notes[profile.id] : undefined;

  return (
    <Screen>
      <Header back={!inTab} title={t('الرسائل')} right={
        <Tap onPress={() => router.push('/messages/new')} accessibilityRole="button" accessibilityLabel={t('رسالة جديدة')}
          style={{ width: 44, height: 44, borderRadius: R.sm, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}>
          <PenSquare size={20} color={C.ink} />
        </Tap>} />
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.primary} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <PushNudge />
            <Row gap={8} style={{ minHeight: 46, borderRadius: R.sm, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, paddingHorizontal: 14 }}>
              <Search size={18} color={C.muted} />
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث عن زميل أو مجموعة')} placeholderTextColor={C.muted} accessibilityLabel={t('بحث في الرسائل')} style={{ flex: 1, fontFamily: F.body, fontSize: 15, textAlign: ta, color: C.ink }} />
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingTop: 4 }}>
              <Tap onPress={() => { setNoteText(myNote ?? ''); setNoteOpen(true); }} accessibilityRole="button" accessibilityLabel={myNote ? t('ملاحظتك: {0}', [myNote]) : t('اكتب ملاحظة')} style={{ width: 76, alignItems: 'center', gap: 6, paddingTop: 34 }}>
                <NoteBubble text={myNote ?? t('ملاحظة؟')} muted={!myNote} />
                <View>
                  <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={62} />
                  {!myNote && <View style={{ position: 'absolute', bottom: -2, left: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Plus size={14} color={C.onPrimary} strokeWidth={3} /></View>}
                </View>
                <T v="tiny" color={C.muted}>{t('ملاحظتك')}</T>
              </Tap>
              {friends.map((p) => (
                <Tap key={p.id} onPress={() => openWith(p)} style={{ width: 76, alignItems: 'center', gap: 6, paddingTop: 34 }} accessibilityLabel={notes[p.id] ? `${p.full_name}: ${notes[p.id]}` : t('راسل {0}', [p.full_name])}>
                  {notes[p.id] ? (
                    <NoteBubble text={notes[p.id]} />
                  ) : null}
                  <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={62} />
                  <T v="tiny" color={C.muted} numberOfLines={1}>{(p.full_name ?? '').split(' ')[0]}</T>
                </Tap>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TABS.map((tb, i) => {
                const on = tab === i;
                return (
                  <Tap key={tb} onPress={() => setTab(i)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: on ? C.inverse : C.card }}>
                    <T v="bold" style={{ fontSize: 13 }} color={on ? C.onInverse : C.muted}>{tb}</T>
                    {badges[i] > 0 && (i === 3
                      ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.primary }} />
                      : <View style={{ minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><T v="tiny" color={C.onPrimary} style={{ fontSize: 10 }}>{badges[i]}</T></View>)}
                  </Tap>
                );
              })}
            </ScrollView>
            {tab === 3 && shown.length > 0 && <T v="tiny" color={C.muted}>{t('المرسل ما بيعرف إذا شفت رسالته. لما تتابعوا بعض، الطلب بينقل للرئيسية لحاله.')}</T>}
            {tab === 2 && <Button kind="soft" title={t('جروب جديد')} icon={<UsersRound size={18} color={C.primaryDark} />} onPress={() => router.push({ pathname: '/messages/new', params: { group: '1' } })} style={{ minHeight: 44 }} />}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 35)} exiting={FadeOutLeft}>
            <Tap scale={0.985} haptic={false} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72, paddingVertical: 8 }}>
              {item.kind === 'direct' ? <View><Avatar id={item.other?.id} name={item.title} url={item.other?.avatar_url} size={54} /><OnlineDot id={item.other?.id} /></View>
                : <GroupAvatar kind={item.course ? 'course' : item.kind === 'community' ? 'community' : 'group'} />}
              <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                <Row gap={5}>
                  <T v={item.unread ? 'bold' : 'bodyMd'} numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>{item.title}</T>
                  {item.other?.is_verified && <BadgeCheck size={14} color={C.onPrimary} fill={C.primary} />}
                  <TitleBadge title={item.other?.academic_title} verified={item.other?.title_verified} />
                  {item.streak > 1 && <T v="tiny" color="#E8590C">🔥{item.streak}</T>}
                </Row>
                <Row gap={4}>
                  {isTyping(item.id) ? <T v="small" numberOfLines={1} color={C.primaryDark}>{t('عم يكتب…')}</T>
                    : <T v="small" numberOfLines={1} style={{ flexShrink: 1 }} color={item.unread ? C.ink : C.muted}>{item.last ?? (item.kind === 'community' ? t('جروب تلقائي') : '')}</T>}
                  {item.last_at ? <T v="small" color={C.faint}>{(item.last ?? (item.kind === 'community' ? 'x' : '')) ? '· ' : ''}{timeAgo(item.last_at)}</T> : null}
                </Row>
                {item.state === 'request' && (
                  <Row gap={8} style={{ marginTop: 6 }}>
                    <Button title={t('قبول')} onPress={() => answer(item.id, true)} style={{ flex: 1, minHeight: 40 }} />
                    <Button kind="soft" title={t('تجاهل')} onPress={() => answer(item.id, false)} style={{ flex: 1, minHeight: 40 }} />
                  </Row>
                )}
              </View>
              {item.unread && (item.count ?? 0) > 0 ? (
                <View style={{ minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="tiny" color={C.onPrimary} style={{ fontSize: 11 }}>{(item.count ?? 0) >= 99 ? '99+' : item.count}</T>
                </View>
              ) : item.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.primary }} />
                : item.kind === 'direct' && item.state === 'active' ? <Camera size={22} color={C.faint} strokeWidth={1.8} /> : null}
            </Tap>
          </Animated.View>
        )}
        ListEmptyComponent={loading ? <ListSkeleton n={6} /> : failed ? <StateView error onRetry={load} /> : tab === 3
          ? <Empty icon={<InboxIcon size={28} color={C.primary} />} title={t('ما في طلبات')} body={t('لما حدا ما بتتابعه يراسلك، بيوصل هون أول.')} />
          : tab === 1 ? <Empty icon={<BookOpen size={28} color={C.primary} />} title={t('ما في جروبات مواد')} body={t('بتنضاف لجروب كل شعبة لما تضيف موادك بالجدول.')} />
          : tab === 2 ? <Empty icon={<Users size={28} color={C.primary} />} title={t('ما في جروبات لهلأ')} body={t('بتنضاف لحالك لجروب كليتك وتخصصك ودفعتك لما تكمّل معلوماتك.')} />
          : <Empty icon={<MessageCircle size={28} color={C.primary} />} title={t('ما في محادثات لهلأ')} body={t('اكبس على القلم فوق وابدأ مع زميل.')}
              action={<Button kind="soft" title={t('ادعي زملاءك')} onPress={() => inviteFriends()} style={{ marginTop: 10, paddingHorizontal: 20 }} />} />}
      />
      <Modal visible={noteOpen} transparent animationType="fade" onRequestClose={() => setNoteOpen(false)}>
        <Pressable onPress={() => setNoteOpen(false)} style={{ flex: 1, backgroundColor: C.overlay }} accessibilityLabel={t('إغلاق')} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
          <View style={{ backgroundColor: C.card, borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl, padding: 18, paddingBottom: 34, gap: 14 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: C.line }} />
            <T v="h3" style={{ textAlign: 'center' }}>{t('ملاحظة لأصحابك')}</T>
            <T v="tiny" color={C.muted} style={{ textAlign: 'center' }}>{t('بتطلع فوق صورتك بالرسائل، وبتختفي بعد ٢٤ ساعة.')}</T>
            <TextInput autoFocus value={noteText} onChangeText={(v) => setNoteText(v.slice(0, 60))} maxLength={60} placeholder={t('شو بالك؟')} placeholderTextColor={C.muted}
              keyboardAppearance={isDark ? 'dark' : 'light'} accessibilityLabel={t('الملاحظة')}
              style={{ minHeight: 52, borderRadius: R.sm, backgroundColor: C.soft, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink, textAlign: ta }} />
            <T v="tiny" color={C.muted} style={{ textAlign: 'left' }}>{noteText.length}/60</T>
            <Button title={t('شارك')} loading={noteBusy} disabled={!noteText.trim()} onPress={() => saveNote()} />
            {myNote ? <Button kind="ghost" title={t('احذف الملاحظة')} disabled={noteBusy} onPress={() => saveNote(true)} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Screen>
  );
}

/** Instagram-style note: a small rounded bubble floating over the top of the avatar, one or two short lines. */
function NoteBubble({ text, muted }: { text: string; muted?: boolean }) {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: -4, right: -4, alignItems: 'center', zIndex: 2 }}>
      <View style={{ maxWidth: 84, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
        <T v="tiny" numberOfLines={2} color={muted ? C.muted : C.ink} style={{ fontSize: 11, lineHeight: 15, textAlign: 'center' }}>{text}</T>
      </View>
      <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: -3, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }} />
    </View>
  );
}

/** Flat round avatar for group chats: course groups, communities and friend groups each get their own soft colour. */
function GroupAvatar({ kind }: { kind: 'course' | 'community' | 'group' }) {
  const [bg, fg, Icon] = kind === 'course' ? [C.primarySoft, C.primary, BookOpen] : kind === 'community' ? [C.greenSoft, C.green, Users] : [C.violetSoft, C.violet, UsersRound];
  return (
    <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon size={24} color={fg} strokeWidth={2} />
    </View>
  );
}
