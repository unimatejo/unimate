import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { CalendarDays, Clock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';

import { Button, Chip, Field, Header, Row, Screen, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

const KINDS: [string, string][] = [
  ['exam_first', 'فيرست'], ['exam_second', 'سكند'], ['exam_mid', 'ميد'], ['exam_final', 'فاينل'],
  ['quiz', 'كويز'], ['assignment', 'واجب'], ['project', 'مشروع'], ['custom', 'تذكير خاص'],
];
type Sec = { id: string; course: { name_ar: string } };

export default function NewEvent() {
  const { profile } = useAuth();
  const [kind, setKind] = useState('exam_first');
  const [secs, setSecs] = useState<Sec[]>([]);
  const [section, setSection] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; });
  const [show, setShow] = useState<'date' | 'time' | null>(null);
  const [location, setLocation] = useState('');
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('enrollments').select('section:sections(id, course:courses(name_ar))').eq('user_id', profile.id)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => { const s = ((data ?? []) as any[]).map((e) => e.section).filter(Boolean) as Sec[]; setSecs(s); setSection(s[0]?.id ?? null); });
  }, [profile]);

  const label = KINDS.find((k) => k[0] === kind)?.[1] ?? '';
  const courseName = secs.find((s) => s.id === section)?.course.name_ar;

  async function save() {
    if (!profile) return;
    const t = title.trim() || [label, courseName].filter(Boolean).join(' · ');
    if (!t) { Alert.alert('اكتب عنوان'); return; }
    const shared = share && !!section && kind !== 'custom';
    setBusy(true);
    const { data, error } = await supabase.from('academic_events').insert({
      kind, title: t, starts_at: date.toISOString(), location: location.trim() || null, created_by: profile.id,
      section_id: section, owner_id: shared ? null : profile.id,
    }).select('id').single();
    if (!error && data) await supabase.from('reminders').upsert({ user_id: profile.id, event_id: data.id, minutes: kind.startsWith('exam') ? 1440 : 120, enabled: true }, { onConflict: 'user_id,event_id' });
    setBusy(false);
    if (error) { Alert.alert('ما زبط', 'جرّب كمان مرة.'); return; }
    router.back();
  }

  const fmtDate = date.toLocaleDateString('ar-JO', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtTime = date.toLocaleTimeString('ar-JO', { hour: 'numeric', minute: '2-digit' });

  return (
    <Screen>
      <Header title="أضف موعد" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <View style={{ gap: 10 }}>
          <T v="bold" style={{ fontSize: 14 }}>شو نوعه؟</T>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>{KINDS.map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}</Row>
        </View>
        {secs.length > 0 && (
          <View style={{ gap: 10 }}>
            <T v="bold" style={{ fontSize: 14 }}>المادة</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>{secs.map((s) => <Chip key={s.id} label={s.course.name_ar} active={section === s.id} onPress={() => setSection(s.id)} />)}</Row>
          </View>
        )}
        <Field label="العنوان" value={title} onChangeText={setTitle} placeholder={[label, courseName].filter(Boolean).join(' · ')} maxLength={80} />
        <Row gap={10}>
          <Tap onPress={() => setShow('date')} style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: C.white, paddingHorizontal: 14 }}>
            <CalendarDays size={18} color={C.primary} /><T v="bodyMd">{fmtDate}</T>
          </Tap>
          <Tap onPress={() => setShow('time')} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52, borderRadius: 16, backgroundColor: C.white, paddingHorizontal: 14 }}>
            <Clock size={18} color={C.primary} /><T v="bodyMd">{fmtTime}</T>
          </Tap>
        </Row>
        {show && (
          <DateTimePicker value={date} mode={show} display={Platform.OS === 'ios' ? 'spinner' : 'default'} minimumDate={new Date()} locale="ar-JO"
            onChange={(_, d) => { if (Platform.OS !== 'ios') setShow(null); if (d) setDate(d); }} />
        )}
        {show && Platform.OS === 'ios' && <Button kind="soft" title="تم" onPress={() => setShow(null)} />}
        <Field label="المكان (اختياري)" value={location} onChangeText={setLocation} placeholder="مثلاً قاعة 204 أو المدرج الكبير" />
        {section && kind !== 'custom' && (
          <View style={{ backgroundColor: C.white, borderRadius: 18, padding: 12 }}>
            <Toggle label="شاركه مع طلاب الشعبة" hint="بيطلع بجدولهم، وكل ما أكّده حدا بيصير موثوق أكتر" value={share} onChange={setShare} />
          </View>
        )}
        <Button title="احفظ" onPress={save} loading={busy} />
      </ScrollView>
    </Screen>
  );
}
