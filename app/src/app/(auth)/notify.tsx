import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { AlarmClock, CalendarDays, MessageCircle, Share } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Button, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { markNotifIntroDone, notifStatus, turnOnNotifications, type NotifStatus } from '@/lib/notifPermission';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';

const BELL = require('../../../assets/emoji3d/bell_3d.png');

/**
 * Onboarding, once: why notifications matter, then the system prompt only when "turn on" is tapped.
 * Either answer finishes it for good (the app never asks again by itself).
 */
export default function NotifyIntro() {
  const { profile } = useAuth();
  const [st, setSt] = useState<NotifStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { notifStatus().then(setSt); }, []);

  // opened from Settings (a reminder needs it): back there; during onboarding: on into the app
  const { back } = useLocalSearchParams<{ back?: string }>();
  const go = () => (back && router.canGoBack() ? router.back() : router.replace('/(tabs)'));
  const later = () => { markNotifIntroDone(); go(); };
  async function on() {
    setBusy(true);
    await turnOnNotifications(profile?.id);
    setBusy(false);
    go();
  }

  const install = st === 'install'; // iPhone Safari: notifications work once UniMate is on the home screen
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26, gap: 22 }}>
        <Animated.View entering={FadeIn.duration(260)} style={{ alignItems: 'center' }}>
          <Image source={BELL} style={{ width: 132, height: 132 }} contentFit="contain" accessibilityIgnoresInvertColors />
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(80).duration(260)} style={{ gap: 8 }}>
          <T style={{ fontFamily: F.display, fontSize: 28, lineHeight: 40, textAlign: 'center' }}>{t('ما يفوتك إشي')}</T>
          <T v="body" color={C.muted} style={{ textAlign: 'center' }}>
            {install
              ? t('عشان توصلك الإشعارات على الآيفون، ضيف يونيميت للشاشة الرئيسية وافتحه من الأيقونة.')
              : t('فعّل الإشعارات عشان ما يفوتك موعد محاضرة أو امتحان أو تحديث بجدولك.')}
          </T>
        </Animated.View>
        <Animated.View entering={FadeInDown.delay(140).duration(260)} style={{ gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 16 }}>
          {install ? (
            <Line icon={<Share size={20} color={C.primary} />} text={t('من سفاري اكبس زر المشاركة، بعدين «إضافة إلى الشاشة الرئيسية».')} />
          ) : (
            <>
              <Line icon={<AlarmClock size={20} color={C.orange} />} text={t('تذكير قبل كل محاضرة')} />
              <Line icon={<CalendarDays size={20} color={C.violet} />} text={t('مواعيد الامتحانات وأي تغيير بجدولك')} />
              <Line icon={<MessageCircle size={20} color={C.green} />} text={t('الرسائل والإعلانات الرسمية من كليتك')} />
            </>
          )}
        </Animated.View>
        <View style={{ gap: 10 }}>
          {install
            ? <Button title={t('تمام')} onPress={later} />
            : <Button title={t('تفعيل الإشعارات')} loading={busy} onPress={on} disabled={st === null} />}
          {!install && <Button kind="ghost" title={t('مش هلأ')} onPress={later} disabled={busy} />}
          <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('بتقدر تغيّر كل نوع لحاله من الإعدادات بأي وقت.')}</T>
        </View>
      </View>
    </Screen>
  );
}

function Line({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Row gap={12}>
      <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <T v="bodyMd" style={{ flex: 1 }}>{text}</T>
    </Row>
  );
}
