import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BookOpen, CheckCircle2, Clock, Plus, Sparkles, Trash2, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, SlideInDown } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/Glyph';
import { Button, Chip, Empty, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { importTeamsCourses, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { WEEKDAYS_SHORT, clock } from '@/lib/util';
import { nm, t } from '@/lib/i18n';

type Mt = { id: string; weekday: number; starts_at: string; ends_at: string; kind: string; room_text: string | null; source: string; confirmations: number };
type Sec = { id: string; section_no: string; instructor: string | null; course: { name_ar: string; code: string } | null; meetings: Mt[]; source: string; mates: number };

const KINDS = [['lecture', t('محاضرة')], ['lab', t('مختبر')], ['online', t('أونلاين')], ['tutorial', t('مناقشة')]] as const;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };

/** My courses: brought in from Microsoft Teams, or added once by anyone in the section. Times added once fill in for all classmates. */
export default function Courses() {
  const { profile } = useAuth();
  const { add, teams } = useLocalSearchParams<{ add?: string; teams?: string }>();
  const [rows, setRows] = useState<Sec[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''); const [secNo, setSecNo] = useState('');
  const [timeFor, setTimeFor] = useState<Sec | null>(null);
  const [days, setDays] = useState<number[]>([]);
  const [st, setSt] = useState(at(8)); const [en, setEn] = useState(at(9, 30));
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('lecture');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  // opened from search on a course: start adding it straight away
  useEffect(() => { if (add) { setName(add); setAdding(true); } }, [add]);
  // web: back from Microsoft with the Teams import result
  useEffect(() => {
    if (!teams) return;
    const n = Number(teams);
    if (Number.isFinite(n)) Alert.alert(n ? t('انضافت {0} مواد ✓', [n]) : t('ما لقينا مواد بحسابك على Teams'), n ? t('وانضميت لجروب كل مادة.') : t('ضيف موادك بإيدك.'));
    else Alert.alert(t('ما قدرنا نجيب موادك من Teams'), teams === 'consent' ? t('جامعتك ممكن تكون مانعة هالصلاحية. ضيف موادك بإيدك مرة وحدة، وزملاؤك بشعبتك بتنضافلهم لحالها.') : t('تأكد من الإنترنت وجرّب كمان مرة.'));
    router.setParams({ teams: undefined });
  }, [teams]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('enrollments')
      .select('source, section:sections(id, section_no, instructor, course:courses(name_ar, name_en, code), meetings:section_meetings(id, weekday, starts_at, ends_at, kind, room_text, source, confirmations))')
      .eq('user_id', profile.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = ((data ?? []) as any[]).filter((e) => e.section).map((e) => ({ ...e.section, source: e.source, mates: 0 })) as Sec[];
    if (list.length) {
      const { data: cnt } = await supabase.from('enrollments').select('section_id').in('section_id', list.map((x) => x.id));
      for (const s of list) s.mates = (cnt ?? []).filter((c) => c.section_id === s.id).length;
    }
    setRows(list);
  }, [profile]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function fromTeams() {
    setImporting(true);
    const r = await importTeamsCourses();
    setImporting(false);
    if ('error' in r) {
      if (r.error !== 'cancelled' && r.error !== 'redirecting') Alert.alert(t('ما قدرنا نجيب موادك من Teams'), r.error === 'consent' ? t('جامعتك ممكن تكون مانعة هالصلاحية. ضيف موادك بإيدك مرة وحدة، وزملاؤك بشعبتك بتنضافلهم لحالها.') : t('تأكد من الإنترنت وجرّب كمان مرة.'));
      return;
    }
    Alert.alert(r.count ? t('انضافت {0} مواد ✓', [r.count]) : t('ما لقينا مواد بحسابك على Teams'), r.count ? t('وانضميت لجروب كل مادة.') : t('ضيف موادك بإيدك.'));
    load();
  }

  async function addCourse() {
    if (name.trim().length < 2) { Alert.alert(t('اكتب اسم المادة')); return; }
    if (busy) return;
    setBusy(true);
    const { error } = await supabase.rpc('add_course', { course_name: name.trim(), section_no: secNo.trim() || '1' }).then((r) => r, () => ({ error: true }));
    setBusy(false);
    if (error) { Alert.alert(t('ما انضافت'), t('جرّب كمان مرة.')); return; }
    setAdding(false); setName(''); setSecNo(''); load();
  }

  async function saveTime() {
    if (!timeFor) return;
    if (days.length === 0) { Alert.alert(t('اختار يوم أو أكثر')); return; }
    if (hhmm(en) <= hhmm(st)) { Alert.alert(t('وقت النهاية لازم يكون بعد البداية')); return; }
    setBusy(true);
    for (const d of days) {
      const { error } = await supabase.rpc('report_meeting', { sec: timeFor.id, wd: d, st: hhmm(st), en: hhmm(en), k: kind, room: room.trim() });
      if (error) { setBusy(false); Alert.alert(t('ما انحفظ الوقت'), t('جرّب كمان مرة.')); return; }
    }
    setBusy(false); setTimeFor(null); setDays([]); setRoom(''); load();
  }

  function leave(s: Sec) {
    Alert.alert(t('شيل المادة'), t('{0}\nبتطلع من جروبها كمان.', [nm(s.course)]), [{ text: t('لا'), style: 'cancel' }, {
      text: t('شيلها'), style: 'destructive', onPress: async () => { await supabase.from('enrollments').delete().eq('user_id', profile?.id ?? '').eq('section_id', s.id); load(); },
    }]);
  }

  async function confirm(m: Mt, s: Sec) {
    await supabase.rpc('report_meeting', { sec: s.id, wd: m.weekday, st: m.starts_at.slice(0, 5), en: m.ends_at.slice(0, 5), k: m.kind, room: m.room_text ?? '' });
    load();
  }

  return (
    <Screen>
      <Header title={t('موادي')} right={<Tap onPress={() => setAdding(true)} accessibilityLabel={t('ضيف مادة')} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Plus size={22} color={C.white} /></Tap>} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 80 }}>
        <Tap onPress={fromTeams} disabled={importing} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
          <GlyphTile icon={Sparkles} colors={GRAD.indigo} size={48} live />
          <View style={{ flex: 1 }}>
            <T v="bold">{t('جيب موادي من Microsoft Teams')}</T>
            <T v="tiny" color={C.muted}>{t('كل مادة إلها فريق على Teams، بنضيفها لحالها مع جروبها.')}</T>
          </View>
          {importing && <ActivityIndicator color={C.primary} />}
        </Tap>

        {rows === null ? <ActivityIndicator color={C.primary} style={{ marginTop: 30 }} /> : rows.length === 0 ? (
          <Empty icon={<BookOpen size={30} color={C.primary} />} title={t('ما في مواد لهلأ')} body={t('جيبهم من Teams، أو ضيف كل مادة مرة وحدة. زملاؤك بنفس الشعبة بياخذوا المادة ووقتها جاهزة.')} />
        ) : rows.map((s, i) => (
          <Animated.View key={s.id} entering={FadeInDown.delay(i * 50)} style={{ backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 10 }}>
            <Row gap={12}>
              <GlyphTile icon={BookOpen} colors={[GRAD.blue, GRAD.pink, GRAD.green, GRAD.orange, GRAD.violet][i % 5]} size={44} />
              <View style={{ flex: 1 }}>
                <T v="bold" numberOfLines={2}>{nm(s.course)}</T>
                <Row gap={6}><T v="tiny" color={C.muted}>{t('شعبة')} {s.section_no}</T><Users size={12} color={C.muted} /><T v="tiny" color={C.muted}>{s.mates}</T></Row>
              </View>
              <Tap onPress={() => leave(s)} accessibilityLabel={t('شيل المادة')} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={18} color={C.faint} /></Tap>
            </Row>
            {s.meetings.map((m) => (
              <Row key={m.id} gap={8} style={{ backgroundColor: C.soft, borderRadius: 14, padding: 10 }}>
                <Clock size={15} color={C.primary} />
                <T v="small" style={{ flex: 1 }}>{WEEKDAYS_SHORT[m.weekday]} {clock(m.starts_at)} - {clock(m.ends_at)}{m.room_text ? ` · ${m.room_text}` : ''}</T>
                {m.confirmations >= 3 ? <Row gap={3}><CheckCircle2 size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('مؤكد')}</T></Row>
                  : <Tap onPress={() => confirm(m, s)} style={{ paddingHorizontal: 8, minHeight: 30, justifyContent: 'center' }}><T v="tiny" color={C.primary}>{t('صح؟ أكّد')}</T></Tap>}
              </Row>
            ))}
            <Button kind="soft" title={s.meetings.length ? t('ضيف وقت ثاني') : t('ضيف وقت المحاضرة')} icon={<Clock size={16} color={C.primary} />} onPress={() => { setTimeFor(s); setDays([]); }} style={{ minHeight: 42 }} />
          </Animated.View>
        ))}
        {rows && rows.length > 0 && <Button kind="ghost" title={t('شوف الجدول')} onPress={() => router.push('/(tabs)/schedule')} />}
      </ScrollView>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setAdding(false)} />
        <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40 }}>
          <T v="h3">{t('ضيف مادة')}</T>
          <Field label={t('اسم المادة')} value={name} onChangeText={setName} placeholder={t('مثلاً تفاضل وتكامل 1')} maxLength={120} />
          <Field label={t('رقم الشعبة')} value={secNo} onChangeText={setSecNo} keyboardType="number-pad" placeholder="1" maxLength={4} />
          <Button title={t('ضيفها')} loading={busy} onPress={addCourse} />
        </Animated.View>
      </Modal>

      <Modal visible={!!timeFor} transparent animationType="fade" onRequestClose={() => setTimeFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setTimeFor(null)} />
        <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40, maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <T v="h3">{t('وقت')} {nm(timeFor?.course)}</T>
            <T v="tiny" color={C.muted}>{t('بيطلع لكل زملائك بالشعبة. لما يأكده 3 منكم بيصير مؤكد.')}</T>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {[0, 1, 2, 3, 4, 5].map((d) => <Chip key={d} label={WEEKDAYS_SHORT[d]} active={days.includes(d)} onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} />)}
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {KINDS.map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}
            </Row>
            <Row gap={10}>
              <View style={{ flex: 1, alignItems: 'center' }}><T v="small" color={C.muted}>{t('من')}</T>
                <DateTimePicker value={st} mode="time" minuteInterval={5} display={Platform.OS === 'ios' ? 'compact' : 'default'} onChange={(_, d) => d && setSt(d)} /></View>
              <View style={{ flex: 1, alignItems: 'center' }}><T v="small" color={C.muted}>{t('لـ')}</T>
                <DateTimePicker value={en} mode="time" minuteInterval={5} display={Platform.OS === 'ios' ? 'compact' : 'default'} onChange={(_, d) => d && setEn(d)} /></View>
            </Row>
            {kind !== 'online' && <Field label={t('القاعة والمبنى')} value={room} onChangeText={setRoom} placeholder={t('مثلاً قاعة 205، مبنى الآداب')} maxLength={80} />}
            <Button title={t('احفظ الوقت')} loading={busy} onPress={saveTime} />
          </ScrollView>
        </Animated.View>
      </Modal>
    </Screen>
  );
}
