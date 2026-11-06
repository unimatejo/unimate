import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Phone, ShieldCheck } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { DepartPicker } from '@/components/rides/DepartPicker';
import { SeatIcons } from '@/components/rides/RideCard';
import { Stepper } from '@/components/rides/RideSheet';
import { ChoiceField, MultiChoiceField } from '@/components/ui/Choices';
import { Button, Field, Header, Row, Screen, Segmented, T, Toggle } from '@/components/ui';
import { run } from '@/lib/run';
import { AREAS, CAMPUS_SPOTS, EMOJI, LIMITS, clean, dayLabel, directionLabel, joMobile, priceLabel, rideError, routeLabel, timeLabel, type Direction, type RideKind } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

/** A default departure: the next round half hour at least 30 minutes away. */
function nextSlot() {
  const d = new Date(Date.now() + 30 * 60000);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() < 30 ? 30 : 60);
  return d;
}

/**
 * Offer a ride, or ask for one ("بدي توصيلة"): the areas it passes through, where on campus, when, seats, price,
 * and optionally a phone that only the accepted side ever sees. Same limits as the server (0100).
 */
export default function NewRide() {
  const { kind: k0 } = useLocalSearchParams<{ kind?: string }>();
  const [kind, setKind] = useState<RideKind>(k0 === 'need' ? 'need' : 'offer');
  const [dir, setDir] = useState<Direction>('to_campus');
  const [areas, setAreas] = useState<string[]>([]);
  const [spot, setSpot] = useState<string | null>(null);
  const [sharePhone, setSharePhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [meet, setMeet] = useState('');
  const [depart, setDepart] = useState(nextSlot);
  const [seats, setSeats] = useState(3);
  const [free, setFree] = useState(true);
  const [quarters, setQuarters] = useState(4); // price in 0.25 JOD steps (4 = 1 JOD)
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const min = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const max = useMemo(() => new Date(Date.now() + LIMITS.daysAhead * 86400000 - 60000), []);
  const need = kind === 'need';
  const area = areas[0] ?? '';
  const price = free ? 0 : quarters * LIMITS.priceStep;

  const problem = (() => {
    if (area.length < LIMITS.areaMin) return t('اختار المنطقة');
    if (sharePhone && !joMobile(phone)) return t('رقم الموبايل مش صحيح، اكتبه مثل 0791234567.');
    if (depart.getTime() < Date.now() + 5 * 60000) return t('اختار وقت من بعد 5 دقايق على الأقل');
    if (depart.getTime() > Date.now() + LIMITS.daysAhead * 86400000) return t('بتقدر تعرض توصيلة لحد أسبوعين لقدام');
    if (seats < 1 || seats > (need ? LIMITS.askMax : LIMITS.seatsMax)) return need ? t('عددكم من 1 لـ 3') : t('عدد المقاعد من 1 لـ 6');
    if (price < 0 || price > LIMITS.priceMax) return t('السعر من 0 لـ 10 دنانير');
    return null;
  })();

  async function submit() {
    if (problem || busy) { if (problem) toast.error(problem); return; }
    setBusy(true);
    const r = await run(supabase.rpc('offer_ride', {
      p_direction: dir, p_area: area, p_meet: clean(meet).slice(0, LIMITS.meetMax) || null, p_depart: depart.toISOString(),
      p_seats: seats, p_price: price, p_notes: clean(notes).slice(0, LIMITS.notesMax) || null,
      p_kind: kind, p_stops: areas.slice(1), p_campus_spot: spot, p_phone: sharePhone ? joMobile(phone) : null,
    }), { quiet: true });
    setBusy(false);
    if (!r.ok) { toast.error(rideError(r.error)); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(need ? t('نزل طلبك ✓ بيوصلك إشعار أول ما حدا يعرض يوصلك') : t('انعرضت توصيلتك ✓'));
    router.replace({ pathname: '/rides/[id]', params: { id: r.data as unknown as string } });
  }

  return (
    <Screen>
      <Header title={need ? t('بدي توصيلة') : t('اعرض توصيلة')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 60, gap: 18 }}>
          <Segmented items={[t('عندي سيارة'), t('بدي توصيلة')]} value={need ? 1 : 0} onChange={(i) => { setKind(i ? 'need' : 'offer'); setSeats(i ? 1 : 3); }} />
          <Segmented items={[t('للجامعة'), t('من الجامعة')]} value={dir === 'to_campus' ? 0 : 1} onChange={(i) => setDir(i === 0 ? 'to_campus' : 'from_campus')} />

          <View style={{ gap: 10 }}>
            <T v="bold">{dir === 'to_campus' ? t('من وين طالع؟') : t('لوين رايح؟')}</T>
            <T v="tiny" color={C.muted}>{need ? t('اختار منطقتك، أو اكتبها.') : t('بتقدر تختار لحد {0} مناطق بتمرق فيهم، أو تكتب أي منطقة.', [String(LIMITS.areasMax)])}</T>
            <MultiChoiceField value={areas} onChange={setAreas} max={need ? 1 : LIMITS.areasMax} maxLength={LIMITS.areaMax}
              options={AREAS.map((g) => ({ title: g.city, options: g.areas }))} placeholder={t('اكتب منطقة ثانية')}
              validate={(v) => (v.length < LIMITS.areaMin ? t('الاسم قصير') : null)} />
          </View>

          <View style={{ gap: 8 }}>
            <T v="bold">{dir === 'to_campus' ? t('وين بتنزل بالجامعة؟ (اختياري)') : t('من وين بتطلع بالجامعة؟ (اختياري)')}</T>
            <ChoiceField value={spot} onChange={setSpot} options={CAMPUS_SPOTS} placeholder={t('مثلاً: كلية الهندسة')} maxLength={LIMITS.spotMax} />
          </View>

          <Field label={t('نقطة التجمّع (اختياري)')} value={meet} onChangeText={(v) => setMeet(v.slice(0, LIMITS.meetMax))} maxLength={LIMITS.meetMax}
            placeholder={dir === 'to_campus' ? t('مثلاً: دوار طبربور جنب الصيدلية') : t('مثلاً: البوابة الشمالية')} />

          <View style={{ gap: 8 }}>
            <T v="bold">{t('إيمتى؟')}</T>
            <DepartPicker value={depart} onChange={setDepart} min={min} max={max} />
          </View>

          <Stepper label={need ? t('كم واحد إنتو؟') : t('كم مقعد فاضي؟')} value={seats} min={1} max={need ? LIMITS.askMax : LIMITS.seatsMax} onChange={setSeats} />

          <View style={{ gap: 10 }}>
            <Toggle value={free} onChange={setFree} label={need ? t('بدون مبلغ') : t('ببلاش')} hint={need ? t('أو حط قديش بتدفع للسائق') : t('أو حط مبلغ رمزي يغطي البنزين')} />
            {!free && <Stepper label={need ? t('بدفع لكل واحد') : t('المبلغ لكل راكب')} value={quarters} min={1} max={LIMITS.priceMax / LIMITS.priceStep} onChange={setQuarters} format={(q) => String(q * LIMITS.priceStep)} />}
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
                <T v="bold" numberOfLines={2}>{area ? routeLabel({ area, stops: areas.slice(1), direction: dir }) : t('المنطقة')}</T>
                {spot ? <T v="tiny" color={C.ink2}>{spot}</T> : null}
              </View>
            </Row>
            <Row gap={10}>
              <SeatIcons total={seats} taken={0} />
              <T v="small" color={price ? C.orangeInk : C.greenInk}>{priceLabel(price)}</T>
            </Row>
          </View>

          <View style={{ gap: 10 }}>
            <Toggle value={sharePhone} onChange={setSharePhone} icon={<Phone size={20} color={C.primary} />} label={t('شارك رقمي')}
              hint={need ? t('بيبيّن بس للي بتقبله يوصلك') : t('بيبيّن بس للي بتقبلهم بالتوصيلة')} />
            {sharePhone && (
              <Field value={phone} onChangeText={(v) => setPhone(v.slice(0, 16))} keyboardType="phone-pad" placeholder="07XXXXXXXX" maxLength={16}
                style={{ textAlign: 'left', writingDirection: 'ltr' }} />
            )}
          </View>

          <Row gap={8} style={{ backgroundColor: C.primarySoft, borderRadius: 16, padding: 12 }}>
            <ShieldCheck size={18} color={C.primary} />
            <T v="small" color={C.ink2} style={{ flex: 1 }}>{t('رقمك ما بيبيّن بالقائمة لحدا. بتقدر كمان تحكوا من داخل يونيميت.')}</T>
          </Row>

          <Button title={need ? t('نزّل الطلب') : t('اعرض التوصيلة')} onPress={submit} loading={busy} disabled={busy || !!problem} />
          {problem && area.length >= LIMITS.areaMin ? <T v="tiny" color={C.red} style={{ textAlign: 'center' }}>{problem}</T> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
