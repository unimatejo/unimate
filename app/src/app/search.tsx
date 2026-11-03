import { router } from 'expo-router';
import { BookOpen, Building2, Link as LinkIcon, MapPin, Search as SearchIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Linking, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Avatar, Chip, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';
import { GridTile } from '@/components/ProfileView';
import { SuggestedPeople } from '@/components/SuggestedPeople';
import { POST_SELECT } from '@/lib/posts';
import type { Post } from '@/lib/types';

type R = { kind: string; id: string; title: string; subtitle: string; avatar?: string | null; lat?: number | null };

export default function Search() {
  const { profile, university } = useAuth();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'people' | 'campus'>('all');
  const [rows, setRows] = useState<R[]>([]);
  const [links, setLinks] = useState<{ id: string; title: string; url: string }[]>([]);

  const [explore, setExplore] = useState<Post[]>([]);
  useEffect(() => {
    // most liked recent posts at your university
    supabase.from('posts').select(POST_SELECT).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('like_count', { ascending: false }).order('created_at', { ascending: false }).limit(21)
      .then(({ data }) => setExplore((data ?? []) as unknown as Post[]));
  }, []);

  useEffect(() => {
    if (!university) return;
    supabase.from('university_links').select('id, title, url').eq('university_id', university.id).order('position').then(({ data }) => setLinks(data ?? []));
  }, [university]);

  useEffect(() => {
    const t = setTimeout(async () => {
      const s = q.trim().replace(/^@/, '');
      if (s.length < 2) { setRows([]); return; }
      const out: R[] = [];
      if (kind !== 'campus') {
        const { data } = await supabase.from('profiles').select('id, full_name, username, is_verified, avatar_url, major:majors(name_ar, name_en)').or(`full_name.ilike.%${s.replace(/[,()]/g, ' ')}%,username.ilike.%${s.replace(/^@/, '').replace(/[,()]/g, ' ').toLowerCase()}%`).neq('id', profile?.id ?? '').limit(15);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        out.push(...((data ?? []) as any[]).map((p) => ({ kind: 'person', id: p.id, title: p.full_name, subtitle: [p.username ? '@' + p.username : null, nm(p.major)].filter(Boolean).join(' · '), avatar: p.avatar_url })));
      }
      if (kind !== 'people') {
        const { data } = await supabase.rpc('campus_search', { q: s, lim: 20 });
        out.push(...((data ?? []) as R[]));
      }
      setRows(out);
    }, 250);
    return () => clearTimeout(t);
  }, [q, kind, profile]);

  function open(r: R) {
    if (r.kind === 'person') router.push({ pathname: '/user/[id]', params: { id: r.id } });
    else if (r.kind === 'link') Linking.openURL(r.subtitle);
    else if (r.kind === 'course') router.push('/swap');
    else router.push({ pathname: '/map', params: { building: r.id } });
  }

  const icon = (k: string) => k === 'course' ? <BookOpen size={20} color={C.green} /> : k === 'link' ? <LinkIcon size={20} color={C.violet} /> : k === 'building' ? <Building2 size={20} color={C.primary} /> : <MapPin size={20} color={C.orange} />;

  return (
    <Screen>
      <Header title={t('بحث')} />
      <View style={{ paddingHorizontal: 18, gap: 12 }}>
        <Row gap={8} style={[{ minHeight: 50, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 14 }, shadow]}>
          <SearchIcon size={20} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} autoFocus placeholder={t('طلاب، مواد، مباني، ألقاب، روابط الجامعة')} placeholderTextColor={C.faint}
            style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} accessibilityLabel={t('بحث')} />
        </Row>
        <Row gap={8}>
          <Chip label={t('الكل')} active={kind === 'all'} onPress={() => setKind('all')} />
          <Chip label={t('طلاب')} active={kind === 'people'} onPress={() => setKind('people')} />
          <Chip label={t('الحرم والمواد')} active={kind === 'campus'} onPress={() => setKind('campus')} />
        </Row>
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.kind + r.id + r.title}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 18, gap: 6 }}
        renderItem={({ item }) => (
          <Animated.View entering={FadeIn}>
            <Tap scale={0.98} onPress={() => open(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 12 }}>
              {item.kind === 'person' ? <Avatar id={item.id} name={item.title} url={item.avatar} size={44} /> :
                <View style={{ width: 44, height: 44, borderRadius: 15, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{icon(item.kind)}</View>}
              <View style={{ flex: 1 }}>
                <T v="bodyMd">{item.title}</T>
                {item.subtitle ? <T v="tiny" color={C.muted} numberOfLines={1}>{item.kind === 'alias' ? t('لقب لـ {0}', [item.subtitle]) : item.subtitle}</T> : null}
              </View>
            </Tap>
          </Animated.View>
        )}
        ListEmptyComponent={q.trim().length >= 2 ? <Empty title={t('ما لقينا إشي')} body={t('جرّب اسم المادة أو المبنى أو لقب المكان.')} /> : (
          <View style={{ gap: 10 }}>
            <View style={{ marginHorizontal: -18, marginBottom: 8 }}><SuggestedPeople /></View>
            {explore.length > 0 && (
              <View style={{ gap: 8, marginBottom: 10 }}>
                <T v="h3">{t('استكشف')}</T>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -1.5 }}>
                  {explore.map((p, i) => <GridTile key={p.id} post={p} i={i} />)}
                </View>
              </View>
            )}
            <T v="h3">{t('روابط جامعتك')}</T>
            {links.length === 0 ? <T v="small" color={C.muted}>{t('بتنضاف قريباً.')}</T> : links.map((l) => (
              <Tap key={l.id} onPress={() => Linking.openURL(l.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 14 }}>
                <LinkIcon size={19} color={C.violet} /><T v="bodyMd">{l.title}</T>
              </Tap>
            ))}
          </View>
        )}
      />
    </Screen>
  );
}
