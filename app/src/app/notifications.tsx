import { router, useFocusEffect } from 'expo-router';
import { Bell, CalendarDays, Heart, MessageCircle, Repeat, UserPlus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Button, Chip, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { isAR, nm, t } from '@/lib/i18n';
import { ListSkeleton } from '@/components/Skeleton';
import { run } from '@/lib/run';

// Server-made notification texts are Arabic; show them in English when the app is in English.
const NOTE_EN: [RegExp, string][] = [
  [/^حدا /, 'Someone '], [/ عجبه منشورك$/, ' liked your post'], [/ علّق على منشورك$/, ' commented on your post'],
  [/ صار يتابعك$/, ' started following you'], [/ قبل طلب متابعتك$/, ' accepted your follow request'],
  [/^لقينا تبديل مطابق$/, 'We found a matching swap'], [/^في حدا بدّه نفس التبديل بالعكس$/, 'Someone wants the same swap the other way'],
];
function localizeNote(s: string) { return isAR ? s : NOTE_EN.reduce((x, [re, en]) => x.replace(re, en), s); }

type N = { id: string; kind: string; title: string; body: string | null; data: Record<string, string>; read_at: string | null; created_at: string; actor_id?: string | null };
type FR = { follower_id: string; profile: { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null } | null };

const ICON: Record<string, [typeof Bell, string]> = {
  swap_match: [Repeat, C.green], comment: [MessageCircle, C.violet], like: [Heart, C.pink], follow: [UserPlus, C.primary], exam: [CalendarDays, C.orange],
};

export default function Notifications() {
  const { profile } = useAuth();
  const [items, setItems] = useState<N[]>([]);
  const [reqs, setReqs] = useState<FR[]>([]);
  const [filter, setFilter] = useState<'all' | 'study' | 'social'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const [{ data: n }, { data: f }] = await Promise.all([
      supabase.from('notifications').select('*').eq('user_id', (profile?.id ?? '')).order('created_at', { ascending: false }).limit(60),
      supabase.from('follows').select('follower_id, profile:profiles!follows_follower_id_fkey(id, full_name, avatar_url, major:majors(name_ar, name_en))').eq('followee_id', (profile?.id ?? '')).eq('status', 'pending'),
    ]);
    setItems((n ?? []) as N[]); setReqs((f ?? []) as unknown as FR[]); setLoading(false);
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile.id).is('read_at', null);
    // the dots disappear on screen too, after a moment so you can see what is new
    if (!error) setTimeout(() => setItems((x) => x.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() }))), 2500);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [busy, setBusy] = useState<string | null>(null);
  async function answer(r: FR, accept: boolean) {
    if (!profile || busy) return;
    setBusy(r.follower_id);
    const res = accept
      ? await run(supabase.from('follows').update({ status: 'accepted' }).eq('follower_id', r.follower_id).eq('followee_id', profile.id))
      : await run(supabase.from('follows').delete().eq('follower_id', r.follower_id).eq('followee_id', profile.id));
    setBusy(null);
    if (res.ok) setReqs((x) => x.filter((y) => y.follower_id !== r.follower_id));
  }

  /** Where each kind of notification takes you. */
  function open(n: N) {
    const d = n.data ?? {};
    if (n.kind === 'swap_match') return router.push('/swap');
    if (['exam', 'lecture', 'assignment', 'event', 'summary'].includes(n.kind)) return router.push('/(tabs)/schedule');
    if ((n.kind === 'message' || n.kind === 'call') && d.conversation_id) return router.push({ pathname: '/messages/[id]', params: { id: d.conversation_id } });
    if (n.kind === 'message_request') return router.push('/messages/requests');
    if (n.kind === 'study' || n.kind === 'study_request') return router.push('/study');
    if (d.post_id) return router.push({ pathname: '/post/[id]', params: { id: d.post_id } });
    if (d.user_id) return router.push({ pathname: '/user/[id]', params: { id: d.user_id } });
    if (n.actor_id) return router.push({ pathname: '/user/[id]', params: { id: n.actor_id } });
  }

  const study = ['swap_match', 'exam', 'lecture', 'assignment'];
  const shown = items.filter((n) => filter === 'all' || (filter === 'study' ? study.includes(n.kind) : !study.includes(n.kind)));

  return (
    <Screen>
      <Header title={t('الإشعارات')} />
      <FlatList
        data={shown}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, gap: 6 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <Row gap={8}>
              <Chip label={t('الكل')} active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label={t('دراسة')} active={filter === 'study'} onPress={() => setFilter('study')} />
              <Chip label={t('اجتماعي')} active={filter === 'social'} onPress={() => setFilter('social')} />
            </Row>
            {filter !== 'study' && reqs.map((r) => (
              <Row key={r.follower_id} gap={12} style={{ backgroundColor: C.card, borderRadius: 22, padding: 12 }}>
                <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.follower_id } })}><Avatar id={r.follower_id} name={r.profile?.full_name} url={r.profile?.avatar_url} size={46} /></Tap>
                <View style={{ flex: 1 }}>
                  <T v="small"><T v="bold" style={{ fontSize: 14 }}>{r.profile?.full_name}</T> {t('بده يتابعك')}</T>
                  <T v="tiny" color={C.muted}>{nm(r.profile?.major)}</T>
                </View>
                <Button title={t('قبول')} loading={busy === r.follower_id} disabled={!!busy} onPress={() => answer(r, true)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
                <Button kind="soft" title={t('رفض')} disabled={!!busy} onPress={() => answer(r, false)} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 12 }} />
              </Row>
            ))}
          </View>
        }
        renderItem={({ item, index }) => {
          const [Icon, color] = ICON[item.kind] ?? [Bell, C.primary];
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30)}>
              <Tap scale={0.98} onPress={() => open(item)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={C.white} /></View>
                <View style={{ flex: 1 }}>
                  <T v="small">{localizeNote(item.title)}{item.body ? ` · ${localizeNote(item.body)}` : ''}</T>
                  <T v="tiny" color={C.muted}>{timeAgo(item.created_at)}</T>
                </View>
                {!item.read_at && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary }} />}
              </Tap>
            </Animated.View>
          );
        }}
        ListEmptyComponent={reqs.length ? undefined : loading ? <ListSkeleton n={6} /> : <Empty icon={<Bell size={28} color={C.primary} />} title={t('ما في إشعارات')} body={t('بنخبرك هون بالمحاضرات والامتحانات والتبديلات والتعليقات.')} />}
      />
    </Screen>
  );
}
