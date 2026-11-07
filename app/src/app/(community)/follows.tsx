import { router, useLocalSearchParams } from 'expo-router';
import { Search } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { TitleBadge, titledName } from '@/components/profile/TitleBadge';
import { Avatar, Button, Empty, Header, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { fmtCount } from '@/lib/util';

type P = { id: string; full_name: string; avatar_url: string | null; username: string | null; academic_title?: string | null; title_verified?: boolean; major: { name_ar: string } | null };

/** Followers / following lists, like Instagram, and a third: my friends (we follow each other) on my own list, or the people we both know on someone else's. Hidden lists are blocked by the profile owner's privacy settings. */
export default function Follows() {
  const params = useLocalSearchParams<{ user: string; type?: string; name?: string }>();
  const { profile } = useAuth();
  const [tab, setTab] = useState(params.type === 'following' ? 1 : params.type === 'friends' ? 2 : 0);
  const mine = params.user === profile?.id;
  const [rows, setRows] = useState<P[]>([]);
  const [mineFollow, setMineFollow] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  // the numbers on the tabs, the same ones the profile shows
  const [counts, setCounts] = useState<[number, number] | null>(null);
  useEffect(() => {
    supabase.from('profiles').select('follower_count, following_count, shown_followers, shown_following').eq('id', params.user).maybeSingle()
      .then(({ data }) => { if (data) setCounts([data.shown_followers ?? data.follower_count, data.shown_following ?? data.following_count]); }, () => {});
  }, [params.user]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      // friends (my own list) or people in common (someone else's): their followers whom I follow too
      const followers = tab !== 1;
      const sel = followers
        ? 'p:profiles!follows_follower_id_fkey(id, full_name, avatar_url, username, academic_title, title_verified, major:majors!profiles_major_id_fkey(name_ar, name_en))'
        : 'p:profiles!follows_followee_id_fkey(id, full_name, avatar_url, username, academic_title, title_verified, major:majors!profiles_major_id_fkey(name_ar, name_en))';
      const { data } = await supabase.from('follows').select(sel).eq(followers ? 'followee_id' : 'follower_id', params.user).eq('status', 'accepted').limit(500);
       
      const list: P[] = ((data ?? []) as any[]).map((x) => x.p).filter(Boolean);
      let mineF = new Set<string>();
      if (profile) {
        const { data: f } = await supabase.from('follows').select('followee_id').eq('follower_id', profile.id).eq('status', 'accepted');
        mineF = new Set((f ?? []).map((x) => x.followee_id));
        setMineFollow(mineF);
      }
      setRows(tab === 2 ? list.filter((r) => mineF.has(r.id) && r.id !== profile?.id) : list);
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
      <Header title={params.name || t('المتابعات')} />
      <View style={{ paddingHorizontal: 18, gap: 10 }}>
        <Segmented items={[...(counts ? [t('{0} متابِع', [fmtCount(counts[0])]), t('{0} يتابع', [fmtCount(counts[1])])] : [t('المتابِعون'), t('يتابع')]), mine ? t('الأصدقاء') : t('مشتركون')]}
          value={tab} onChange={setTab} />
        <Row gap={8} style={{ minHeight: 44, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
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
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1 }}>{titledName(item.full_name, item.academic_title, item.title_verified)}</T>
                  <TitleBadge title={item.academic_title} verified={item.title_verified} />
                </View>
                <T v="tiny" color={C.muted} numberOfLines={1}>{item.username ? `@${item.username}` : nm(item.major) ?? ''}</T>
              </View>
            </Tap>
            {item.id !== profile?.id && (
              <Button kind={mineFollow.has(item.id) ? 'soft' : 'primary'} title={mineFollow.has(item.id) ? t('تتابعه') : t('متابعة')} onPress={() => toggle(item.id)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
            )}
          </Row>
        )}
        ListEmptyComponent={loading ? <ListSkeleton n={6} /> : <Empty title={tab === 0 ? t('لا يوجد متابعون حتى الآن') : tab === 1 ? t('لا يتابع أحدًا حتى الآن') : mine ? t('لا أصدقاء بعد') : t('لا متابعين مشتركين')}
          body={tab === 2 ? (mine ? t('الأصدقاء هم من تتابعهم ويتابعونك.') : t('هنا من تتابعهم ويتابعون هذا الحساب أيضًا.')) : undefined} />}
      />
    </Screen>
  );
}
