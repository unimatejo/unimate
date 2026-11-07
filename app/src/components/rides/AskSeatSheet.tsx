import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Phone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Row, T, Toggle } from '@/components/ui';
import { RideSheet, Stepper } from './RideSheet';
import { run } from '@/lib/run';
import { EMOJI, LIMITS, clean, dayLabel, joMobile, rideError, routeLabel, seatsLeft, timeLabel, type Ride } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

/**
 * Ask the driver for 1–3 seats (never more than are free), or on a "أريد توصيلة" answer "سأوصلك".
 * A short note and a phone are optional; the phone only shows to the other side once accepted.
 */
export function AskSeatSheet({ ride, onClose, onDone }: { ride: Ride | null; onClose: () => void; onDone: () => void }) {
  const free = ride ? Math.min(LIMITS.askMax, seatsLeft(ride)) : 1;
  const [seats, setSeats] = useState(1);
  const [note, setNote] = useState('');
  const [sharePhone, setSharePhone] = useState(false);
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const need = ride?.kind === 'need';
  const badPhone = sharePhone && !joMobile(phone);
  useEffect(() => { setSeats(1); setNote(''); setSharePhone(false); }, [ride?.id]);

  async function send() {
    if (!ride || busy) return;
    if (badPhone) { toast.error(t('رقم الجوال غير صحيح، اكتبه بهذا الشكل 0791234567.')); return; }
    setBusy(true);
    const r = await run(supabase.rpc('request_ride', { p_ride: ride.id, p_seats: seats, p_note: clean(note).slice(0, LIMITS.noteMax) || null, p_phone: sharePhone ? joMobile(phone) : null }), { quiet: true });
    setBusy(false);
    if (!r.ok) { toast.error(rideError(r.error)); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(need ? t('تم إرسال عرضك ✓ سيصلك إشعار عند الرد') : t('تم إرسال طلبك إلى السائق ✓'));
    onDone();
  }

  return (
    <RideSheet open={!!ride} onClose={onClose} title={need ? t('سأوصلك') : t('اطلب مقعد')} sub={ride ? `${routeLabel(ride)} · ${dayLabel(ride.depart_at)} ${timeLabel(ride.depart_at)}` : undefined}>
      <Row gap={12} style={{ backgroundColor: C.primarySoft, borderRadius: 18, padding: 12 }}>
        <Image source={EMOJI.seat} style={{ width: 44, height: 44 }} contentFit="contain" />
        <T v="small" color={C.ink2} style={{ flex: 1 }}>{need ? t('يطّلع صاحب الطلب على عرضك ويختار من يوصله، وسيصلك إشعار.') : t('سيطّلع السائق على طلبك ويقبله أو يعتذر عنه، وسيصلك إشعار.')}</T>
      </Row>
      {!need && <Stepper label={t('كم مقعدًا؟')} value={seats} min={1} max={Math.max(1, free)} onChange={setSeats} />}
      <View style={{ gap: 4 }}>
        <Field label={need ? t('ملاحظة (اختياري)') : t('ملاحظة للسائق (اختياري)')} value={note} onChangeText={(v) => setNote(v.slice(0, LIMITS.noteMax))} placeholder={need ? t('مثلاً: سيارتي بيضاء، أنتظرك عند الدوار') : t('مثلاً: أنتظر عند البوابة الشمالية')} maxLength={LIMITS.noteMax} />
        <T v="tiny" color={C.faint} style={{ alignSelf: 'flex-end' }}>{`${note.length}/${LIMITS.noteMax}`}</T>
      </View>
      <Toggle value={sharePhone} onChange={setSharePhone} icon={<Phone size={20} color={C.primary} />} label={t('شارك رقمي')} hint={t('يظهر فقط إذا تم قبولك')} />
      {sharePhone && <Field value={phone} onChangeText={(v) => setPhone(v.slice(0, 16))} keyboardType="phone-pad" placeholder="07XXXXXXXX" maxLength={16} style={{ textAlign: 'left', writingDirection: 'ltr' }} />}
      <Button title={need ? t('أرسل العرض') : t('أرسل الطلب')} onPress={send} loading={busy} disabled={busy || free < 1 || badPhone} />
    </RideSheet>
  );
}
