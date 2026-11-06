import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { CalendarDays, Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { useAdminRole } from '@/components/admin/kit';
import { Button, Chip, Field, Header, Row, Screen, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { sectionKnown } from '@/lib/sections';
import { C } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { LOCALE, nm, t } from '@/lib/i18n';

const KINDS: [string, string][] = [
  ['exam_first', t('فيرست')], ['exam_second', t('سكند')], ['exam_mid', t('ميد')], ['exam_final', t('فاينل')],
  ['quiz', t('كويز')], ['assignment', t('واجب')], ['project', t('مشروع')], ['custom', t('تذكير خاص')],
];
type Sec = { id: string; section_no: string; course: { name_ar: string } };

/**
 * Add an exam, deadline or reminder to my timetable. Ticking "for my section" doesn't push it to everyone: it counts
 * as one classmate saying so, and once enough of them add the same thing it lands in the whole section (0102).
 * Admins can post straight to the section. Official events open read-only for students, with "this is wrong".
 */
export default function NewEvent() {
  const { profile } = useAuth();
  const admin = !!useAdminRole();
  const { id: editId } = useLocalSearchParams<{ id?: string }>();
  const [kind, setKind] = useState('exam_first');
  const [secs, setSecs] = useState<Sec[]>([]);
  const [section, setSection] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; });
  const [show, setShow] = useState<'date' | 'time' | null>(null);
  const [location, setLocation] = useState('');
  const [share, setShare] = useState(true);
  const [official, setOfficial] = useState(false);
  const [direct, setDirect] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('enrollments').select('section:sections(id, section_no, course:courses(name_ar, name_en))').eq('user_id', (profile?.id ?? ''))
       
      .then(({ data }) => { const s = ((data ?? []) as any[]).map((e) => e.section).filter(Boolean) as Sec[]; setSecs(s); if (!editId) setSection(s[0]?.id ?? null); });
  }, [profile, editId]);

  // editing an existing event: fill the form from it
  useEffect(() => {
    if (!editId) return;
    supabase.from('academic_events').select('kind, title, starts_at, location, section_id, owner_id, shared_ask').eq('id', editId).maybeSingle().then(({ data }) => {
      if (!data) { Alert.alert(t('الموعد مش موجود')); router.back(); return; }
      setKind(data.kind); setTitle(data.title); setDate(new Date(data.starts_at)); setLocation(data.location ?? '');
      setSection(data.section_id); setShare(!!data.shared_ask); setOfficial(!data.owner_id); setDirect(!data.owner_id);
    });
  }, [editId]);

  const label = KINDS.find((k) => k[0] === kind)?.[1] ?? '';
  const courseName = secs.find((s) => s.id === section)?.course.name_ar;

  async function save() {
    if (!profile || busy) return;
    const ttl = title.trim() || [label, courseName].filter(Boolean).join(' · ');
    if (!ttl) { Alert.alert(t('اكتب عنوان')); return; }
    const canShare = !!section && kind !== 'custom' && sectionKnown(secs.find((x) => x.id === section)?.section_no);
    const toAll = admin && direct && canShare;
    const row = { kind, title: ttl, starts_at: date.toISOString(), location: location.trim() || null, section_id: section,
      owner_id: toAll ? null : profile.id, shared_ask: !toAll && share && canShare };
    setBusy(true);
    try {
      if (editId) {
        const { error } = await supabase.from('academic_events').update(row).eq('id', editId);
        if (error) { Alert.alert(t('ما زبط'), t('بتقدر تعدّل بس المواعيد اللي إنت ضفتها.')); return; }
      } else {
        const { data, error } = await supabase.from('academic_events').insert({ ...row, created_by: profile.id }).select('id').single();
        if (error || !data) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
        // if mine was the one that tipped it over, it's folded into the section's event: the reminder goes there
        const { data: now } = await supabase.from('academic_events').select('merged_into').eq('id', data.id).maybeSingle();
        if (now?.merged_into) toast(t('صار عند كل الشعبة ✓ أكّده كذا واحد منكم'));
        await supabase.from('reminders').upsert({ user_id: profile.id, event_id: now?.merged_into ?? data.id, minutes: kind.startsWith('exam') ? 1440 : 120, enabled: true }, { onConflict: 'user_id,event_id' });
      }
      router.back();
    } catch { Alert.alert(t('ما زبط'), t('تأكد من الإنترنت وجرّب كمان مرة.')); }
    finally { setBusy(false); }
  }

  function remove() {
    if (!editId) return;
    Alert.alert(t('تحذف الموعد؟'), official ? t('رح ينحذف من جدول كل طلاب الشعبة.') : undefined, [
      { text: t('إلغاء'), style: 'cancel' },
      { text: t('حذف'), style: 'destructive', onPress: async () => {
        const { error, count } = await supabase.from('academic_events').delete({ count: 'exact' }).eq('id', editId);
        if (error || !count) { Alert.alert(t('ما زبط'), t('بتقدر تحذف بس المواعيد اللي إنت ضفتها.')); return; }
        router.back();
      } },
    ]);
  }

  async function dispute() {
    if (!editId || busy) return;
    setBusy(true);
    const r = await run(supabase.rpc('dispute_section_event', { p_event: editId }), { quiet: true });
    setBusy(false);
    if (!r.ok) { toast.error(t('ما زبط، جرّب كمان مرة.')); return; }
    toast(r.data ? t('انشال الموعد من الشعبة') : t('وصلنا ✓ لما يقولوا كمان زملاء إنه غلط بينشال'));
    router.back();
  }

  const fmtDate = date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtTime = date.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });

  return (
    <Screen>
      <Header title={editId ? t('تعديل الموعد') : t('أضف موعد')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10 }}>
          <T v="bold" style={{ fontSize: 14 }}>{t('شو نوعه؟')}</T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{KINDS.map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}</Row>
        </View>
        {secs.length > 0 && (
          <View style={{ gap: 10 }}>
            <T v="bold" style={{ fontSize: 14 }}>{t('المادة')}</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{secs.map((s) => <Chip key={s.id} label={nm(s.course)} active={section === s.id} onPress={() => setSection(s.id)} />)}</Row>
          </View>
        )}
        <Field label={t('العنوان')} value={title} onChangeText={setTitle} placeholder={[label, courseName].filter(Boolean).join(' · ')} maxLength={80} />
        <Row gap={10}>
          <Tap onPress={() => setShow('date')} style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 14 }}>
            <CalendarDays size={18} color={C.primary} /><T v="bodyMd">{fmtDate}</T>
          </Tap>
          <Tap onPress={() => setShow('time')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: C.card, paddingHorizontal: 14 }}>
            <Clock size={18} color={C.primary} /><T v="bodyMd">{fmtTime}</T>
          </Tap>
        </Row>
        {show && (
          <DateTimePicker value={date} mode={show} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={new Date()} locale={LOCALE}
            onChange={(_, d) => { if (Platform.OS !== 'ios') setShow(null); if (d) setDate(d); }} />
        )}
        {show && Platform.OS === 'ios' && <Button kind="soft" title={t('تم')} onPress={() => setShow(null)} />}
        <Field label={t('المكان (اختياري)')} value={location} onChangeText={setLocation} placeholder={t('مثلاً قاعة 204 أو المدرج الكبير')} />
        {section && kind !== 'custom' && !official && !sectionKnown(secs.find((x) => x.id === section)?.section_no) && (
          <View style={{ backgroundColor: C.orangeSoft, borderRadius: 18, padding: 12 }}>
            <T v="small" color={C.orangeInk}>{t('رقم شعبتك بهالمادة مش محدد، فالموعد بيضل عندك إنت بس. حدّده من «موادي» عشان تقدر تشاركه مع شعبتك.')}</T>
          </View>
        )}
        {section && kind !== 'custom' && !official && sectionKnown(secs.find((x) => x.id === section)?.section_no) && (
          <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 12, gap: 10 }}>
            <Toggle label={t('عند كل الشعبة')} value={share} onChange={setShare}
              hint={t('لما كم واحد من شعبتك يضيفوا نفس الموعد بنفس اليوم، بينزل تلقائي عند كل الشعبة. لحد ما يصير هيك بيضل عندك إنت بس.')} />
            {admin && <Toggle label={t('نزّله رسمي هلأ (للإدارة)')} hint={t('بينزل لكل الشعبة فوراً بدون تأكيد')} value={direct} onChange={setDirect} />}
          </View>
        )}
        {official && !admin ? (
          <View style={{ backgroundColor: C.card, borderRadius: 18, padding: 14, gap: 10 }}>
            <T v="small" color={C.ink2}>{t('هاد الموعد لكل الشعبة، أكّده زملاءك. إذا غلط احكيلنا، ولما كفاية منكم يقولوا غلط بينشال.')}</T>
            <Button kind="soft" title={t('الموعد غلط')} onPress={dispute} loading={busy} />
          </View>
        ) : (
          <>
            <Button title={t('احفظ')} onPress={save} loading={busy} disabled={busy} />
            {editId && <Button kind="ghost" title={t('حذف الموعد')} onPress={remove} />}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
