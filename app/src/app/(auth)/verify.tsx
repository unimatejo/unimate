import { router, useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useRef, useState, type ComponentRef } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Button, Header, Screen, T } from '@/components/ui';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { C, F } from '@/lib/theme';

export default function Verify() {
  const { email, uni } = useLocalSearchParams<{ email: string; uni: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  async function verify(c = code) {
    if (c.length < 6) return;
    setBusy(true); setError(null);
    const { error: e } = await verifyEmailCode(email, c);
    setBusy(false);
    if (e) {
      setError('الرمز غلط أو انتهى. تأكد منه وجرّب مرة ثانية.');
      shake.value = withSequence(withTiming(10, { duration: 50 }), withTiming(-10, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(0, { duration: 50 }));
      return;
    }
    router.replace('/(auth)/welcome');
  }

  return (
    <Screen>
      <Header title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 24, gap: 22 }}>
        <Animated.View entering={FadeInDown.duration(500)} style={{ gap: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <MailCheck size={30} color={C.primary} />
          </View>
          <T v="h1">افتح إيميلك</T>
          <T v="body" color={C.muted}>بعتنا رسالة على {email}{uni ? ` (${uni})` : ''}. اضغط الرابط اللي فيها من هالتلفون وبتدخل علطول، أو اكتب الرمز هون إذا وصلك رمز.</T>
        </Animated.View>

        <Pressable onPress={() => input.current?.focus()}>
          <Animated.View style={[{ flexDirection: 'row-reverse', justifyContent: 'space-between' }, shakeStyle]}>
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
        <TextInput
          ref={input} value={code} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
          maxLength={6} onChangeText={(t) => { const c = t.replace(/\D/g, ''); setCode(c); if (c.length === 6) verify(c); }}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }} accessibilityLabel="رمز التحقق"
        />
        {error && <T v="small" color={C.danger}>{error}</T>}
        <Button title="تأكيد" loading={busy} disabled={code.length < 6} onPress={() => verify()} />
        <Button kind="ghost" title={resent ? 'بعتنا رمز جديد' : 'ما وصلني، ابعت مرة ثانية'} disabled={resent}
          onPress={async () => { await sendEmailCode(email); setResent(true); }} style={{ minHeight: 44 }} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
