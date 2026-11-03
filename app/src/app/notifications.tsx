import { router } from 'expo-router';
import { Bell, CalendarDays, Heart, MessageCircle, Repeat, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Button, Chip, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/util';

type N = { id: string; kind: string; title: string; body: string | null; data: Record<string, string>; read_at: string | null; created_at: string };
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
      supabase.from('follows').select('follower_id, profile:profiles!follows_follower_id_fkey(id, full_name, avatar_url, major:majors(name_ar))').eq('followee_id', (profile?.id ?? '')).eq('status', 'pending'),
    ]);
    setItems((n ?? []) as N[]); setReqs((f ?? []) as unknown as FR[]); setLoading(false);
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', (profile?.id ?? '')).is('read_at', null);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  async function answer(r: FR, accept: boolean) {
    if (accept) await supabase.from('follows').update({ status: 'accepted' }).eq('follower_id', r.follower_id).eq('followee_id', (profile?.id ?? ''));
    else await supabase.from('follows').delete().eq('follower_id', r.follower_id).eq('followee_id', (profile?.id ?? ''));
    setReqs((x) => x.filter((y) => y.follower_id !== r.follower_id));
  }

  const study = ['swap_match', 'exam', 'lecture', 'assignment'];
  const shown = items.filter((n) => filter === 'all' || (filter === 'study' ? study.includes(n.kind) : !study.includes(n.kind)));

  return (
    <Screen>
      <Header title="الإشعارات" />
      <FlatList
        data={shown}
        keyExtractor={(n) => n.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, gap: 6 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <Row gap={8}>
              <Chip label="الكل" active={filter === 'all'} onPress={() => setFilter('all')} />
              <Chip label="دراسة" active={filter === 'study'} onPress={() => setFilter('study')} />
              <Chip label="اجتماعي" active={filter === 'social'} onPress={() => setFilter('social')} />
            </Row>
            {filter !== 'study' && reqs.map((r) => (
              <Row key={r.follower_id} gap={12} style={{ backgroundColor: C.card, borderRadius: 22, padding: 12 }}>
                <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.follower_id } })}><Avatar id={r.follower_id} name={r.profile?.full_name} url={r.profile?.avatar_url} size={46} /></Tap>
                <View style={{ flex: 1 }}>
                  <T v="small"><T v="bold" style={{ fontSize: 14 }}>{r.profile?.full_name}</T> بده يتابعك</T>
                  <T v="tiny" color={C.muted}>{r.profile?.major?.name_ar ?? ''}</T>
                </View>
                <Button title="قبول" onPress={() => answer(r, true)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
                <Button kind="soft" title="رفض" onPress={() => answer(r, false)} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 12 }} />
              </Row>
            ))}
          </View>
        }
        renderItem={({ item, index }) => {
          const [Icon, color] = ICON[item.kind] ?? [Bell, C.primary];
          return (
            <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 30)}>
              <Tap scale={0.98} onPress={() => item.kind === 'swap_match' ? router.push('/swap') : item.data?.post_id ? router.push({ pathname: '/post/[id]', params: { id: item.data.post_id } }) : item.data?.user_id ? router.push({ pathname: '/user/[id]', params: { id: item.data.user_id } }) : null}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 12 }}>
                <View style={{ width: 42, height: 42, borderRadius: 15, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={C.white} /></View>
                <View style={{ flex: 1 }}>
                  <T v="small">{item.title}{item.body ? ` · ${item.body}` : ''}</T>
                  <T v="tiny" color={C.muted}>{timeAgo(item.created_at)}</T>
                </View>
                {!item.read_at && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary }} />}
              </Tap>
            </Animated.View>
          );
        }}
        ListEmptyComponent={loading || reqs.length ? undefined : <Empty icon={<Bell size={28} color={C.primary} />} title="ما في إشعارات" body="بنخبرك هون بالمحاضرات والامتحانات والتبديلات والتعليقات." />}
      />
    </Screen>
  );
}
