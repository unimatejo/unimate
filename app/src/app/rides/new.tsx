import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { DepartPicker } from '@/components/rides/DepartPicker';
import { SeatIcons } from '@/components/rides/RideCard';
import { Stepper } from '@/components/rides/RideSheet';
import { Button, Chip, Field, Header, Row, Screen, Segmented, T, Toggle } from '@/components/ui';
import { run } from '@/lib/run';
import { AREAS, EMOJI, LIMITS, clean, dayLabel, directionLabel, priceLabel, rideError, timeLabel, type Direction } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

const OTHER = '__other__';

/** A default departure: the next round half hour at least 30 minutes away. */
function nextSlot() {
  const d = new Date(Date.now() + 30 * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

/** Offer a ride: where from / to, when, how many seats, how much (or free). Same limits as the server. */
export default function NewRide() {
  const [dir, setDir] = useState<Direction>('to_campus');
  const [pick, setPick] = useState<string | null>(null);
  const [custom, setCustom] = useState('');
  const [meet, setMeet] = useState('');
  const [depart, setDepart] = useState(nextSlot);
  const [seats, setSeats] = useState(3);
  const [free, setFree] = useState(true);
  const [quarters, setQuarters] = useState(4); // price in 0.25 JOD steps (4 = 1 JOD)
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const min = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const max = useMemo(() => new Date(Date.now() + LIMITS.daysAhead * 86400000 - 60000), []);
  const area = pick === OTHER ? clean(custom) : pick ?? '';
  const price = free ? 0 : quarters * LIMITS.priceStep;

  const problem = (() => {
    if (area.length < LIMITS.areaMin) return t('اختار المنطقة');
    if (area.length > LIMITS.areaMax) return t('اسم المنطقة طويل');
    if (depart.getTime() < Date.now() + 5 * 60000) return t('اختار وقت من بعد 5 دقايق على الأقل');
    if (depart.getTime() > Date.now() + LIMITS.daysAhead * 86400000) return t('بتقدر تعرض توصيلة لحد أسبوعين لقدام');
    if (seats < 1 || seats > LIMITS.seatsMax) return t('عدد المقاعد من 1 لـ 6');
    if (price < 0 || price > LIMITS.priceMax) return t('السعر من 0 لـ 10 دنانير');
    return null;
  })();

  async function submit() {
    if (problem || busy) { if (problem) toast.error(problem); return; }
    setBusy(true);
    const r = await run(supabase.rpc('offer_ride', {
      p_direction: dir, p_area: area, p_meet: clean(meet).slice(0, LIMITS.meetMax) || null, p_depart: depart.toISOString(),
      p_seats: seats, p_price: price, p_notes: clean(notes).slice(0, LIMITS.notesMax) || null,
    }), { quiet: true });
    setBusy(false);
    if (!r.ok) { toast.error(rideError(r.error)); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(t('انعرضت توصيلتك ✓'));
    router.replace({ pathname: '/rides/[id]', params: { id: r.data as unknown as string } });
  }

  return (
    <Screen>
      <Header title={t('اعرض توصيلة')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60, gap: 18 }}>
          <Segmented items={[t('للجامعة'), t('من الجامعة')]} value={dir === 'to_campus' ? 0 : 1} onChange={(i) => setDir(i === 0 ? 'to_campus' : 'from_campus')} />

          <View style={{ gap: 10 }}>
            <T v="bold">{dir === 'to_campus' ? t('من وين طالع؟') : t('لوين رايح؟')}</T>
            {AREAS.map((g) => (
              <View key={g.city} style={{ gap: 8 }}>
                <T v="tiny" color={C.muted}>{g.city}</T>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  {g.areas.map((a) => <Chip key={a} label={a} active={pick === a} onPress={() => setPick(a)} />)}
                </Row>
              </View>
            ))}
            <Row gap={8}><Chip label={t('غير')} active={pick === OTHER} onPress={() => setPick(OTHER)} /></Row>
            {pick === OTHER && <Field value={custom} onChangeText={(v) => setCustom(v.slice(0, LIMITS.areaMax))} placeholder={t('اكتب المنطقة')} maxLength={LIMITS.areaMax} autoFocus />}
          </View>

          <Field label={t('نقطة التجمّع (اختياري)')} value={meet} onChangeText={(v) => setMeet(v.slice(0, LIMITS.meetMax))} maxLength={LIMITS.meetMax}
            placeholder={dir === 'to_campus' ? t('مثلاً: دوار طبربور جنب الصيدلية') : t('مثلاً: البوابة الشمالية')} />

          <View style={{ gap: 8 }}>
            <T v="bold">{t('إيمتى؟')}</T>
            <DepartPicker value={depart} onChange={setDepart} min={min} max={max} />
          </View>

          <Stepper label={t('كم مقعد فاضي؟')} value={seats} min={1} max={LIMITS.seatsMax} onChange={setSeats} />

          <View style={{ gap: 10 }}>
            <Toggle value={free} onChange={setFree} label={t('ببلاش')} hint={t('أو حط مبلغ رمزي يغطي البنزين')} />
            {!free && <Stepper label={t('المبلغ لكل راكب')} value={quarters} min={1} max={LIMITS.priceMax / LIMITS.priceStep} onChange={setQuarters} format={(q) => String(q * LIMITS.priceStep)} />}
          </View>

          <View style={{ gap: 4 }}>
            <Field label={t('ملاحظات (اختياري)')} value={notes} onChangeText={(v) => setNotes(v.slice(0, LIMITS.notesMax))} maxLength={LIMITS.notesMax} multiline
              placeholder={t('مثلاً: بستنى 5 دقايق بس، ممنوع التدخين')} style={{ minHeight: 90, paddingTop: 14, textAlignVertical: 'top' }} />
            <T v="tiny" color={C.faint} style={{ alignSelf: 'flex-end' }}>{`${notes.length}/${LIMITS.notesMax}`}</T>
          </View>

          {/* what classmates will see */}
          <View style={[{ backgroundColor: C.card, borderRadius: 26, padding: 14, gap: 10 }, shadow]}>
            <Row gap={12}>
              <Image source={dir === 'to_campus' ? EMOJI.school : EMOJI.house} style={{ width: 48, height: 48 }} contentFit="contain" />
              <View style={{ flex: 1, gap: 2 }}>
                <T v="tiny" color={C.muted}>{directionLabel(dir)} · {dayLabel(depart.toISOString())}</T>
                <T style={{ fontFamily: F.display, fontSize: 22 }}>{timeLabel(depart.toISOString())}</T>
                <T v="bold" numberOfLines={1}>{area || t('المنطقة')}</T>
              </View>
            </Row>
            <Row gap={10}>
              <SeatIcons total={seats} taken={0} />
              <T v="small" color={price ? C.orangeInk : C.greenInk}>{priceLabel(price)}</T>
            </Row>
          </View>

          <Row gap={8} style={{ backgroundColor: C.primarySoft, borderRadius: 16, padding: 12 }}>
            <ShieldCheck size={18} color={C.primary} />
            <T v="small" color={C.ink2} style={{ flex: 1 }}>{t('لا تشارك رقمك، تواصل من داخل يونيميت.')}</T>
          </Row>

          <Button title={t('اعرض التوصيلة')} onPress={submit} loading={busy} disabled={busy || !!problem} />
          {problem && area.length >= LIMITS.areaMin ? <T v="tiny" color={C.red} style={{ textAlign: 'center' }}>{problem}</T> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
