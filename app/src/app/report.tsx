import { router, useLocalSearchParams } from 'expo-router';
import { Flag, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

const REASONS = [t('تحرش أو إزعاج'), t('تنمر أو إهانة'), t('نشر صور أو معلومات خاصة'), t('حساب مزيف أو انتحال'), t('احتيال أو نصب'), t('محتوى غير لائق'), t('بيع واجبات أو غش'), t('سبام'), t('إشي تاني')];

export default function Report() {
  const { type = 'user', id, user } = useLocalSearchParams<{ type?: string; id: string; user?: string }>();
  const { profile } = useAuth();
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState('');
  const [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!reason || !profile) return;
    setBusy(true);
    const { error } = await supabase.from('reports').insert({
      reporter_id: (profile?.id ?? ''), target_type: type, target_id: id, target_user: user ?? null, reason, details: details.trim() || null, also_blocked: block,
    });
    if (!error && block && user && user !== (profile?.id ?? '')) await supabase.from('blocks').insert({ blocker_id: (profile?.id ?? ''), blocked_id: user });
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
    Alert.alert(t('وصل بلاغك'), t('فريق يونيميت رح يراجعه، وما حدا بيعرف إنك بلّغت.'), [{ text: t('تمام'), onPress: () => router.back() }]);
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <Row gap={10} style={{ paddingHorizontal: 18, paddingVertical: 10 }}>
        <Flag size={22} color={C.red} />
        <T v="h2" style={{ flex: 1 }}>{t('بلاغ')}</T>
        <Tap onPress={() => router.back()} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={C.ink} /></Tap>
      </Row>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 8, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <T v="small" color={C.muted} style={{ marginBottom: 6 }}>{t('شو المشكلة؟ البلاغ سري.')}</T>
          {REASONS.map((r) => (
            <Tap key={r} scale={0.98} onPress={() => setReason(r)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 54, borderRadius: 16, paddingHorizontal: 14, backgroundColor: reason === r ? C.redSoft : C.card, borderWidth: reason === r ? 1.5 : 0, borderColor: C.red }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: reason === r ? C.red : C.line, alignItems: 'center', justifyContent: 'center' }}>
                {reason === r && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.red }} />}
              </View>
              <T v="bodyMd">{r}</T>
            </Tap>
          ))}
          {reason && (
            <View style={{ gap: 12, marginTop: 10 }}>
              <Field value={details} onChangeText={setDetails} multiline maxLength={1000} placeholder={t('تفاصيل تساعدنا (اختياري)')} style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 12 }} />
              {user && user !== profile?.id && (
                <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 12 }}>
                  <Toggle label={t('احظر هالشخص كمان')} hint={t('ما بيقدر يشوفك ولا يراسلك')} value={block} onChange={setBlock} />
                </View>
              )}
              <Button kind="danger" title={t('ابعت البلاغ')} onPress={send} loading={busy} />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
