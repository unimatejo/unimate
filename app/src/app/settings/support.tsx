import { CheckCircle2, Clock, LifeBuoy } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { Button, Chip, Field, Header, Row, Screen, T, Tag } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t } from '@/lib/i18n';

type Ticket = { id: string; subject: string; body: string; status: string; reply: string | null; created_at: string };
const TOPICS = [t('مشكلة في الجدول'), t('مشكلة في تسجيل الدخول'), t('بلاغ عن شخص'), t('اقتراح'), t('إعلان لمتجري'), t('طلب نسخة من بياناتي'), t('شيء آخر')];
const STATUS: Record<string, [string, string, string]> = { open: [t('مفتوح'), C.orangeSoft, C.orangeInk], answered: [t('تم الرد عليه'), C.greenSoft, C.greenInk], closed: [t('مغلق'), C.soft, C.muted] };

/** Settings › contact support. */
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
    if (busy || !profile) return;
    if (body.trim().length < 5) { Alert.alert(t('اكتب تفاصيل أكثر قليلاً')); return; }
    setBusy(true);
    let error: unknown = null;
    try { ({ error } = await supabase.from('support_tickets').insert({ user_id: profile.id, subject: topic, body: body.trim() })); }
    catch (e) { error = e; }
    finally { setBusy(false); }
    if (error) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
    setBody(''); load();
    Alert.alert(t('تم الاستلام ✓'), t('سنرد عليك هنا في أسرع وقت.'));
  }

  return (
    <Screen>
      <Header title={t('الدعم والمساعدة')} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <Row gap={10}><LifeBuoy size={22} color={C.primary} /><T v="h3">{t('أخبرنا بما حدث')}</T></Row>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{TOPICS.map((tp) => <Chip key={tp} label={tp} active={topic === tp} onPress={() => setTopic(tp)} />)}</Row>
            <Field value={body} onChangeText={setBody} multiline maxLength={1500} placeholder={t('اكتب التفاصيل...')} style={{ minHeight: 120, textAlignVertical: 'top', paddingTop: 12 }} />
            <Button title={t('أرسل')} onPress={send} loading={busy} />
          </View>

          {tickets.length > 0 && <T v="h3" style={{ paddingHorizontal: 4 }}>{t('طلباتك')}</T>}
          {tickets.map((tk) => (
            <View key={tk.id} style={{ gap: 8, backgroundColor: C.card, borderRadius: 20, padding: 14 }}>
              <Row gap={8}>
                {tk.status === 'open' ? <Clock size={16} color={C.orange} /> : <CheckCircle2 size={16} color={C.green} />}
                <T v="bold" style={{ flex: 1 }}>{tk.subject}</T>
                <Tag label={(STATUS[tk.status] ?? STATUS.open)[0]} bg={(STATUS[tk.status] ?? STATUS.open)[1]} fg={(STATUS[tk.status] ?? STATUS.open)[2]} />
                <T v="tiny" color={C.muted}>{timeAgo(tk.created_at)}</T>
              </Row>
              <T v="small" color={C.ink2}>{tk.body}</T>
              {tk.reply ? (
                <View style={{ backgroundColor: C.primarySoft, borderRadius: 14, padding: 10 }}>
                  <T v="tiny" color={C.primaryDark}>{t('رد فريق يونيميت')}</T>
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
