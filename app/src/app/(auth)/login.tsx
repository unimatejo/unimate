import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BookOpen, CalendarDays, GraduationCap, Lock, Mail, MessageCircle, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, Alert } from 'react-native';
import Animated, { FadeIn, Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Row, T } from '@/components/ui';
import { sendEmailCode, signInWithMicrosoftAndCourses, universityForEmail } from '@/lib/auth';
import { C, F } from '@/lib/theme';
import { nm, t } from '@/lib/i18n';
import { say, useAppContent } from '@/lib/appContent';

// Microsoft sign-in shows only once the Azure app is set up (EXPO_PUBLIC_MS_LOGIN=1).
const MS_READY = process.env.EXPO_PUBLIC_MS_LOGIN === '1';

function Bubble({ children, label, color, style, delay }: { children: ReactNode; label: string; color: string; style: object; delay: number }) {
  const y = useSharedValue(0);
  useEffect(() => { y.value = withDelay(delay, withRepeat(withTiming(-8, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true)); }, [y, delay]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[{ position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 12,
      shadowColor: '#0E1430', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 }, style, s]}>
      <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
      <T v="bold" style={{ fontSize: 13 }}>{label}</T>
    </Animated.View>
  );
}

export default function Login() {
  const content = useAppContent(); // texts the owner can change
  const [email, setEmail] = useState('');
  // one busy flag per button, so the spinner shows on the button you pressed and both are locked while one works
  const [msBusy, setMsBusy] = useState(false);
  const [mailBusy, setMailBusy] = useState(false);
  const busy = msBusy || mailBusy;
  const [error, setError] = useState<string | null>(null);

  async function microsoft() {
    if (busy) return;
    setError(null); setMsBusy(true);
    try {
      const res = await signInWithMicrosoftAndCourses();
      if ('error' in res && res.error && res.error.message !== 'cancelled' && res.error.message !== 'redirecting') setError(t('تعذّر تسجيل الدخول بحساب Microsoft. قد تتطلب جامعتك موافقة، جرّب رابطًا عبر البريد الإلكتروني.'));
    } catch {
      setError(t('تعذّر إرسال الرسالة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'));
    } finally { setMsBusy(false); }
  }

  async function sendCode() {
    if (busy || !email.includes('@')) return;
    setError(null); setMailBusy(true);
    try {
      let uni;
      try { uni = await universityForEmail(email); } catch { setError(t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.')); return; }
      // not a university email: this is the team's sign-in (password + authenticator code). It never says whether the email is on the team.
      if (!uni) { router.push({ pathname: '/(auth)/team', params: { email: email.trim().toLowerCase() } }); return; }
      const { error: e } = await sendEmailCode(email);
      if (e) {
        setError(/rate|limit/i.test(e.message) ? t('وصلنا إلى الحد المسموح من رسائل البريد الإلكتروني حاليًا. حاول بعد قليل.') : t('تعذّر إرسال الرسالة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'));
        return;
      }
      router.push({ pathname: '/(auth)/verify', params: { email, uni: nm(uni) } });
    } catch {
      setError(t('تعذّر إرسال الرسالة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.'));
    } finally { setMailBusy(false); }
  }

  // links opened inside WhatsApp / Instagram / Snapchat use their own browser, which loses the Microsoft sign-in half way
  const inApp = Platform.OS === 'web' && typeof navigator !== 'undefined'
    ? (/WhatsApp/i.test(navigator.userAgent) ? 'واتساب' : /Instagram/i.test(navigator.userAgent) ? 'إنستغرام' : /FBAN|FBAV|FB_IAB/i.test(navigator.userAgent) ? 'فيسبوك' : /Snapchat/i.test(navigator.userAgent) ? 'سناب شات' : /TikTok|musical_ly/i.test(navigator.userAgent) ? 'تيك توك' : /Telegram/i.test(navigator.userAgent) ? 'تيليجرام' : null)
    : null;
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
          <LinearGradient colors={['#1B2250', '#070A1C']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }}
            style={{ height: 330, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: 'hidden' }}>
            <SafeAreaView edges={['top']} style={{ flex: 1 }}>
              <Row gap={10} style={{ paddingHorizontal: 24, paddingTop: 12 }}>
                <Image source={require('../../../assets/images/icon.png')} style={{ width: 42, height: 42, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }} />
                <T v="h2" color={C.white}>{t('يونيميت')}</T>
              </Row>
              <View style={{ flex: 1 }}>
                <Bubble label={t('جدولي')} color={C.primary} style={{ top: 34, right: 26 }} delay={0}><CalendarDays size={16} color={C.white} /></Bubble>
                <Bubble label={t('ملخصات')} color={C.green} style={{ top: 96, left: 24 }} delay={500}><BookOpen size={16} color={C.white} /></Bubble>
                <Bubble label={t('مجتمع جامعتي')} color={C.orange} style={{ top: 160, right: 54 }} delay={900}><Users size={16} color={C.white} /></Bubble>
                <Bubble label={t('رسائل')} color={C.pink} style={{ top: 214, left: 60 }} delay={300}><MessageCircle size={16} color={C.white} /></Bubble>
              </View>
            </SafeAreaView>
          </LinearGradient>

          <SafeAreaView edges={['bottom']} style={{ flex: 1, paddingHorizontal: 24, paddingTop: 26, paddingBottom: 16, gap: 18 }}>
            <Animated.View entering={FadeIn.delay(100).duration(220)} style={{ gap: 8 }}>
              <T v="h1">{say(content.login?.title, content.login?.title_en) || t('جامعتك كلها في جيبك')}</T>
              <T v="body" color={C.muted}>{say(content.login?.tagline, content.login?.tagline_en) || t('جدولك يظهر تلقائيًا، ومجتمع جامعتك كله في مكان واحد، ورسائل دون رقم جوال.')}</T>
            </Animated.View>

            {inApp && (
              <View style={{ backgroundColor: C.orangeSoft, borderRadius: 18, padding: 14, gap: 8 }}>
                <T v="bold" color={C.orange}>{t('افتح الرابط في سفاري أو كروم')}</T>
                <T v="small" color={C.ink2}>{t('أنت تفتح يونيميت من داخل {0}، ولا يمكن إكمال تسجيل الدخول بمايكروسوفت من هنا. اضغط ⋯ في الأعلى واختر «افتح في المتصفح»، أو انسخ الرابط والصقه في سفاري.', [inApp])}</T>
                <Button kind="white" title={t('انسخ الرابط')} onPress={() => { try { navigator.clipboard?.writeText('https://app.unimate.my'); } catch { /* */ } Alert.alert(t('تم نسخ الرابط ✓'), 'https://app.unimate.my'); }} style={{ minHeight: 40 }} />
              </View>
            )}
            <Animated.View entering={FadeIn.delay(200).duration(220)} style={{ gap: 10 }}>
              {MS_READY && (
                <>
                  <Button title={t('سجّل الدخول بحساب الجامعة (مايكروسوفت)')} loading={msBusy} disabled={mailBusy} onPress={microsoft} icon={<GraduationCap size={20} color={C.white} />} />
                  <Row gap={10} style={{ marginVertical: 2 }}><View style={{ flex: 1, height: 1, backgroundColor: C.line }} /><T v="tiny" color={C.faint}>{t('أو')}</T><View style={{ flex: 1, height: 1, backgroundColor: C.line }} /></Row>
                </>
              )}
              <Field
                value={email} onChangeText={setEmail} placeholder={t('بريدك الإلكتروني الجامعي')}
                keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
                style={{ textAlign: 'left', writingDirection: 'ltr' }} onSubmitEditing={sendCode} returnKeyType="send"
              />
              <Button kind={MS_READY ? 'soft' : 'primary'} title={t('أرسل لي رابطاً على بريدي الإلكتروني')} loading={mailBusy} onPress={sendCode} disabled={!email.includes('@') || msBusy} icon={<Mail size={19} color={MS_READY ? C.ink : C.white} />} />
              {error && <T v="small" color={C.danger} style={{ textAlign: 'center' }}>{error}</T>}
            </Animated.View>

            <View style={{ flex: 1 }} />
            <Row gap={6} style={{ justifyContent: 'center' }}>
              <Lock size={13} color={C.faint} />
              <T v="tiny" color={C.faint} style={{ fontFamily: F.body }}>{t('سنرسل لك رابط تسجيل الدخول إلى بريدك الجامعي. لا حاجة إلى كلمة مرور.')}</T>
            </Row>
          </SafeAreaView>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
