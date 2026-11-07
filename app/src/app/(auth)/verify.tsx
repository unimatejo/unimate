import { router, useLocalSearchParams } from 'expo-router';
import { MailCheck } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Header, Screen, T } from '@/components/ui';
import { CodeBoxes, type CodeBoxesHandle } from '@/components/ui/CodeBoxes';
import { sendEmailCode, verifyEmailCode } from '@/lib/auth';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Second sign-in step: the 6-digit code sent to the university email. */
export default function Verify() {
  const { email, uni } = useLocalSearchParams<{ email: string; uni: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(60); // seconds until "send again" is allowed
  useEffect(() => { if (wait <= 0) return; const tm = setTimeout(() => setWait(wait - 1), 1000); return () => clearTimeout(tm); }, [wait]);
  const boxes = useRef<CodeBoxesHandle>(null);

  async function verify(c = code) {
    if (c.length < 6 || busy) return;
    setBusy(true); setError(null);
    let e: unknown = null;
    try { ({ error: e } = await verifyEmailCode(email, c)); } catch (x) { e = x; } finally { setBusy(false); }
    if (e) {
      setError(t('الرمز غير صحيح أو انتهت صلاحيته. تحقق منه وحاول مرة أخرى.'));
      boxes.current?.shake();
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
          <T v="h1">{t('افتح بريدك الإلكتروني')}</T>
          <T v="body" color={C.muted}>{t('راسلنا على')} {`\u2066${email}\u2069`}{uni ? ` (${uni})` : ''}{t('. اضغط على الرابط الموجود فيها من هذا الهاتف لتسجيل الدخول مباشرة، أو اكتب الرمز هنا إذا وصلك رمز.')}</T>
        </Animated.View>

        <CodeBoxes ref={boxes} value={code} onChange={setCode} onComplete={(c) => { if (!busy) verify(c); }} />
        {error && <T v="small" color={C.danger}>{error}</T>}
        <Button title={t('تأكيد')} loading={busy} disabled={code.length < 6} onPress={() => verify()} />
        <Button kind="ghost" title={wait > 0 ? t('أعد الإرسال بعد {0} ثانية', [wait]) : t('لم يصلني الرمز، أعد الإرسال')} disabled={wait > 0}
          onPress={async () => {
            setWait(60); setError(null);
            try {
              const { error: e } = await sendEmailCode(email);
              if (e) { setWait(0); setError(/rate|limit/i.test(e.message) ? t('وصلنا إلى الحد المسموح من رسائل البريد الإلكتروني حاليًا. حاول بعد قليل.') : t('تعذّر إرسال الرسالة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.')); }
            } catch { setWait(0); setError(t('تعذّر إرسال الرسالة. تأكد من اتصالك بالإنترنت وحاول مرة أخرى.')); }
          }} style={{ minHeight: 44 }} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
