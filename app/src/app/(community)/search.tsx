import { router } from 'expo-router';
import { isWebUrl } from '@/lib/util';
import { BookOpen, Building2, Clock, FileText, Link as LinkIcon, MapPin, NotebookPen, Search as SearchIcon, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Linking, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { titleLabel, titledName } from '@/components/profile/TitleBadge';
import { Avatar, Chip, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { getPref, setPref } from '@/lib/prefs';
import { RowSkeleton } from '@/components/ui/Skeleton';
import { supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';
import { GridTile } from '@/components/profile/ProfileView';
import { SuggestedPeople } from '@/components/feed/SuggestedPeople';
import { POST_SELECT } from '@/lib/posts';
import type { Post } from '@/lib/types';

type R = { kind: string; id: string; title: string; subtitle: string; avatar?: string | null; lat?: number | null };
type Kind = 'all' | 'people' | 'posts' | 'courses' | 'summaries' | 'campus';

// recent searches stay on this device only
const RECENT = 'recent_searches';
const readRecent = (): string[] => { try { return JSON.parse(getPref(RECENT) || '[]'); } catch { return []; } };
const saveRecent = (q: string) => { const s = q.trim(); if (s.length < 2) return; setPref(RECENT, JSON.stringify([s, ...readRecent().filter((x) => x !== s)].slice(0, 10))); };
const excerpt = (p: { title?: string | null; body?: string | null }) => (p.title || p.body || '').replace(/\s+/g, ' ').slice(0, 90);

export default function Search() {
  const { profile, university } = useAuth();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<Kind>('all');
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [rows, setRows] = useState<R[]>([]);
  const [links, setLinks] = useState<{ id: string; title: string; url: string }[]>([]);

  const [explore, setExplore] = useState<Post[]>([]);
  const [searching, setSearching] = useState(false);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!profile) return;
    supabase.from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${profile.id},blocked_id.eq.${profile.id}`)
      .then(({ data }) => setBlocked(new Set((data ?? []).map((b) => (b.blocker_id === profile.id ? b.blocked_id : b.blocker_id)))), () => {});
  }, [profile]);

  useEffect(() => {
    if (!profile?.university_id) return;
    // most liked recent posts at your university
    supabase.from('posts').select(POST_SELECT).eq('university_id', profile.university_id).is('community_id', null).gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString())
      .order('like_count', { ascending: false }).order('created_at', { ascending: false }).limit(21)
      .then(({ data }) => setExplore((data ?? []) as unknown as Post[]), () => {});
  }, [profile?.university_id]);

  useEffect(() => {
    if (!university) return;
    supabase.from('university_links').select('id, title, url').eq('university_id', university.id).order('position').then(({ data }) => setLinks(data ?? []));
  }, [university]);

  const seq = useRef(0);
  useEffect(() => {
    const s = q.trim().replace(/^@+/, '');
    if (s.length < 2) { setRows([]); setSearching(false); return; }
    setSearching(true);
    const my = ++seq.current;
    const timer = setTimeout(async () => {
      const out: R[] = [];
      try {
        // escape LIKE wildcards and PostgREST separators so "%", "_" or "," search literally
        const like = s.replace(/[\\%_]/g, (c) => '\\' + c).replace(/[,()"]/g, ' ');
        const want = (k: Kind) => kind === 'all' || kind === k;
        const uni = profile?.university_id ?? '';
        const postQ = (summaries: boolean) => {
          let qq = supabase.from('posts').select('id, title, body, category, like_count, created_at, author:profiles!posts_author_id_fkey(full_name)')
            .eq('university_id', uni).eq('is_hidden', false).or(`title.ilike.%${like}%,body.ilike.%${like}%`)
            .order('created_at', { ascending: false }).limit(kind === 'all' ? 5 : 30);
          qq = summaries ? qq.eq('category', 'summaries') : qq.neq('category', 'summaries');
          return qq;
        };
        const none = Promise.resolve({ data: [] as unknown[] });
        const [people, campus, posts, sums, courses] = await Promise.all([
          want('people')
            ? supabase.from('profiles').select('id, full_name, username, is_verified, academic_title, title_verified, department, avatar_url, major:majors!profiles_major_id_fkey(name_ar, name_en)')
              .or(`full_name.ilike.%${like}%,username.ilike.%${like.toLowerCase()}%`).neq('id', profile?.id ?? '').limit(kind === 'all' ? 8 : 30)
            : none,
          want('campus') ? supabase.rpc('campus_search', { q: s, lim: kind === 'all' ? 8 : 30 }) : none,
          want('posts') ? postQ(false) : none,
          want('summaries') ? postQ(true) : none,
          want('courses') ? supabase.from('courses').select('id, name_ar, name_en, code').eq('university_id', uni).or(`name_ar.ilike.%${like}%,name_en.ilike.%${like}%,code.ilike.%${like}%`).limit(kind === 'all' ? 5 : 30) : none,
        ]);
         
        out.push(...((people.data ?? []) as any[]).filter((p) => !blocked.has(p.id)).map((p) => ({ kind: 'person', id: p.id, title: titledName(p.full_name, p.academic_title, p.title_verified), subtitle: [p.title_verified && p.academic_title ? titleLabel(p.academic_title) : null, p.username ? '@' + p.username : null, p.title_verified ? p.department : null, nm(p.major)].filter(Boolean).join(' · '), avatar: p.avatar_url })));
         
        out.push(...((courses.data ?? []) as any[]).map((c) => ({ kind: 'course', id: c.id, title: nm(c) ?? c.name_ar, subtitle: c.code ?? '' })));
         
        out.push(...((sums.data ?? []) as any[]).map((p) => ({ kind: 'summary', id: p.id, title: excerpt(p), subtitle: [t('ملخص'), p.author?.full_name].filter(Boolean).join(' · ') })));
         
        out.push(...((posts.data ?? []) as any[]).map((p) => ({ kind: 'post', id: p.id, title: excerpt(p), subtitle: [p.author?.full_name, t('{0} لايك', [p.like_count ?? 0])].filter(Boolean).join(' · ') })));
        if (want('campus')) out.push(...((campus.data ?? []) as R[]).filter((r) => kind === 'campus' || r.kind !== 'course' || !out.some((o) => o.kind === 'course' && o.title === r.title)));
      } catch { /* keep the empty list; the message below explains */ }
      if (my !== seq.current) return; // a newer search already started
      setRows(out); setSearching(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [q, kind, profile, blocked]);

  function openLink(url: string) {
    if (!isWebUrl(url)) { Alert.alert(t('الرابط مش صالح')); return; }
    Linking.openURL(url).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط')));
  }

  function open(r: R) {
    saveRecent(q); setRecent(readRecent());
    if (r.kind === 'post' || r.kind === 'summary') { router.push({ pathname: '/post/[id]', params: { id: r.id } }); return; }
    if (r.kind === 'person') router.push({ pathname: '/user/[id]', params: { id: r.id } });
    else if (r.kind === 'link') openLink(r.subtitle);
    else if (r.kind === 'course') router.push({ pathname: '/courses', params: { add: r.title } });
    else router.push({ pathname: '/map', params: { building: r.id } });
  }

  const icon = (k: string) => k === 'post' ? <FileText size={20} color={C.sky} /> : k === 'summary' ? <NotebookPen size={20} color={C.green} /> : k === 'course' ? <BookOpen size={20} color={C.green} /> : k === 'link' ? <LinkIcon size={20} color={C.violet} /> : k === 'building' ? <Building2 size={20} color={C.primary} /> : <MapPin size={20} color={C.orange} />;

  return (
    <Screen>
      <Header title={t('بحث')} />
      <View style={{ paddingHorizontal: 18, gap: 12 }}>
        <Row gap={8} style={[{ minHeight: 50, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 14 }, shadow]}>
          <SearchIcon size={20} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} autoFocus placeholder={t('أشخاص، منشورات، مواد، ملخصات، مباني')} returnKeyType="search" onSubmitEditing={() => { saveRecent(q); setRecent(readRecent()); }} placeholderTextColor={C.faint}
            style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} accessibilityLabel={t('بحث')} />
        </Row>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
          {([['all', t('الكل')], ['people', t('أشخاص')], ['posts', t('منشورات')], ['courses', t('مواد')], ['summaries', t('ملخصات')], ['campus', t('الحرم')]] as [Kind, string][]).map(([k, l]) => (
            <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />
          ))}
        </ScrollView>
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
        ListEmptyComponent={q.trim().length >= 2 ? searching ? <View style={{ gap: 6 }}><RowSkeleton /><RowSkeleton /><RowSkeleton /></View> : <Empty title={t('ما لقينا إشي')} body={t('جرّب كلمة ثانية، أو اسم المادة أو رمزها أو المبنى.')} /> : (
          <View style={{ gap: 10 }}>
            {recent.length > 0 && (
              <View style={{ gap: 4, marginBottom: 6 }}>
                <Row gap={8}><T v="h3" style={{ flex: 1 }}>{t('عمليات بحث سابقة')}</T>
                  <Tap onPress={() => { setPref(RECENT, '[]'); setRecent([]); }} accessibilityLabel={t('امسح الكل')} style={{ minHeight: 44, justifyContent: 'center' }}><T v="small" color={C.primary}>{t('امسح الكل')}</T></Tap>
                </Row>
                {recent.map((r) => (
                  <Row key={r} gap={10} style={{ minHeight: 44 }}>
                    <Clock size={17} color={C.muted} />
                    <Tap haptic={false} onPress={() => setQ(r)} style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}><T v="body">{r}</T></Tap>
                    <Tap onPress={() => { const n = readRecent().filter((x) => x !== r); setPref(RECENT, JSON.stringify(n)); setRecent(n); }} accessibilityLabel={t('احذف')} hitSlop={8} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={16} color={C.muted} /></Tap>
                  </Row>
                ))}
              </View>
            )}
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
              <Tap key={l.id} onPress={() => openLink(l.url)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 14 }}>
                <LinkIcon size={19} color={C.violet} /><T v="bodyMd">{l.title}</T>
              </Tap>
            ))}
          </View>
        )}
      />
    </Screen>
  );
}
