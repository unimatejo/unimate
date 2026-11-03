import { CheckCircle2, Clock, LifeBuoy } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Button, Chip, Field, Header, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t } from '@/lib/i18n';

type Ticket = { id: string; subject: string; body: string; status: string; reply: string | null; created_at: string };
const TOPICS = [t('مشكلة بالجدول'), t('مشكلة بالدخول'), t('بلاغ عن شخص'), t('اقتراح'), t('إعلان لمحلي'), t('إشي تاني')];

export default function Support() {
  const { profile } = useAuth();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('support_tickets').select('*').eq('user_id', (profile?.id ?? '')).order('created_at', { ascending: false });
    setTickets((data ?? []) as Ticket[]);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  async function send() {
    if (body.trim().length < 5) { Alert.alert(t('اكتب تفاصيل أكتر شوي')); return; }
    setBusy(true);
    const { error } = await supabase.from('support_tickets').insert({ user_id: (profile?.id ?? ''), subject: topic, body: body.trim() });
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
    setBody(''); load();
    Alert.alert(t('وصلتنا ✓'), t('بنرد عليك هون بأسرع وقت.'));
  }

  return (
    <Screen>
      <Header title={t('الدعم والمساعدة')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <Row gap={10}><LifeBuoy size={22} color={C.primary} /><T v="h3">{t('احكيلنا شو صاير')}</T></Row>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{TOPICS.map((tp) => <Chip key={tp} label={tp} active={topic === tp} onPress={() => setTopic(tp)} />)}</Row>
            <Field value={body} onChangeText={setBody} multiline maxLength={1500} placeholder={t('اكتب التفاصيل...')} style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }} />
            <Button title={t('ابعت')} onPress={send} loading={busy} />
          </View>

          {tickets.length > 0 && <T v="h3" style={{ paddingHorizontal: 4 }}>{t('طلباتك')}</T>}
          {tickets.map((tk) => (
            <View key={tk.id} style={{ gap: 8, backgroundColor: C.card, borderRadius: 20, padding: 14 }}>
              <Row gap={8}>
                {tk.status === 'open' ? <Clock size={16} color={C.orange} /> : <CheckCircle2 size={16} color={C.green} />}
                <T v="bold" style={{ flex: 1 }}>{tk.subject}</T>
                <T v="tiny" color={C.muted}>{timeAgo(tk.created_at)}</T>
              </Row>
              <T v="small" color={C.ink2}>{tk.body}</T>
              {tk.reply ? (
                <View style={{ backgroundColor: C.primarySoft, borderRadius: 14, padding: 10 }}>
                  <T v="tiny" color={C.primary}>{t('رد فريق يونيميت')}</T>
                  <T v="small">{tk.reply}</T>
                </View>
              ) : <T v="tiny" color={C.muted}>{t('بانتظار الرد')}</T>}
            </View>
          ))}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
