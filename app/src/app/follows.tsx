import { router, useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { Avatar, Button, Empty, Header, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';
import { ListSkeleton } from '@/components/Skeleton';

type P = { id: string; full_name: string; avatar_url: string | null; username: string | null; major: { name_ar: string } | null };

/** Followers / following lists, like Instagram. Hidden lists are blocked by the profile owner's privacy settings. */
export default function Follows() {
  const params = useLocalSearchParams<{ user: string; type?: string; name?: string }>();
  const { profile } = useAuth();
  const [tab, setTab] = useState(params.type === 'following' ? 1 : 0);
  const [rows, setRows] = useState<P[]>([]);
  const [mineFollow, setMineFollow] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const followers = tab === 0;
      const sel = followers
        ? 'p:profiles!follows_follower_id_fkey(id, full_name, avatar_url, username, major:majors(name_ar, name_en))'
        : 'p:profiles!follows_followee_id_fkey(id, full_name, avatar_url, username, major:majors(name_ar, name_en))';
      const { data } = await supabase.from('follows').select(sel).eq(followers ? 'followee_id' : 'follower_id', params.user).eq('status', 'accepted').limit(500);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setRows(((data ?? []) as any[]).map((x) => x.p).filter(Boolean));
      if (profile) {
        const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', profile.id);
        setMineFollow(new Set((f ?? []).map((x) => x.followee_id)));
      }
      setLoading(false);
    })();
  }, [tab, params.user, profile]);

  async function toggle(id: string) {
    if (!profile) return;
    const on = mineFollow.has(id);
    setMineFollow((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
    if (on) await supabase.from('follows').delete().eq('follower_id', profile.id).eq('followee_id', id);
    else await supabase.from('follows').insert({ follower_id: profile.id, followee_id: id });
  }

  const shown = useMemo(() => (q.trim() ? rows.filter((r) => r.full_name.includes(q.trim()) || (r.username ?? '').includes(q.trim().toLowerCase())) : rows), [rows, q]);

  return (
    <Screen>
      <Header title={params.name ?? ''} />
      <View style={{ paddingHorizontal: 18, gap: 10 }}>
        <Segmented items={[t('المتابِعين'), t('يتابع')]} value={tab} onChange={setTab} />
        <Row gap={8} style={{ minHeight: 44, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('دوّر')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
        </Row>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 18, gap: 6 }}
        renderItem={({ item }) => (
          <Row gap={12} style={{ backgroundColor: C.card, borderRadius: 18, padding: 10 }}>
            <Tap haptic={false} scale={0.98} onPress={() => router.push({ pathname: '/user/[id]', params: { id: item.id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar id={item.id} name={item.full_name} url={item.avatar_url} size={46} />
              <View style={{ flex: 1 }}>
                <T v="bodyMd" numberOfLines={1}>{item.full_name}</T>
                <T v="tiny" color={C.muted} numberOfLines={1}>{item.username ? `@${item.username}` : nm(item.major) ?? ''}</T>
              </View>
            </Tap>
            {item.id !== profile?.id && (
              <Button kind={mineFollow.has(item.id) ? 'soft' : 'primary'} title={mineFollow.has(item.id) ? t('تتابعه') : t('متابعة')} onPress={() => toggle(item.id)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
            )}
          </Row>
        )}
        ListEmptyComponent={loading ? <ListSkeleton n={6} /> : <Empty title={tab === 0 ? t('ما في متابعين لهلأ') : t('ما بيتابع حدا لهلأ')} />}
      />
    </Screen>
  );
}
