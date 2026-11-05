import { router, useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Button, Header, Screen, T } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { C, F, isDark } from '@/lib/theme';
import { isAR, t } from '@/lib/i18n';

export default function Verify() {
  const { email, uni } = useLocalSearchParams<{ email: string; uni: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(60); // seconds until "send again" is allowed
  useEffect(() => { if (wait <= 0) return; const tm = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(tm); }, [wait]);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  async function verify(c = code) {
    if (c.length < 6 || busy) return;
    setBusy(true); setError(null);
    let e: unknown = null;
    try { ({ error: e } = await verifyEmailCode(email, c)); } catch (x) { e = x; } finally { setBusy(false); }
    if (e) {
      setError(t('الرمز غلط أو انتهى. تأكد منه وجرّب مرة ثانية.'));
      shake.value = withSequence(withTiming(10, { duration: 50 }), withTiming(-10, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(0, { duration: 50 }));
      return;
    }
    router.replace('/');  // the gate sends the user to setup or home
  }

  return (
    <Screen>
      <Header title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 24, gap: 22 }}>
        <Animated.View entering={FadeIn.duration(220)} style={{ gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <MailCheck size={30} color={C.primary} />
          </View>
          <T v="h1">{t('افتح إيميلك')}</T>
          <T v="body" color={C.muted}>{t('بعتنا رسالة على')} {`\u2066${email}\u2069`}{uni ? ` (${uni})` : ''}{t('. اضغط الرابط اللي فيها من هالتلفون وبتدخل علطول، أو اكتب الرمز هون إذا وصلك رمز.')}</T>
        </Animated.View>

        <Pressable onPress={() => input.current?.focus()}>
          <Animated.View style={[{ flexDirection: isAR ? 'row-reverse' : 'row', justifyContent: 'space-between' }, shakeStyle]}>
            {Array.from({ length: 6 }).map((_, i) => {
              const filled = i < code.length; const focused = i === code.length;
              return (
                <View key={i} style={{ width: 48, height: 60, borderRadius: 16, backgroundColor: C.card, borderWidth: 2, borderColor: focused ? C.primary : filled ? C.ink : C.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>{code[i] ?? ''}</Text>
                </View>
              );
            })}
          </Animated.View>
        </Pressable>
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
          ref={input} value={code} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
          maxLength={6} onChangeText={(v) => { const c = v.replace(/\D/g, ''); setCode(c); if (c.length === 6 && !busy) verify(c); }}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }} accessibilityLabel={t('رمز التحقق')}
        />
        {error && <T v="small" color={C.danger}>{error}</T>}
        <Button title={t('تأكيد')} loading={busy} disabled={code.length < 6} onPress={() => verify()} />
        <Button kind="ghost" title={wait > 0 ? t('ابعت مرة ثانية بعد {0} ثانية', [wait]) : t('ما وصلني، ابعت مرة ثانية')} disabled={wait > 0}
          onPress={async () => {
            setWait(60); setError(null);
            try {
              const { error: e } = await sendEmailCode(email);
              if (e) { setWait(0); setError(/rate|limit/i.test(e.message) ? t('وصلنا الحد المسموح من الإيميلات هلأ. جرّب بعد شوي.') : t('ما قدرنا نبعث الرسالة. تأكد من الإنترنت وجرّب مرة ثانية.')); }
            } catch { setWait(0); setError(t('ما قدرنا نبعث الرسالة. تأكد من الإنترنت وجرّب مرة ثانية.')); }
          }} style={{ minHeight: 44 }} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
