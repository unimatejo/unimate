import { router } from 'expo-router';
import { BadgeCheck, GraduationCap, Landmark, Search, ShieldCheck } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, TextInput, View } from 'react-native';

import { ListSkeleton } from '@/components/Skeleton';
import { TitleBadge, titleLabel, titledName } from '@/components/TitleBadge';
import { Avatar, Chip, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';

type P = {
  id: string; full_name: string; username: string | null; avatar_url: string | null; account_type: string | null;
  academic_title: string | null; title_verified: boolean; department: string | null; major: string | null; college: string | null; rank: number;
};
type Tier = 'leaders' | 'deans' | 'heads' | 'faculty' | 'staff' | 'pending' | 'students';
type Filter = 'all' | 'staff' | 'students';

const TIER_OF = (p: P): Tier => {
  if (p.rank <= 2) return 'leaders';
  if (p.rank <= 4) return 'deans';
  if (p.rank === 5) return 'heads';
  if (p.rank <= 11) return 'faculty';
  if (p.rank === 12) return 'staff';
  if (p.rank < 100) return 'pending';
  return 'students';
};
const TIERS: Tier[] = ['leaders', 'deans', 'heads', 'faculty', 'staff', 'pending', 'students'];
const tierName = (k: Tier) => ({
  leaders: t('رئاسة الجامعة'), deans: t('العمداء'), heads: t('رؤساء الأقسام'), faculty: t('أعضاء هيئة التدريس'),
  staff: t('الموظفين'), pending: t('كادر بانتظار التوثيق'), students: t('الطلاب'),
})[k];
const GOLD = '#F5B700';

/** Everyone at your university, from the president down to the students. Ranks come from the university email + the official staff list — nobody sets their own. */
export default function Directory() {
  const { university } = useAuth();
  const [rows, setRows] = useState<P[] | null>(null);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => {
    supabase.rpc('university_directory', {}).then(({ data }) => setRows((data ?? []) as P[]), () => setRows([]));
  }, []);

  const all = rows ?? [];
  const staffCount = all.filter((p) => p.rank < 100).length;
  const leaders = all.filter((p) => p.rank <= 5);

  const sections = useMemo(() => {
    const s = q.trim().toLowerCase();
    const hit = (p: P) => !s || p.full_name.toLowerCase().includes(s) || (p.username ?? '').includes(s) || (p.department ?? '').includes(s) || (p.major ?? '').includes(s) || titleLabel(p.academic_title).includes(s);
    const keep = (p: P) => (filter === 'all' || (filter === 'staff' ? p.rank < 100 : p.rank === 100)) && hit(p);
    return TIERS.map((k) => ({ key: k, title: tierName(k), data: all.filter((p) => TIER_OF(p) === k && keep(p)) })).filter((x) => x.data.length);
  }, [all, q, filter]);

  const head = (
    <View style={{ gap: 14, paddingBottom: 6 }}>
      {/* the count of each side of the university */}
      <Row gap={10} style={{ paddingHorizontal: 18 }}>
        <Stat icon={<Landmark size={18} color="#3A2A00" />} tint={GOLD} n={staffCount} label={t('كادر الجامعة')} />
        <Stat icon={<GraduationCap size={18} color={C.onPrimary} />} tint={C.primary} n={all.length - staffCount} label={t('طالب وطالبة')} />
      </Row>

      {/* leadership up top, like story circles with a gold ring */}
      {leaders.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, gap: 14 }}>
          {leaders.map((p) => (
            <Tap key={p.id} scale={0.96} onPress={() => open(p.id)} style={{ width: 78, alignItems: 'center', gap: 6 }}>
              <View style={{ padding: 3, borderRadius: 40, borderWidth: 2.5, borderColor: GOLD }}>
                <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={64} />
              </View>
              <T v="tiny" numberOfLines={1} style={{ fontFamily: F.bodyBold }}>{titledName(p.full_name, p.academic_title, p.title_verified).split(' ').slice(0, 2).join(' ')}</T>
              <T v="tiny" color={C.muted} numberOfLines={1} style={{ marginTop: -6 }}>{titleLabel(p.academic_title)}</T>
            </Tap>
          ))}
        </ScrollView>
      )}

      {/* no staff yet: say how they get here */}
      {rows && staffCount === 0 && (
        <View style={{ marginHorizontal: 18, borderRadius: 20, padding: 14, gap: 6, backgroundColor: isDark ? '#2A2210' : '#FFF6D6', borderWidth: 1, borderColor: isDark ? '#5A4614' : '#F2DD8C' }}>
          <Row gap={8}><ShieldCheck size={18} color={isDark ? GOLD : '#7A5A00'} /><T v="bodyMd" color={isDark ? '#FFE28A' : '#5A4200'}>{t('الرتب بتنحط تلقائي')}</T></Row>
          <T v="small" color={isDark ? '#E9D8A6' : '#6B5410'}>{t('أول ما يسجّل الدكتور أو العميد بإيميله الجامعي، بيطلع هون بمكانه حسب رتبته الرسمية. ما حدا بيقدر يكتب رتبته بإيده.')}</T>
        </View>
      )}

      <View style={{ paddingHorizontal: 18, gap: 10 }}>
        <Row gap={8} style={{ minHeight: 44, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('دوّر باسم، قسم أو تخصص')} placeholderTextColor={C.faint}
            style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
        </Row>
        <Row gap={8}>
          <Chip label={t('الكل')} active={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={t('الكادر')} active={filter === 'staff'} onPress={() => setFilter('staff')} />
          <Chip label={t('الطلاب')} active={filter === 'students'} onPress={() => setFilter('students')} />
        </Row>
      </View>
    </View>
  );

  return (
    <Screen>
      <Header title={t('مجتمع الجامعة')} subtitle={university ? nm(university) ?? undefined : undefined} />
      <SectionList
        sections={sections}
        keyExtractor={(p) => p.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={head}
        contentContainerStyle={{ paddingBottom: 40 }}
        renderSectionHeader={({ section }) => (
          <Row gap={8} style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 8 }}>
            <T v="h3">{section.title}</T>
            <View style={{ backgroundColor: C.soft, borderRadius: 999, paddingHorizontal: 8, height: 22, justifyContent: 'center' }}>
              <T v="tiny" color={C.ink2}>{String(section.data.length)}</T>
            </View>
          </Row>
        )}
        renderItem={({ item, section }) => <Person p={item} big={section.key !== 'students'} />}
        ListEmptyComponent={rows === null ? <ListSkeleton n={8} /> : <Empty title={q ? t('ما لقينا حدا بهالاسم') : t('ما في حدا لهلأ')} />}
      />
    </Screen>
  );
}

const open = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

function Stat({ icon, tint, n, label }: { icon: React.ReactNode; tint: string; n: number; label: string }) {
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 20, padding: 12 }}>
      <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tint, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View>
        <T v="h2" style={{ lineHeight: 30 }}>{n.toLocaleString('en-US')}</T>
        <T v="tiny" color={C.muted}>{label}</T>
      </View>
    </View>
  );
}

function Person({ p, big }: { p: P; big: boolean }) {
  const sub = p.rank < 100
    ? [p.title_verified ? null : t('إيميل كادر جامعي'), p.department].filter(Boolean).join(' · ')
    : [p.major, p.college].filter(Boolean).join(' · ') || (p.username ? `@${p.username}` : '');
  return (
    <Tap haptic={false} scale={0.98} onPress={() => open(p.id)}
      style={{ marginHorizontal: 18, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 18, padding: 10 }}>
      <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={big ? 52 : 44} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1 }}>{titledName(p.full_name, p.academic_title, p.title_verified)}</T>
          <TitleBadge title={p.academic_title} verified={p.title_verified} />
          {!p.title_verified && p.rank < 100 && <BadgeCheck size={14} color={C.muted} />}
        </View>
        {!!sub && <T v="tiny" color={C.muted} numberOfLines={1}>{sub}</T>}
      </View>
    </Tap>
  );
}
