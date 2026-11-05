import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Row, T } from '@/components/ui';
import { RideSheet, Stepper } from './RideSheet';
import { run } from '@/lib/run';
import { EMOJI, LIMITS, clean, dayLabel, rideError, seatsLeft, timeLabel, type Ride } from '@/lib/rides';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

/** Ask the driver for 1–3 seats (never more than are free), with an optional short note. */
export function AskSeatSheet({ ride, onClose, onDone }: { ride: Ride | null; onClose: () => void; onDone: () => void }) {
  const free = ride ? Math.min(LIMITS.askMax, seatsLeft(ride)) : 1;
  const [seats, setSeats] = useState(1);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSeats(1); setNote(''); }, [ride?.id]);

  async function send() {
    if (!ride || busy) return;
    setBusy(true);
    const r = await run(supabase.rpc('request_ride', { p_ride: ride.id, p_seats: seats, p_note: clean(note).slice(0, LIMITS.noteMax) || null }), { quiet: true });
    setBusy(false);
    if (!r.ok) { toast.error(rideError(r.error)); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(t('انبعت طلبك للسائق ✓'));
    onDone();
  }

  return (
    <RideSheet open={!!ride} onClose={onClose} title={t('اطلب مقعد')} sub={ride ? `${ride.area} · ${dayLabel(ride.depart_at)} ${timeLabel(ride.depart_at)}` : undefined}>
      <Row gap={12} style={{ backgroundColor: C.primarySoft, borderRadius: 18, padding: 12 }}>
        <Image source={EMOJI.seat} style={{ width: 44, height: 44 }} contentFit="contain" />
        <T v="small" color={C.ink2} style={{ flex: 1 }}>{t('السائق بيشوف طلبك وبيقبله أو بيعتذر، وبيوصلك إشعار.')}</T>
      </Row>
      <Stepper label={t('كم مقعد؟')} value={seats} min={1} max={Math.max(1, free)} onChange={setSeats} />
      <View style={{ gap: 4 }}>
        <Field label={t('ملاحظة للسائق (اختياري)')} value={note} onChangeText={(v) => setNote(v.slice(0, LIMITS.noteMax))} placeholder={t('مثلاً: بستنى عند البوابة الشمالية')} maxLength={LIMITS.noteMax} />
        <T v="tiny" color={C.faint} style={{ alignSelf: 'flex-end' }}>{`${note.length}/${LIMITS.noteMax}`}</T>
      </View>
      <T v="tiny" color={C.muted}>{t('لا تشارك رقمك، تواصل من داخل يونيميت.')}</T>
      <Button title={t('ابعت الطلب')} onPress={send} loading={busy} disabled={busy || free < 1} />
    </RideSheet>
  );
}
