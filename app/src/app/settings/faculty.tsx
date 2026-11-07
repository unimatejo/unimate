import * as Haptics from 'expo-haptics';
import { CheckCircle2, Clock, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { TITLE_ORDER, TitleBadge, titleLabel, titledName } from '@/components/profile/TitleBadge';
import { Button, Chip, Field, Header, Loading, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, R, shadow } from '@/lib/theme';
import { isStaffEmail } from '@/lib/util';
import { t } from '@/lib/i18n';

// president, vice president and dean come only from the university's official list or Microsoft, never from a request
const TOP = ['founder', 'team', 'president', 'vice_president', 'dean'];

type Req = { id: string; title: string; department: string | null; status: 'pending' | 'approved' | 'rejected'; created_at: string };

/** Faculty and staff ask for their title (د. / عميد / …); an admin checks and confirms it. */
export default function FacultyTitle() {
  const { profile, refreshProfile, session } = useAuth();
  const staff = isStaffEmail(session?.user?.email);
  const [req, setReq] = useState<Req | null | undefined>(undefined);
  const [title, setTitle] = useState<string | null>(null);
  const [dept, setDept] = useState(profile?.department ?? '');
  const [note, setNote] = useState('');
  const [position, setPosition] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('title_requests').select('id, title, department, status, created_at').eq('user_id', profile.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    setReq((data as Req | null) ?? null);
  }, [profile]);
  useEffect(() => { load(); refreshProfile(); }, [load]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send() {
    if (!title || busy) return;
    setBusy(true);
    const r = await run(supabase.rpc('request_title', { p_title: title, p_department: dept, p_note: note, p_position: position.trim() || null }), { msg: t('تعذّر إرسال الطلب. الطلب متاح فقط لبريد الموظفين الإلكتروني في الجامعة.') });
    setBusy(false);
    if (!r.ok) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    load();
  }

  const verified = !!profile?.title_verified && !!profile.academic_title;
  const pending = req?.status === 'pending';
  const card = [{ backgroundColor: C.card, borderRadius: R.lg, padding: 16, gap: 10 }, shadow];

  return (
    <Screen>
      <Header title={t('حساب هيئة التدريس')} subtitle={t('سيظهر اللقب بجانب اسمك بعد التحقق منه')} />
      {req === undefined ? <Loading /> : (
        <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          {verified && (
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={20} color={C.green} />
                <T v="bodyMd">{t('حسابك موثّق')}</T>
              </View>
              <T v="h3">{titledName(profile?.full_name, profile?.academic_title, true)}</T>
              <TitleBadge title={profile?.academic_title} verified size="md" label={profile?.position_title} />
              {profile?.department ? <T v="small" color={C.muted}>{profile.department}</T> : null}
              <T v="tiny" color={C.muted}>{t('إذا تغيّر منصبك، أرسل طلباً جديداً أدناه.')}</T>
            </View>
          )}

          {!staff && !verified ? (
            <View style={card}>
              <T v="bodyMd">{t('التوثيق لحسابات الموظفين فقط')}</T>
              <T v="small" color={C.muted}>{t('سجّل الدخول ببريدك الإلكتروني الوظيفي في الجامعة (ليس بريد الطالب)، وإذا سجّلت الدخول بمايكروسوفت فسيُضاف لقبك تلقائياً.')}</T>
            </View>
          ) : pending ? (
            <View style={card}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock size={20} color={C.orange} />
                <T v="bodyMd">{t('طلبك قيد المراجعة')}</T>
              </View>
              <T v="small" color={C.ink2}>{titleLabel(req?.title)}{req?.department ? ` · ${req.department}` : ''}</T>
              <T v="tiny" color={C.muted}>{t('سنتحقق من بريدك الجامعي أو نتواصل معك، وسيصلك إشعار عند توثيق حسابك.')}</T>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {req?.status === 'rejected' && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.redSoft, borderRadius: R.md, padding: 12 }}>
                  <XCircle size={18} color={C.red} />
                  <T v="small" color={C.ink} style={{ flex: 1 }}>{t('تعذّر توثيق طلبك الأخير. أرسل طلبًا جديدًا مع ملاحظة تساعدنا على التحقق.')}</T>
                </View>
              )}
              <T v="bold">{t('ما لقبك أو منصبك؟')}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {TITLE_ORDER.filter((k) => !TOP.includes(k)).map((k) => <Chip key={k} label={titleLabel(k)} active={title === k} onPress={() => setTitle(k)} />)}
              </View>
              <Field label={t('منصبك كاملًا (اختياري)')} value={position} onChangeText={setPosition} maxLength={80} placeholder={t('مثلاً: عميد شؤون الطلبة، مدير مركز الحاسوب')} />
              <Field label={t('القسم أو الكلية')} value={dept} onChangeText={setDept} maxLength={80} placeholder={t('مثلاً قسم الهندسة المدنية')} />
              <Field label={t('ملاحظة (اختياري)')} value={note} onChangeText={setNote} maxLength={300} multiline placeholder={t('رقم مكتبك، أو رابط صفحتك في الجامعة، أو أي شيء يساعدنا على التحقق')} style={{ minHeight: 90, textAlignVertical: 'top', paddingTop: 14 }} />
              <Button title={t('أرسل الطلب')} onPress={send} loading={busy} disabled={!title} />
              <T v="tiny" color={C.muted} style={{ textAlign: 'center' }}>{t('لا يمكن لأحد إضافة لقب بنفسه، تراجع الإدارة كل طلب.')}</T>
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
