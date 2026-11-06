import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { KeyRound, ShieldCheck, Smartphone } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Header, Screen, T } from '@/components/ui';
import { CodeBoxes, type CodeBoxesHandle } from '@/components/ui/CodeBoxes';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { isPasswordSession, nextStep, startEnroll, teamResetLink, teamSignIn, verifyCode } from '@/lib/team';
import { C, F, isDark } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Step = 'password' | 'code' | 'enroll';

/**
 * Team sign-in (reached by typing a non-university email on the sign-in screen):
 * password, then the 6-digit code from an authenticator app (set up the first time), then the admin panel.
 * Errors never say whether an email belongs to the team.
 */
export default function TeamSignIn() {
  const { email: initial } = useLocalSearchParams<{ email?: string }>();
  const { session, signOut } = useAuth();
  const [email, setEmail] = useState(initial ?? '');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<Step>('password');
  const [code, setCode] = useState('');
  const [enroll, setEnroll] = useState<{ factorId: string; qr: string; secret: string; uri: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const boxes = useRef<CodeBoxesHandle>(null);

  // already signed in with the password (e.g. the app was reopened before the code): continue from there
  useEffect(() => {
    if (!isPasswordSession(session) || step !== 'password') return;
    goOn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function goOn() {
    const { data } = await supabase.rpc('my_team_status');
    const s = data as { team: boolean; admin: boolean } | null;
    if (!s?.team && !s?.admin) { await signOut(); setStep('password'); setError(t('هاد الدخول لفريق يونيميت بس. الطلاب بيدخلوا بإيميل الجامعة.')); return; }
    const n = await nextStep();
    if (n === 'done') { router.replace('/admin'); return; }
    if (n === 'enroll') { try { setEnroll(await startEnroll()); } catch { setError(t('ما زبط تجهيز تطبيق المصادقة. جرّب كمان مرة.')); return; } }
    setCode(''); setStep(n);
  }

  async function signIn() {
    if (busy || !email.includes('@') || password.length < 1) return;
    setBusy(true); setError(null); setNote(null);
    try {
      const { error: e } = await teamSignIn(email, password);
      if (e) { setError(/rate|limit|many/i.test(e.message) ? t('محاولات كثيرة. استنى شوي وجرّب.') : t('الإيميل أو كلمة السر غلط.')); return; }
      await goOn();
    } catch { setError(t('تأكد من الإنترنت وجرّب كمان مرة.')); }
    finally { setBusy(false); }
  }

  async function checkCode(c = code) {
    if (c.length < 6 || busy) return;
    setBusy(true); setError(null);
    try {
      await verifyCode(c, step === 'enroll' ? enroll?.factorId : undefined);
      await supabase.auth.refreshSession();
      router.replace('/admin');
    } catch {
      setError(t('الرمز غلط أو انتهى وقته. افتح تطبيق المصادقة واكتب الرمز الجديد.'));
      setCode(''); boxes.current?.shake();
    } finally { setBusy(false); }
  }

  async function sendLink() {
    if (!email.includes('@')) { setError(t('اكتب إيميلك أول.')); return; }
    setError(null);
    const { error: e } = await teamResetLink(email);
    if (e && /rate|limit/i.test(e.message)) { setError(t('وصلنا الحد المسموح من الإيميلات هلأ. جرّب بعد شوي.')); return; }
    // same answer whether or not the email has an account
    setNote(t('إذا الإيميل لحساب بالفريق، وصلك رابط لتعيين كلمة السر. افتحه من نفس الجهاز.'));
  }

  return (
    <Screen>
      <Header title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, gap: 18, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Animated.View entering={FadeIn.duration(220)} style={{ gap: 12 }}>
            <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              {step === 'password' ? <KeyRound size={30} color={C.primary} /> : step === 'code' ? <ShieldCheck size={30} color={C.primary} /> : <Smartphone size={30} color={C.primary} />}
            </View>
            <T v="h1">{step === 'password' ? t('دخول فريق يونيميت') : step === 'code' ? t('رمز تطبيق المصادقة') : t('جهّز تطبيق المصادقة')}</T>
            <T v="body" color={C.muted}>
              {step === 'password' ? t('هاد الدخول لفريق إدارة يونيميت بإيميلك الشخصي وكلمة السر.')
                : step === 'code' ? t('افتح تطبيق المصادقة (Google Authenticator أو Microsoft Authenticator) واكتب الرمز تبع يونيميت.')
                  : t('مرة وحدة بس: امسح الكود بتطبيق المصادقة (Google Authenticator أو Microsoft Authenticator)، بعدين اكتب الرمز اللي بيطلع.')}
            </T>
          </Animated.View>

          {step === 'password' && (
            <>
              <Input value={email} onChange={setEmail} placeholder={t('الإيميل')} kind="email" />
              <Input value={password} onChange={setPassword} placeholder={t('كلمة السر')} kind="password" onSubmit={signIn} />
              {error && <T v="small" color={C.danger}>{error}</T>}
              {note && <T v="small" color={C.green}>{note}</T>}
              <Button title={t('دخول')} loading={busy} disabled={!email.includes('@') || !password} onPress={signIn} />
              <Button kind="ghost" title={t('أول مرة، أو نسيت كلمة السر؟')} onPress={sendLink} style={{ minHeight: 44 }} />
            </>
          )}

          {step === 'enroll' && enroll && (
            <View style={{ alignItems: 'center', gap: 12 }}>
              <View style={{ padding: 14, borderRadius: 24, backgroundColor: '#FFFFFF' }}>
                <Image source={{ uri: enroll.qr }} style={{ width: 200, height: 200 }} contentFit="contain" accessibilityLabel={t('كود تطبيق المصادقة')} />
              </View>
              <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('أو اكتب هالمفتاح بالتطبيق:')}</T>
              <T v="bold" selectable style={{ fontFamily: F.bodyBold, letterSpacing: 1.5, textAlign: 'center' }}>{enroll.secret}</T>
              {Platform.OS !== 'web' && <Button kind="soft" title={t('افتح تطبيق المصادقة على هالتلفون')} onPress={() => Linking.openURL(enroll.uri).catch(() => {})} />}
            </View>
          )}

          {(step === 'code' || step === 'enroll') && (
            <>
              <CodeBoxes ref={boxes} value={code} onChange={setCode} onComplete={(c) => checkCode(c)} label={t('رمز تطبيق المصادقة')} />
              {error && <T v="small" color={C.danger}>{error}</T>}
              <Button title={t('تأكيد')} loading={busy} disabled={code.length < 6} onPress={() => checkCode()} />
              <Button kind="ghost" title={t('خروج')} onPress={async () => { await signOut(); setStep('password'); setPassword(''); }} style={{ minHeight: 44 }} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Input({ value, onChange, placeholder, kind, onSubmit }: { value: string; onChange: (v: string) => void; placeholder: string; kind: 'email' | 'password'; onSubmit?: () => void }) {
  return (
    <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
      value={value} onChangeText={onChange} placeholder={placeholder} placeholderTextColor={C.muted}
      autoCapitalize="none" autoCorrect={false} secureTextEntry={kind === 'password'}
      keyboardType={kind === 'email' ? 'email-address' : 'default'}
      textContentType={kind === 'email' ? 'username' : 'password'} autoComplete={kind === 'email' ? 'email' : 'current-password'}
      onSubmitEditing={onSubmit} returnKeyType={kind === 'password' ? 'go' : 'next'}
      style={{ height: 56, borderRadius: 18, paddingHorizontal: 18, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, color: C.ink, fontFamily: F.body, fontSize: 16, textAlign: 'left' }}
      accessibilityLabel={placeholder}
    />
  );
}
