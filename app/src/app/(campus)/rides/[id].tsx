import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, Check, Flag, MessageCircle, Phone, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';

import { AskSeatSheet } from '@/components/rides/AskSeatSheet';
import { SeatIcons } from '@/components/rides/RideCard';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { TitleBadge, titledName } from '@/components/profile/TitleBadge';
import { Avatar, Button, Card, Empty, Header, IconButton, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { EMOJI, dayLabel, directionLabel, priceLabel, rideError, routeLabel, seatsLeft, timeLabel, type MyStatus, type Ride, type RideRequest } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

type Driver = { id: string; full_name: string; username: string | null; avatar_url: string | null; is_verified: boolean; academic_title: string | null; title_verified: boolean };

/** One ride: the details, and for the driver the requests to accept or decline. */
export default function RideDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [ride, setRide] = useState<Ride | null>(null);
  const [missing, setMissing] = useState(false);
  const [reqs, setReqs] = useState<RideRequest[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [ask, setAsk] = useState(false);
  const [phones, setPhones] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!id || !profile) return;
    const { data, error } = await supabase.from('rides')
      .select('id, driver_id, kind, direction, area, stops, meet_point, campus_spot, depart_at, seats_total, seats_taken, price_jod, notes, status, driver:profiles!rides_driver_id_fkey(id, full_name, username, avatar_url, is_verified, academic_title, title_verified)')
      .eq('id', id).maybeSingle();
    if (error || !data || (data as { status: string }).status !== 'open') { setMissing(true); return; }
    const d = (data as unknown as { driver: Driver }).driver;
    const mineRide = data.driver_id === profile.id;
    let my: MyStatus = null;
    if (!mineRide) {
      const { data: q } = await supabase.from('ride_requests').select('status').eq('ride_id', id).eq('rider_id', profile.id).maybeSingle();
      my = (q?.status as MyStatus) ?? null;
    } else {
      const { data: rq } = await supabase.rpc('ride_requests_for', { p_ride: id });
      setReqs((rq ?? []) as RideRequest[]);
    }
    // phones show only between the two sides of an accepted seat (the server decides)
    const { data: ph } = await supabase.rpc('ride_phones_for', { p_ride: id });
    setPhones(Object.fromEntries(((ph ?? []) as { user_id: string; phone: string }[]).map((x) => [x.user_id, x.phone])));
    setMissing(false);
    setRide({
      ...(data as unknown as Ride), driver_name: d?.full_name ?? '', driver_username: d?.username ?? null, driver_avatar: d?.avatar_url ?? null,
      driver_verified: !!d?.is_verified, driver_title: d?.title_verified ? d.academic_title : null, driver_title_verified: !!d?.title_verified,
      my_status: my, pending_count: 0,
    });
  }, [id, profile]);
  useEffect(() => { load(); }, [load]);

  const mine = !!ride && ride.driver_id === profile?.id;
  const need = ride?.kind === 'need';
  const call = (n: string) => Linking.openURL(`tel:${n}`).catch(() => toast.error(t('تعذّر بدء الاتصال')));

  async function message(target: string) {
    if (busy) return;
    setBusy(`m-${target}`);
    const { data, error } = await supabase.rpc('start_direct', { target, context: t('توصيلة') });
    setBusy(null);
    if (error || !data) { Alert.alert(t('لا يمكنك مراسلته'), error?.message.includes('not accepting') ? t('أغلق هذا الطالب استقبال الرسائل من أشخاص خارج دفعته.') : t('حاول لاحقًا.')); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  function answer(q: RideRequest, accept: boolean) {
    Alert.alert(accept ? t('قبول {0}؟', [q.name]) : t('الاعتذار من {0}؟', [q.name]),
      accept ? (need ? t('هو من سيوصلك، وسيصل الباقين إشعار بأنك وجدت من يوصلك.') : t('سيُحجز له {0} مقعد وسيصله إشعار.', [String(q.seats)])) : t('سيصله إشعار بأنك اعتذرت.'), [
        { text: t('لا'), style: 'cancel' },
        { text: accept ? t('اقبل') : t('اعتذر'), style: accept ? 'default' : 'destructive', onPress: async () => {
          setBusy(q.id);
          const r = await run(supabase.rpc('answer_ride_request', { p_request: q.id, p_accept: accept }), { quiet: true });
          setBusy(null);
          if (!r.ok) { toast.error(rideError(r.error)); load(); return; }
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
          load();
        } },
      ]);
  }

  function cancelRide() {
    Alert.alert(t('إلغاء التوصيلة؟'), t('سيصل إشعار إلى كل من طلب مقعداً.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('ألغِها'), style: 'destructive', onPress: async () => {
        setBusy('cancel');
        const r = await run(supabase.rpc('cancel_ride', { p_ride: id }), { quiet: true });
        setBusy(null);
        if (!r.ok) { toast.error(rideError(r.error)); return; }
        toast(t('تم إلغاء التوصيلة'));
        router.back();
      } },
    ]);
  }

  function leave() {
    Alert.alert(t('إلغاء طلبك؟'), t('سنُبلغ السائق بأنك لن تأتي.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('إلغاء'), style: 'destructive', onPress: async () => {
        setBusy('leave');
        const r = await run(supabase.rpc('leave_ride', { p_ride: id }), { quiet: true });
        setBusy(null);
        if (!r.ok) { toast.error(rideError(r.error)); return; }
        toast(t('تم إلغاء طلبك'));
        load();
      } },
    ]);
  }

  if (missing) return (
    <Screen><Header title={t('توصيلة')} />
      <Empty icon={<Image source={EMOJI.oncoming} style={{ width: 72, height: 72 }} contentFit="contain" />} title={t('لم تعد هذه التوصيلة متاحة')} body={t('ربما أُلغيت أو انقضى وقتها.')}
        action={<Button kind="soft" title={t('عرض التوصيلات')} onPress={() => router.replace('/rides')} />} />
    </Screen>
  );
  if (!ride) return <Screen><Header title={t('توصيلة')} /><ListSkeleton n={3} /></Screen>;

  const free = seatsLeft(ride);
  const pending = reqs.filter((q) => q.status === 'pending');
  const accepted = reqs.filter((q) => q.status === 'accepted');

  return (
    <Screen>
      <Header title={directionLabel(ride.direction)} subtitle={`${dayLabel(ride.depart_at)} · ${timeLabel(ride.depart_at)}`}
        right={!mine ? <IconButton label={t('إبلاغ')} onPress={() => router.push({ pathname: '/report', params: { type: 'user', id: ride.driver_id, user: ride.driver_id } })}><Flag size={20} color={C.ink} /></IconButton> : undefined} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60, gap: 14 }} refreshControl={<PullRefresh onRefresh={load} />}>
        <View style={[{ backgroundColor: C.card, borderRadius: 28, padding: 16, gap: 14 }, shadow]}>
          <Row gap={14}>
            <Image source={ride.direction === 'to_campus' ? EMOJI.school : EMOJI.house} style={{ width: 64, height: 64 }} contentFit="contain" />
            <View style={{ flex: 1, gap: 2 }}>
              <T style={{ fontFamily: F.display, fontSize: 30, lineHeight: 36 }}>{timeLabel(ride.depart_at)}</T>
              <T v="tiny" color={C.muted}>{dayLabel(ride.depart_at)}</T>
            </View>
            <View style={{ backgroundColor: Number(ride.price_jod) > 0 ? C.orangeSoft : C.greenSoft, borderRadius: 999, paddingHorizontal: 12, height: 30, justifyContent: 'center' }}>
              <T v="small" color={Number(ride.price_jod) > 0 ? C.orangeInk : C.greenInk} style={{ fontFamily: F.bodyBold }}>{priceLabel(ride.price_jod)}</T>
            </View>
          </Row>
          <Row gap={10} style={{ backgroundColor: C.soft, borderRadius: 18, padding: 12 }}>
            <Image source={EMOJI.pin} style={{ width: 28, height: 28 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <T v="bold">{routeLabel(ride)}</T>
              {ride.campus_spot ? <T v="small" color={C.ink2}>{t('في الجامعة: {0}', [ride.campus_spot])}</T> : null}
              {ride.meet_point ? <T v="small" color={C.ink2}>{t('نقطة التجمّع: {0}', [ride.meet_point])}</T> : null}
            </View>
          </Row>
          {need ? (
            <T v="small" color={free ? C.orangeInk : C.greenInk}>{free ? t('{0} أشخاص يريدون توصيلة', [String(ride.seats_total)]) : t('وجد من يوصله ✓')}</T>
          ) : (
            <Row gap={10} style={{ justifyContent: 'space-between' }}>
              <SeatIcons total={ride.seats_total} taken={ride.seats_taken} size={20} />
              <T v="small" color={free ? C.greenInk : C.muted}>{free ? t('{0} مقاعد شاغرة', [String(free)]) : t('ممتلئة')}</T>
            </Row>
          )}
          {ride.notes ? <T v="body" color={C.ink2}>{ride.notes}</T> : null}
        </View>

        {!mine && (
          <Card>
            <Tap haptic={false} onPress={() => router.push({ pathname: '/user/[id]', params: { id: ride.driver_id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Avatar id={ride.driver_id} name={ride.driver_name} url={ride.driver_avatar} size={50} />
              <View style={{ flex: 1 }}>
                <Row gap={5}>
                  <T v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{titledName(ride.driver_name, ride.driver_title, ride.driver_title_verified)}</T>
                  {ride.driver_verified && <BadgeCheck size={15} color={C.white} fill={C.verified} />}
                  <TitleBadge title={ride.driver_title} verified={ride.driver_title_verified} />
                </Row>
                <T v="tiny" color={C.muted}>{need ? t('يريد توصيلة') : t('السائق')}{ride.driver_username ? ` · ⁦@${ride.driver_username}⁩` : ''}</T>
              </View>
            </Tap>
            <View style={{ gap: 10, marginTop: 14 }}>
              {ride.my_status === 'accepted' || ride.my_status === 'pending' ? (
                <View style={{ backgroundColor: ride.my_status === 'accepted' ? C.greenSoft : C.orangeSoft, borderRadius: 16, padding: 12 }}>
                  <T v="bold" color={ride.my_status === 'accepted' ? C.greenInk : C.orangeInk}>
                    {ride.my_status === 'accepted' ? (need ? t('تم قبول عرضك، ستوصله ✓') : t('تم قبولك في هذه التوصيلة ✓')) : need ? t('عرضك بانتظار رده') : t('طلبك بانتظار رد السائق')}
                  </T>
                </View>
              ) : ride.my_status === 'declined' ? (
                <T v="small" color={C.muted}>{need ? t('وجد شخصًا آخر يوصله.') : t('اعتذر السائق عن هذه التوصيلة.')}</T>
              ) : null}
              {phones[ride.driver_id] ? <Button kind="soft" title={phones[ride.driver_id]} icon={<Phone size={17} color={C.primary} />} onPress={() => call(phones[ride.driver_id])} /> : null}
              <Row gap={8}>
                <Button kind="soft" title={need ? t('راسله') : t('راسل السائق')} icon={<MessageCircle size={17} color={C.primary} />} onPress={() => message(ride.driver_id)} loading={busy === `m-${ride.driver_id}`} style={{ flex: 1 }} />
                {ride.my_status === 'accepted' || ride.my_status === 'pending'
                  ? <Button kind="soft" title={need ? t('إلغاء عرضي') : t('إلغاء طلبي')} onPress={leave} loading={busy === 'leave'} style={{ flex: 1 }} />
                  : ride.my_status !== 'declined' && free > 0 ? <Button title={need ? t('سأوصلك') : t('اطلب مقعد')} onPress={() => setAsk(true)} style={{ flex: 1 }} /> : null}
              </Row>
            </View>
          </Card>
        )}

        {mine && (
          <>
            <T v="h3">{need ? t('من عرض توصيلك') : t('الطلبات')}</T>
            {!pending.length && !accepted.length ? (
              <Card><T v="small" color={C.muted}>{need ? t('لم يعرض أحد بعد. سيصلك إشعار فور عرض أحدهم توصيلك.') : t('لم يطلب أحد مقعدًا بعد. سيصلك إشعار فور طلب أحدهم.')}</T></Card>
            ) : null}
            {[...pending, ...accepted].map((q) => (
              <View key={q.id} style={[{ backgroundColor: C.card, borderRadius: 22, padding: 12, gap: 10 }, shadow]}>
                <Row gap={12}>
                  <Tap haptic={false} onPress={() => router.push({ pathname: '/user/[id]', params: { id: q.rider_id } })}>
                    <Avatar id={q.rider_id} name={q.name} url={q.avatar_url} size={44} />
                  </Tap>
                  <View style={{ flex: 1 }}>
                    <T v="bold" numberOfLines={1}>{q.name}</T>
                    <T v="tiny" color={C.muted}>{need ? t('لديه سيارة') : t('{0} مقعد', [String(q.seats)])}{q.status === 'accepted' ? ` · ${t('مقبول')}` : ''}</T>
                  </View>
                  {phones[q.rider_id] ? <IconButton label={t('اتصل {0}', [phones[q.rider_id]])} onPress={() => call(phones[q.rider_id])}><Phone size={19} color={C.ink} /></IconButton> : null}
                  <IconButton label={t('راسل')} onPress={() => message(q.rider_id)}><MessageCircle size={19} color={C.ink} /></IconButton>
                </Row>
                {q.note ? <T v="small" color={C.ink2} style={{ backgroundColor: C.soft, borderRadius: 12, padding: 10 }}>{q.note}</T> : null}
                {q.status === 'pending' && (
                  <Row gap={8}>
                    <Button title={t('اقبل')} icon={<Check size={16} color={C.onPrimary} />} onPress={() => answer(q, true)} loading={busy === q.id} disabled={!!busy || q.seats > free} style={{ flex: 1, minHeight: 42 }} />
                    <Button kind="soft" title={t('اعتذر')} icon={<X size={16} color={C.primary} />} onPress={() => answer(q, false)} disabled={!!busy} style={{ flex: 1, minHeight: 42 }} />
                  </Row>
                )}
                {q.status === 'pending' && q.seats > free ? <T v="tiny" color={C.red}>{t('لا توجد مقاعد كافية لهذا الطلب.')}</T> : null}
              </View>
            ))}
            <Button kind="soft" title={need ? t('إلغاء الطلب') : t('إلغاء التوصيلة')} onPress={cancelRide} loading={busy === 'cancel'} style={{ marginTop: 6 }} />
          </>
        )}
        <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('لا يظهر الرقم إلا للسائق والراكب بعد القبول.')}</T>
      </ScrollView>
      <AskSeatSheet ride={ask ? ride : null} onClose={() => setAsk(false)} onDone={() => { setAsk(false); load(); }} />
    </Screen>
  );
}
