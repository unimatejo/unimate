import { router, useLocalSearchParams } from 'expo-router';
import { LockKeyhole } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';

import { Button, Header, Screen, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { t } from '@/lib/i18n';

const MIN = 12;
/** A strong password: long, and not one repeated character. */
const strong = (p: string) => p.length >= MIN && new Set(p).size >= 6;

/** Opened from the "set your password" email: the team member picks a new password, then signs in with it. */
export default function TeamPassword() {
  const p = useLocalSearchParams<{ code?: string; error_description?: string }>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (p.error_description) { setError(t('انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.')); return; }
      if (p.code) {
        const { error: e } = await supabase.auth.exchangeCodeForSession(p.code);
        if (e && !(await supabase.auth.getSession()).data.session) { setError(t('انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.')); return; }
      }
      if (!(await supabase.auth.getSession()).data.session) { setError(t('افتح الرابط الموجود في البريد الإلكتروني من الجهاز نفسه.')); return; }
      setReady(true);
    })();
  }, [p.code, p.error_description]);

  async function save() {
    if (busy) return;
    if (!strong(pw)) { setError(t('يجب أن تتكون كلمة السر من {0} أحرف أو أكثر، وألا تكون حرفًا واحدًا مكررًا.', [MIN])); return; }
    if (pw !== again) { setError(t('كلمتا السر غير متطابقتين.')); return; }
    setBusy(true); setError(null);
    const { data: s } = await supabase.auth.getSession();
    const email = s.session?.user.email ?? '';
    const { error: e } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (e) { setError(/same|different/i.test(e.message) ? t('اختر كلمة سر جديدة مختلفة عن القديمة.') : t('تعذّر الحفظ. حاول مرة أخرى.')); return; }
    // sign in again with the new password, then the authenticator code
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    router.replace({ pathname: '/(auth)/team', params: { email } });
  }

  return (
    <Screen>
      <Header title="" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, paddingHorizontal: 24, gap: 18 }}>
        <View style={{ width: 64, height: 64, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <LockKeyhole size={30} color={C.primary} />
        </View>
        <T v="h1">{t('كلمة سر جديدة')}</T>
        {!ready && !error && <ActivityIndicator color={C.primary} />}
        {ready && (
          <>
            <T v="body" color={C.muted}>{t('اختر كلمة سر قوية ({0} حرف أو أكثر). لا يعرفها أحد غيرك، ولا حتى نحن.', [MIN])}</T>
            {[[pw, setPw, t('كلمة السر الجديدة')], [again, setAgain, t('أعد كتابتها')]].map(([v, set, ph], i) => (
              <TextInput key={i} keyboardAppearance={isDark ? 'dark' : 'light'} value={v as string} onChangeText={set as (x: string) => void}
                placeholder={ph as string} placeholderTextColor={C.muted} secureTextEntry autoCapitalize="none" autoCorrect={false}
                textContentType="newPassword" autoComplete="new-password" accessibilityLabel={ph as string}
                style={{ height: 56, borderRadius: 18, paddingHorizontal: 18, backgroundColor: C.card, borderWidth: 1.5, borderColor: C.line, color: C.ink, fontFamily: F.body, fontSize: 16, textAlign: 'left' }} />
            ))}
            <Button title={t('احفظ كلمة السر')} loading={busy} disabled={!pw || !again} onPress={save} />
          </>
        )}
        {error && (
          <>
            <T v="small" color={C.danger}>{error}</T>
            <Button kind="ghost" title={t('العودة إلى تسجيل الدخول')} onPress={() => router.replace('/(auth)/team')} />
          </>
        )}
      </KeyboardAvoidingView>
    </Screen>
  );
}
