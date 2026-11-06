import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ChevronDown, ChevronUp, Star } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PullRefresh } from '@/components/ui/PullRefresh';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Avatar, Card, Chip, Empty, Header, Row, Screen, Segmented, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { EMOJI, POINT_KIND, POINT_RULES } from '@/lib/points';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t } from '@/lib/i18n';

type Row = { rank: number; user_id: string; full_name: string; username: string | null; avatar_url: string | null; points: number; is_me: boolean };
type Hist = { kind: string; points: number; created_at: string };

const MEDAL = [EMOJI.gold, EMOJI.silver, EMOJI.bronze];
const open = (id: string) => router.push({ pathname: '/user/[id]', params: { id } });

/** Monthly "wall of fame": who helped classmates most, from points the database gives by itself. */
export default function Leaderboard() {
  const { profile, refreshProfile } = useAuth();
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState(0);            // 0 = my college, 1 = my cohort, 2 = the university
  const [period, setPeriod] = useState<'month' | 'all'>('month');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [hist, setHist] = useState<Hist[] | null>(null);
  const [showHist, setShowHist] = useState(false);
  const [hide, setHide] = useState(!!profile?.hide_rank);

  const load = useCallback(async () => {
    const [{ data }, { data: h }] = await Promise.all([
      supabase.rpc('leaderboard', { p_scope: (['college', 'cohort', 'university'] as const)[scope], p_period: period }),
      supabase.rpc('my_points_history'),
    ]);
    setRows((data ?? []) as Row[]); setHist((h ?? []) as Hist[]);
  }, [scope, period]);
  useEffect(() => { setRows(null); load(); }, [load]);
  useEffect(() => { setHide(!!profile?.hide_rank); }, [profile?.hide_rank]);

  async function toggleHide(v: boolean) {
    setHide(v);
    const r = await run(supabase.rpc('set_hide_rank', { p_hide: v }));
    if (!r.ok) { setHide(!v); return; }
    refreshProfile(); load();
  }

  const top = (rows ?? []).slice(0, 3);
  const rest = (rows ?? []).slice(3);
  const me = (rows ?? []).find((r) => r.is_me);
  const monthPts = (hist ?? []).filter((h) => new Date(h.created_at).getMonth() === new Date().getMonth() && new Date(h.created_at).getFullYear() === new Date().getFullYear()).reduce((a, h) => a + h.points, 0);

  return (
    <Screen>
      <Header title={t('لوحة الشرف')} subtitle={t('الأكثر مساعدة لزملائهم')}
        right={<Tap onPress={() => router.push('/honor')} accessibilityRole="button" accessibilityLabel={t('المتفوقين')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderRadius: 999, paddingHorizontal: 12, height: 40 }}>
          <Image source={require('../../../assets/emoji3d/trophy_3d.png')} style={{ width: 22, height: 22 }} contentFit="contain" />
          <T v="small" style={{ fontFamily: F.bodyBold }}>{t('المتفوقين')}</T>
        </Tap>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, gap: 14, paddingBottom: insets.bottom + 120 }} refreshControl={<PullRefresh onRefresh={load} />}>
        <Segmented items={[t('كليتي'), t('دفعتي'), t('الجامعة')]} value={scope} onChange={setScope} />
        <Row gap={8}>
          <Chip label={t('هالشهر')} active={period === 'month'} onPress={() => setPeriod('month')} />
          <Chip label={t('كل الوقت')} active={period === 'all'} onPress={() => setPeriod('all')} />
        </Row>

        {rows === null ? <ListSkeleton n={6} /> : rows.length === 0 ? (
          <Empty icon={<Image source={EMOJI.trophy} style={{ width: 64, height: 64 }} contentFit="contain" />}
            title={period === 'month' ? t('لسا ما حدا جمع نقاط هالشهر') : t('لسا ما حدا جمع نقاط')}
            body={t('انشر ملخّص أو أعطِ مقعد بتوصيلة وكون أول واحد هون.')} />
        ) : (
          <>
            {/* podium: 2nd · 1st (taller) · 3rd */}
            <Animated.View entering={FadeIn.duration(260)} style={[{ backgroundColor: C.card, borderRadius: 28, paddingTop: 18, paddingBottom: 14, paddingHorizontal: 10 }, shadow]}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 8 }}>
                {[1, 0, 2].map((i) => {
                  const r = top[i];
                  if (!r) return <View key={i} style={{ flex: 1 }} />;
                  const first = i === 0;
                  return (
                    <Tap key={r.user_id} onPress={() => open(r.user_id)} scale={0.96} accessibilityLabel={`${r.rank}. ${r.full_name}`} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                      <View>
                        <Avatar id={r.user_id} name={r.full_name} url={r.avatar_url} size={first ? 78 : 60} ring={first} />
                        <Image source={MEDAL[i]} style={{ position: 'absolute', bottom: -8, alignSelf: 'center', width: first ? 38 : 32, height: first ? 38 : 32 }} contentFit="contain" />
                      </View>
                      <T v="small" numberOfLines={1} style={{ fontFamily: F.bodyBold, marginTop: 6, maxWidth: '100%' }}>{r.full_name.split(' ').slice(0, 2).join(' ')}</T>
                      <Row gap={4}><Star size={12} color={C.orange} fill={C.orange} /><T v="tiny" color={C.orange} style={{ fontFamily: F.bodyBold }}>{r.points}</T></Row>
                      <View style={{ alignSelf: 'stretch', height: first ? 58 : i === 1 ? 40 : 28, borderTopLeftRadius: 14, borderTopRightRadius: 14, backgroundColor: first ? C.orangeSoft : C.soft }} />
                    </Tap>
                  );
                })}
              </View>
            </Animated.View>

            {rest.length > 0 && (
              <Card pad={6}>
                {rest.map((r) => (
                  <Tap key={r.user_id} haptic={false} scale={0.98} onPress={() => open(r.user_id)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 8, borderRadius: 16, backgroundColor: r.is_me ? C.primarySoft : 'transparent' }}>
                    <T style={{ fontFamily: F.display, fontSize: 16, width: 26, textAlign: 'center' }} color={C.muted}>{r.rank}</T>
                    <Avatar id={r.user_id} name={r.full_name} url={r.avatar_url} size={40} />
                    <T v="bodyMd" numberOfLines={1} style={{ flex: 1 }}>{r.full_name}</T>
                    <Row gap={4}><Star size={13} color={C.orange} fill={C.orange} /><T v="bold" color={C.orange}>{r.points}</T></Row>
                  </Tap>
                ))}
              </Card>
            )}
          </>
        )}

        <Card style={{ gap: 10 }}>
          <Row gap={10}>
            <Image source={EMOJI.medal} style={{ width: 34, height: 34 }} contentFit="contain" />
            <T v="h3" style={{ flex: 1 }}>{t('كيف بتجمع نقاط')}</T>
          </Row>
          {POINT_RULES.map(([k, v]) => (
            <Row key={k} gap={10}>
              <T v="small" style={{ flex: 1 }}>{k}</T>
              <View style={{ backgroundColor: C.orangeSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}><T v="tiny" color={C.orange} style={{ fontFamily: F.bodyBold }}>{v}</T></View>
            </Row>
          ))}
          <T v="tiny" color={C.muted}>{t('النقاط بتنحسب لحالها وما حدا بيقدر يزيدها بإيده.')}</T>
        </Card>

        <Card style={{ gap: 8 }}>
          <Tap haptic={false} onPress={() => setShowHist((s) => !s)} accessibilityRole="button" accessibilityState={{ expanded: showHist }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 }}>
            <T v="h3" style={{ flex: 1 }}>{t('نقاطي')}</T>
            <T v="bold" color={C.orange}>{profile?.points ?? 0}</T>
            {showHist ? <ChevronUp size={18} color={C.muted} /> : <ChevronDown size={18} color={C.muted} />}
          </Tap>
          {showHist && (hist?.length ? hist.map((h, i) => (
            <Row key={i} gap={10} style={{ minHeight: 34 }}>
              <T v="small" style={{ flex: 1 }}>{POINT_KIND[h.kind] ?? h.kind}</T>
              <T v="tiny" color={C.muted}>{timeAgo(h.created_at)}</T>
              <T v="bold" color={h.points >= 0 ? C.greenInk : C.red} style={{ minWidth: 34, textAlign: 'center' }}>{h.points > 0 ? `+${h.points}` : h.points}</T>
            </Row>
          )) : <T v="small" color={C.muted}>{t('لسا ما جمعت نقاط.')}</T>)}
          <Toggle value={!hide} onChange={(v) => toggleHide(!v)} label={t('اظهرني بلوحة الشرف')} hint={t('بالأساس ما حدا بيظهر. شغّلها إذا بدك اسمك ونقاطك يطلعوا لزملائك.')} />
        </Card>
      </ScrollView>

      {/* where I stand, always visible */}
      {rows && (
        <View style={{ position: 'absolute', left: 18, right: 18, bottom: insets.bottom + 14 }}>
          <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.inverse, borderRadius: 22, padding: 12 }, shadow]}>
            <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <T v="tiny" color={C.faint}>{t('مكانك')}</T>
              <T v="bold" color={C.onInverse} numberOfLines={1}>
                {hide ? t('مخفي من القائمة') : me ? t('المركز {0}', [me.rank]) : period === 'month' && monthPts === 0 ? t('لسا ما عندك نقاط هالشهر') : t('برا أول 20')}
              </T>
            </View>
            <Row gap={4}><Star size={14} color={C.orange} fill={C.orange} /><T v="bold" color={C.onInverse}>{me?.points ?? (period === 'month' ? monthPts : profile?.points ?? 0)}</T></Row>
          </View>
        </View>
      )}
    </Screen>
  );
}
