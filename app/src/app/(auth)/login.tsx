import { router } from 'expo-router';
import { GraduationCap, Lock, Mail } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Row, T } from '@/components/ui';
import { sendEmailCode, signInWithMicrosoft, universityForEmail } from '@/lib/auth';
import { C, F } from '@/lib/theme';

function Float({ size, color, top, right, left, radius, delay = 0, rotate = 0 }: { size: number; color: string; top: number; right?: number; left?: number; radius: number; delay?: number; rotate?: number }) {
  const y = useSharedValue(0);
  useEffect(() => {
    y.value = withRepeat(withTiming(-14, { duration: 3200 + delay, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [y, delay]);
  const s = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { rotate: `${rotate}deg` }] }));
  return <Animated.View style={[{ position: 'absolute', top, right, left, width: size, height: size, borderRadius: radius, backgroundColor: color }, s]} />;
}

export default function Login() {
  const [mode, setMode] = useState<'choose' | 'email'>('choose');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function microsoft() {
    setError(null); setBusy(true);
    const res = await signInWithMicrosoft();
    setBusy(false);
    if ('error' in res && res.error && res.error.message !== 'cancelled') {
      setError('الدخول بمايكروسوفت مش متاح هلأ. جرّب الدخول برمز على الإيميل.');
    }
  }

  async function sendCode() {
    setError(null);
    const uni = await universityForEmail(email);
    if (!uni) { setError('اكتب إيميلك الجامعي، مثلاً 2021xxxx@hu.edu.jo'); return; }
    setBusy(true);
    const { error: e } = await sendEmailCode(email);
    setBusy(false);
    if (e) { setError(e.message.includes('rate') ? 'طلبت رموز كثير. استنى دقيقة وجرّب مرة ثانية.' : 'ما قدرنا نبعث الرمز. جرّب مرة ثانية.'); return; }
    router.push({ pathname: '/(auth)/verify', params: { email, uni: uni.name_ar } });
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 460 }} pointerEvents="none">
        <Float size={150} color={C.primary} top={80} right={28} radius={48} rotate={-12} />
        <Float size={120} color={C.pink} top={200} left={30} radius={60} delay={600} />
        <Float size={96} color="#FFB020" top={320} right={120} radius={30} delay={300} rotate={18} />
        <Float size={56} color={C.green} top={70} left={110} radius={20} delay={900} />
        <View style={{ position: 'absolute', top: 128, right: 72 }}><GraduationCap size={60} color={C.white} strokeWidth={2.2} /></View>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: 24, paddingBottom: 20, gap: 22 }}>
          <Animated.View entering={FadeInDown.delay(100).duration(600)} style={{ gap: 10 }}>
            <T v="h3" color="#9FB2FF">يونيميت</T>
            <T v="display" color={C.white}>جامعتك كلها،{'\n'}بجيبتك.</T>
            <T v="body" color="#C9D1F0">جدولك بيطلع لحاله، ومجتمع جامعتك كله بمكان واحد، ورسائل بدون رقم جوال.</T>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(250).duration(600)} style={{ gap: 10 }}>
            {mode === 'choose' ? (
              <>
                <Button kind="white" title="ادخل بحساب الجامعة" loading={busy} onPress={microsoft}
                  icon={<GraduationCap size={22} color={C.ink} />} />
                <Button kind="ghost" title="ادخل برمز على إيميل الجامعة" onPress={() => setMode('email')}
                  style={{ borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', minHeight: 50 }}
                  icon={<Mail size={19} color={C.white} />} />
              </>
            ) : (
              <>
                <Field
                  value={email} onChangeText={setEmail} placeholder="إيميلك الجامعي"
                  keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress"
                  style={{ backgroundColor: 'rgba(255,255,255,0.1)', color: C.white, textAlign: 'left', writingDirection: 'ltr' }}
                  placeholderTextColor="#AEB8D8" onSubmitEditing={sendCode} returnKeyType="send"
                />
                <Button title="ابعتلي الرمز" loading={busy} onPress={sendCode} disabled={!email.includes('@')} />
                <Button kind="ghost" title="رجوع" onPress={() => { setMode('choose'); setError(null); }} style={{ minHeight: 44 }} />
              </>
            )}
            {error && <T v="small" color="#FFB4C0" style={{ textAlign: 'center' }}>{error}</T>}
          </Animated.View>

          <Row gap={6} style={{ justifyContent: 'center' }}>
            <Lock size={13} color="#AEB8D8" />
            <T v="tiny" color="#AEB8D8" style={{ fontFamily: F.body }}>ما بنشوف كلمة سرك. الدخول عن طريق جامعتك مباشرة.</T>
          </Row>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </View>
  );
}
