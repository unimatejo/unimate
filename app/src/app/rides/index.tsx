import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { AskSeatSheet } from '@/components/rides/AskSeatSheet';
import { RideCard } from '@/components/rides/RideCard';
import { PullRefresh } from '@/components/PullRefresh';
import { ListSkeleton } from '@/components/Skeleton';
import { Button, Chip, Empty, Header, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { EMOJI, dayKey, dayLabel, rideError, seatsLeft, type Direction, type Ride } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

const DIRS: (Direction | null)[] = ['to_campus', 'from_campus', null];

/** Rides to and from campus, offered by students of the same university. */
export default function Rides() {
  const { profile } = useAuth();
  const [dir, setDir] = useState(0);
  const [area, setArea] = useState<string | null>(null);
  const [rows, setRows] = useState<Ride[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [ask, setAsk] = useState<Ride | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('rides_feed', { p_direction: DIRS[dir] });
    if (error) { setFailed(true); setRows((r) => r ?? []); return; }
    setFailed(false); setRows((data ?? []) as Ride[]);
  }, [dir]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const areas = useMemo(() => [...new Set((rows ?? []).map((r) => r.area))].sort((a, b) => a.localeCompare(b, 'ar')), [rows]);
  const shown = useMemo(() => (rows ?? []).filter((r) => !area || r.area === area), [rows, area]);
  const days = useMemo(() => {
    const m = new Map<string, Ride[]>();
    for (const r of shown) { const k = dayKey(r.depart_at); if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); }
    return [...m.entries()];
  }, [shown]);

  function leave(r: Ride) {
    Alert.alert(t('تلغي طلبك؟'), t('بنبلّغ السائق إنك مش جاي.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('الغي'), style: 'destructive', onPress: async () => {
        setBusy(r.id);
        const res = await run(supabase.rpc('leave_ride', { p_ride: r.id }), { quiet: true });
        setBusy(null);
        if (!res.ok) { toast.error(rideError(res.error)); return; }
        toast(t('انلغى طلبك'));
        load();
      } },
    ]);
  }

  function action(r: Ride) {
    const mine = r.driver_id === profile?.id;
    if (mine) {
      return (
        <Tap onPress={() => router.push({ pathname: '/rides/[id]', params: { id: r.id } })} style={{ backgroundColor: r.pending_count ? C.primary : C.soft, borderRadius: 999, paddingHorizontal: 12, height: 34, justifyContent: 'center' }}>
          <T v="tiny" color={r.pending_count ? C.onPrimary : C.ink2} style={{ fontFamily: F.bodyBold }}>{r.pending_count ? t('{0} طلبات', [String(r.pending_count)]) : t('ما في طلبات')}</T>
        </Tap>
      );
    }
    if (r.my_status === 'pending' || r.my_status === 'accepted') {
      const ok = r.my_status === 'accepted';
      return (
        <Row gap={6}>
          <View style={{ backgroundColor: ok ? C.greenSoft : C.orangeSoft, borderRadius: 999, paddingHorizontal: 10, height: 30, justifyContent: 'center' }}>
            <T v="tiny" color={ok ? C.greenInk : C.orangeInk} style={{ fontFamily: F.bodyBold }}>{ok ? t('انقبلت ✓') : t('بانتظار السائق')}</T>
          </View>
          <Tap onPress={() => leave(r)} disabled={busy === r.id} accessibilityLabel={t('الغي طلبي')} style={{ paddingHorizontal: 8, height: 30, justifyContent: 'center' }}>
            <T v="tiny" color={C.red}>{t('الغي')}</T>
          </Tap>
        </Row>
      );
    }
    if (r.my_status === 'declined') return <T v="tiny" color={C.muted}>{t('اعتذر السائق')}</T>;
    if (!seatsLeft(r)) return <T v="tiny" color={C.muted}>{t('مليانة')}</T>;
    return (
      <Tap onPress={() => setAsk(r)} style={{ backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 14, height: 34, justifyContent: 'center' }} accessibilityRole="button">
        <T v="tiny" color={C.onPrimary} style={{ fontFamily: F.bodyBold }}>{t('اطلب مقعد')}</T>
      </Tap>
    );
  }

  return (
    <Screen>
      <Header title={t('توصيلات')} subtitle={t('من طلاب جامعتك، موثّقين بإيميلهم الجامعي')}
        right={<Button title={t('اعرض توصيلة')} icon={<Plus size={16} color={C.onPrimary} />} onPress={() => router.push('/rides/new')} style={{ minHeight: 40, paddingHorizontal: 14 }} />} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60, gap: 14 }} refreshControl={<PullRefresh onRefresh={load} />}>
        <Animated.View entering={FadeIn.duration(220)} style={[{ backgroundColor: C.card, borderRadius: 26, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, shadow]}>
          <Image source={EMOJI.car} style={{ width: 64, height: 64 }} contentFit="contain" />
          <View style={{ flex: 1, gap: 2 }}>
            <T v="bold">{t('وفّر وقتك ومصاريك')}</T>
            <T v="small" color={C.muted}>{t('شارك سيارتك مع زملاءك أو لاقي مقعد لمحاضرتك، والكل من جامعتك.')}</T>
          </View>
        </Animated.View>

        <Segmented items={[t('للجامعة'), t('من الجامعة'), t('الكل')]} value={dir} onChange={(i) => { setDir(i); setArea(null); setRows(null); }} />

        {areas.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={t('كل المناطق')} active={!area} onPress={() => setArea(null)} />
            {areas.map((a) => <Chip key={a} label={a} active={area === a} onPress={() => setArea(area === a ? null : a)} />)}
          </ScrollView>
        )}

        {rows === null ? <ListSkeleton n={4} />
          : failed && !rows.length ? <Empty title={t('ما قدرنا نحمّل التوصيلات')} body={t('تأكد من الإنترنت وجرّب كمان مرة.')} action={<Button kind="soft" title={t('جرّب مرة ثانية')} onPress={load} />} />
          : !shown.length ? (
            <Empty icon={<Image source={EMOJI.oncoming} style={{ width: 72, height: 72 }} contentFit="contain" />} title={t('ما في توصيلات لهلأ')}
              body={t('كون أول واحد بيعرض توصيلة، وزملاءك من منطقتك بيشوفوها.')}
              action={<Button title={t('اعرض توصيلة')} onPress={() => router.push('/rides/new')} style={{ marginTop: 8, paddingHorizontal: 22 }} />} />
          ) : days.map(([k, list]) => (
            <View key={k} style={{ gap: 10 }}>
              <T v="h3">{dayLabel(list[0].depart_at)}</T>
              {list.map((r) => (
                <RideCard key={r.id} ride={r} mine={r.driver_id === profile?.id} action={action(r)}
                  onPress={() => router.push({ pathname: '/rides/[id]', params: { id: r.id } })} />
              ))}
            </View>
          ))}
        <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('لا تشارك رقمك، تواصل من داخل يونيميت.')}</T>
      </ScrollView>
      <AskSeatSheet ride={ask} onClose={() => setAsk(null)} onDone={() => { setAsk(null); load(); }} />
    </Screen>
  );
}
