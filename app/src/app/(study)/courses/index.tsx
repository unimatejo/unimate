import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { ArrowLeftRight, BookOpen, CalendarClock, CheckCircle2, Clock, Plus, Sparkles, Trash2, User, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/ui/Glyph';
import { ScheduleScan } from '@/components/study/ScheduleScan';
import { TimeField } from '@/components/ui/TimeField';
import { Button, Chip, Empty, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { importTeamsCourses, useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { WEEKDAYS_SHORT, clock } from '@/lib/util';
import { nm, t, LOCALE } from '@/lib/i18n';
import { ymd, type MeetingChange } from '@/lib/schedule';

type Mt = { id: string; weekday: number; starts_at: string; ends_at: string; kind: string; room_text: string | null; source: string; confirmations: number; mine?: boolean; replaces?: string | null };
type Personal = { id: string; section_id: string; replaces: string | null; hidden: boolean; kind: string; weekday: number | null; starts_at: string | null; ends_at: string | null; room_text: string | null };
/** add: new time for the section · all: the class really moved (changes it for everyone) · me: only my schedule changes */
type Edit = { sec: Sec; mode: 'add' | 'all' | 'me'; meeting?: Mt; personalId?: string };
type Sec = { id: string; section_no: string; instructor: string | null; course: { name_ar: string; code: string } | null; meetings: Mt[]; source: string; mates: number; changes?: MeetingChange[] };
/** one lecture on one date: the doctor moved it or cancelled it */
type Once = { sec: Sec; meeting: Mt };

const KINDS = [['lecture', t('محاضرة')], ['lab', t('مختبر')], ['online', t('أونلاين')], ['blended', t('مدمج')], ['tutorial', t('مناقشة')]] as const;
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const at = (h: number, m = 0) => { const d = new Date(); d.setHours(h, m, 0, 0); return d; };
const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'numeric' });
/** the next few dates this weekday falls on (today included) */
function nextDates(weekday: number, n: number) {
  const out: string[] = []; const d = new Date(); d.setHours(12, 0, 0, 0);
  while (out.length < n) { if (d.getDay() === weekday) out.push(ymd(d)); d.setDate(d.getDate() + 1); }
  return out;
}
function comingDays(n: number) { const out: string[] = []; const d = new Date(); d.setHours(12, 0, 0, 0); for (let i = 0; i < n; i++) { if (d.getDay() !== 5) out.push(ymd(d)); d.setDate(d.getDate() + 1); } return out; }

/** My courses: brought in from Microsoft Teams, or added once by anyone in the section. Times added once fill in for all classmates. */
export default function Courses() {
  const { profile } = useAuth();
  const { add, teams, scan } = useLocalSearchParams<{ add?: string; teams?: string; scan?: string }>();
  const [rows, setRows] = useState<Sec[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState(''); const [secNo, setSecNo] = useState('');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [moveFor, setMoveFor] = useState<Sec | null>(null);
  const [newSec, setNewSec] = useState('');
  const [days, setDays] = useState<number[]>([]);
  const [st, setSt] = useState(at(8)); const [en, setEn] = useState(at(9, 30));
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>('lecture');
  const [room, setRoom] = useState('');
  const [busy, setBusy] = useState(false);
  const [once, setOnce] = useState<Once | null>(null);
  const [onceCancel, setOnceCancel] = useState(false);
  const [onceAll, setOnceAll] = useState(true);
  const [onDate, setOnDate] = useState(''); const [newDate, setNewDate] = useState('');
  const [note, setNote] = useState('');
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
     
    const list = ((data ?? []) as any[]).filter((e) => e.section).map((e) => ({ ...e.section, source: e.source, mates: 0 })) as Sec[];
    // my own changes: hide or move a section time just for me, or add my own
    const { data: pm } = await supabase.from('personal_meetings').select('*').eq('user_id', profile.id);
    for (const sec of list) {
      const mine = ((pm ?? []) as Personal[]).filter((p) => p.section_id === sec.id);
      const replaced = new Set(mine.filter((p) => p.replaces).map((p) => p.replaces));
      sec.meetings = [
        ...sec.meetings.filter((m) => !replaced.has(m.id)),
        ...mine.filter((p) => !p.hidden && p.weekday != null).map((p) => ({ id: p.id, weekday: p.weekday!, starts_at: p.starts_at!, ends_at: p.ends_at!, kind: p.kind, room_text: p.room_text, source: 'personal', confirmations: 0, mine: true, replaces: p.replaces })),
      ].sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at));
      (sec as Sec & { hiddenCount?: number }).hiddenCount = mine.filter((p) => p.hidden).length;
    }
    if (list.length) {
      const today = ymd(new Date());
      const { data: ch } = await supabase.from('meeting_changes').select('*').in('section_id', list.map((x) => x.id)).or(`on_date.gte.${today},new_date.gte.${today}`).order('on_date');
      for (const s of list) s.changes = ((ch ?? []) as MeetingChange[]).filter((c) => c.section_id === s.id);
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

  function openTime(e: Edit) {
    setEdit(e);
    const m = e.meeting;
    if (m) {
      const [sh, sm] = m.starts_at.split(':').map(Number), [eh, em] = m.ends_at.split(':').map(Number);
      setDays([m.weekday]); setSt(at(sh, sm)); setEn(at(eh, em)); setKind(m.kind as (typeof KINDS)[number][0]); setRoom(m.room_text ?? '');
    } else { setDays([]); setRoom(''); }
  }

  async function saveTime() {
    if (!edit || busy) return;
    if (days.length === 0) { Alert.alert(t('اختار يوم أو أكثر')); return; }
    if (hhmm(en) <= hhmm(st)) { Alert.alert(t('وقت النهاية لازم يكون بعد البداية')); return; }
    setBusy(true);
    try {
      const { sec, mode, meeting } = edit;
      if (mode === 'all' && meeting && !meeting.mine) {
        const { error } = await supabase.rpc('edit_meeting', { m: meeting.id, wd: days[0], st: hhmm(st), en: hhmm(en), k: kind, room: room.trim() });
        if (error) throw error;
        for (const d of days.slice(1)) await supabase.rpc('report_meeting', { sec: sec.id, wd: d, st: hhmm(st), en: hhmm(en), k: kind, room: room.trim() });
      } else if (mode === 'me') {
        const rows = days.map((d, i) => ({ user_id: profile?.id, section_id: sec.id, replaces: i === 0 ? (meeting?.mine ? meeting.replaces ?? null : meeting?.id ?? null) : null, hidden: false, kind, weekday: d, starts_at: hhmm(st), ends_at: hhmm(en), room_text: room.trim() || null }));
        if (meeting?.mine) {
          const { error } = await supabase.from('personal_meetings').update(rows[0]).eq('id', meeting.id);
          if (error) throw error;
          if (rows.length > 1) { const { error: e2 } = await supabase.from('personal_meetings').insert(rows.slice(1)); if (e2) throw e2; }
        } else {
          if (rows[0].replaces) await supabase.from('personal_meetings').delete().eq('user_id', profile?.id ?? '').eq('replaces', rows[0].replaces);
          const { error } = await supabase.from('personal_meetings').insert(rows);
          if (error) throw error;
        }
      } else {
        for (const d of days) {
          const { error } = await supabase.rpc('report_meeting', { sec: sec.id, wd: d, st: hhmm(st), en: hhmm(en), k: kind, room: room.trim() });
          if (error) throw error;
        }
      }
      setEdit(null); setDays([]); setRoom(''); await load();
      scheduleRefresh();
    } catch { Alert.alert(t('ما انحفظ الوقت'), t('جرّب كمان مرة.')); }
    finally { setBusy(false); }
  }

  function openOnce(o: Once, cancel: boolean) {
    setOnce(o); setOnceCancel(cancel); setOnceAll(true); setNote('');
    const first = nextDates(o.meeting.weekday, 1)[0];
    setOnDate(first); setNewDate(first);
    const [sh, sm] = o.meeting.starts_at.split(':').map(Number), [eh, em] = o.meeting.ends_at.split(':').map(Number);
    setSt(at(sh, sm)); setEn(at(eh, em)); setRoom(o.meeting.room_text ?? '');
  }

  async function saveOnce() {
    if (!once || busy) return;
    if (!onceCancel && hhmm(en) <= hhmm(st)) { Alert.alert(t('وقت النهاية لازم يكون بعد البداية')); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from('meeting_changes').insert({
        section_id: once.sec.id, meeting_id: once.meeting.mine ? null : once.meeting.id, on_date: onDate, cancelled: onceCancel,
        new_date: onceCancel ? null : newDate, starts_at: onceCancel ? null : hhmm(st), ends_at: onceCancel ? null : hhmm(en),
        room_text: onceCancel ? null : room.trim() || null, note: note.trim() || null, user_id: onceAll ? null : profile?.id,
      });
      if (error) throw error;
      setOnce(null); await load();
      Alert.alert(onceCancel ? t('انحفظ إنها ملغية ✓') : t('انحفظ الموعد الجديد ✓'), onceAll ? t('بيطلع لكل زملائك بالشعبة، لهاي المحاضرة بس.') : t('بجدولك إنت بس، لهاي المحاضرة بس.'));
    } catch { Alert.alert(t('ما انحفظ'), t('جرّب كمان مرة.')); }
    finally { setBusy(false); }
  }

  function changeMenu(c: MeetingChange) {
    const what = c.cancelled ? t('ألغيت محاضرة {0}', [dayLabel(c.on_date)]) : t('محاضرة {0} انتقلت لـ {1} {2}', [dayLabel(c.on_date), dayLabel(c.new_date!), `${clock(c.starts_at!)}`]);
    Alert.alert(what, c.note ?? (c.user_id ? t('إلك إنت بس.') : t('لكل الشعبة.')), [
      { text: t('رجّعها زي ما كانت'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('meeting_changes').delete().eq('id', c.id);
        if (error) Alert.alert(t('ما بتقدر تشيلها'), t('اللي ضافها هو اللي بيقدر يشيلها.')); else load();
      } },
      { text: t('تمام'), style: 'cancel' },
    ]);
  }

  /** Tap a time: change it for everyone, only for me, hide it for me, or delete my own. */
  function meetingMenu(m: Mt, s: Sec) {
    const opts: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    // the doctor moved or cancelled just one lecture (said in class, posted on Teams)
    opts.push({ text: t('الدكتور غيّر موعد محاضرة وحدة'), onPress: () => openOnce({ sec: s, meeting: m }, false) });
    opts.push({ text: t('الدكتور لغى محاضرة وحدة'), onPress: () => openOnce({ sec: s, meeting: m }, true) });
    if (m.mine) {
      opts.push({ text: t('عدّل وقتي'), onPress: () => openTime({ sec: s, mode: 'me', meeting: m }) });
      opts.push({ text: m.replaces ? t('رجّع وقت الشعبة') : t('احذف وقتي'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('personal_meetings').delete().eq('id', m.id);
        if (error) Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); else { await load(); scheduleRefresh(); }
      } });
    } else {
      opts.push({ text: t('تغيّر دايماً لكل الشعبة'), onPress: () => openTime({ sec: s, mode: 'all', meeting: m }) });
      opts.push({ text: t('غيّره دايماً إلي بس'), onPress: () => openTime({ sec: s, mode: 'me', meeting: m }) });
      opts.push({ text: t('خبّيه من جدولي'), onPress: async () => {
        const { error } = await supabase.from('personal_meetings').insert({ user_id: profile?.id, section_id: s.id, replaces: m.id, hidden: true });
        if (error) Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); else { await load(); scheduleRefresh(); }
      } });
      if (m.source === 'crowd' && m.confirmations <= 1) opts.push({ text: t('احذف الوقت'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('remove_meeting', { m: m.id });
        if (error) Alert.alert(t('ما بتقدر تحذفه'), t('بتقدر تحذف بس الوقت اللي إنت ضفته وما حدا أكّده. جرّب «غيّره إلي بس».')); else { await load(); scheduleRefresh(); }
      } });
    }
    opts.push({ text: t('إلغاء'), style: 'cancel' });
    Alert.alert(`${WEEKDAYS_SHORT[m.weekday]} ${clock(m.starts_at)} - ${clock(m.ends_at)}`, m.mine ? t('هاد الوقت إلك إنت بس.') : t('هاد وقت الشعبة، بيطلع لكل زملائك.'), opts);
  }

  async function moveSection() {
    if (!moveFor || busy) return;
    const no = newSec.trim();
    if (!/^[0-9٠-٩A-Za-z]{1,6}$/.test(no)) { Alert.alert(t('اكتب رقم الشعبة')); return; }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('change_section', { sec: moveFor.id, new_no: no });
      if (error) throw error;
      setMoveFor(null); setNewSec(''); await load(); scheduleRefresh();
      Alert.alert(t('انتقلت للشعبة {0} ✓', [no]), t('أوقاتها وجروبها صاروا عندك. إذا ما في أوقات لهلأ، ضيفها مرة وحدة.'));
    } catch { Alert.alert(t('ما زبط النقل'), t('جرّب كمان مرة.')); }
    finally { setBusy(false); }
  }

  // lecture reminders follow the schedule
  const scheduleRefresh = () => { /* the schedule screen reloads and re-schedules reminders when you open it */ };

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
      <Header title={t('موادي')} right={<Tap onPress={() => setAdding(true)} accessibilityLabel={t('ضيف مادة')} style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Plus size={22} color={C.onPrimary} /></Tap>} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 14, paddingBottom: 80 }}>
        <Tap onPress={fromTeams} disabled={importing} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
          <GlyphTile icon={Sparkles} colors={GRAD.indigo} size={48} live />
          <View style={{ flex: 1 }}>
            <T v="bold">{t('جيب موادي من Microsoft Teams')}</T>
            <T v="tiny" color={C.muted}>{t('كل مادة إلها فريق على Teams، بنضيفها لحالها مع جروبها.')}</T>
          </View>
          {importing && <ActivityIndicator color={C.primary} />}
        </Tap>

        <ScheduleScan onDone={load} autoOpen={scan === '1'} />

        {rows === null ? <View style={{ marginTop: 10 }}><ListSkeleton n={3} /></View> : rows.length === 0 ? (
          <Empty icon={<BookOpen size={30} color={C.primary} />} title={t('ما في مواد لهلأ')} body={t('جيبهم من Teams، أو ضيف كل مادة مرة وحدة. زملاؤك بنفس الشعبة بياخذوا المادة ووقتها جاهزة.')} />
        ) : rows.map((s, i) => (
          <Animated.View key={s.id} entering={FadeIn.delay(i * 50).duration(220)} style={{ backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 10 }}>
            <Row gap={12}>
              <GlyphTile icon={BookOpen} colors={[GRAD.blue, GRAD.pink, GRAD.green, GRAD.orange, GRAD.violet][i % 5]} size={44} />
              <View style={{ flex: 1 }}>
                <T v="bold" numberOfLines={2}>{nm(s.course)}</T>
                <Row gap={6}><T v="tiny" color={C.muted}>{t('شعبة')} {s.section_no}</T><Users size={12} color={C.muted} /><T v="tiny" color={C.muted}>{s.mates}</T></Row>
              </View>
              <Tap onPress={() => leave(s)} accessibilityLabel={t('شيل المادة')} style={{ width: 38, height: 38, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={18} color={C.faint} /></Tap>
            </Row>
            {s.meetings.map((m) => (
              <Tap key={m.id} haptic={false} scale={0.99} onPress={() => meetingMenu(m, s)} accessibilityLabel={t('عدّل الوقت')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: m.mine ? C.violetSoft : C.soft, borderRadius: 14, padding: 10 }}>
                {m.mine ? <User size={15} color={C.violet} /> : <Clock size={15} color={C.primary} />}
                <T v="small" style={{ flex: 1 }}>{WEEKDAYS_SHORT[m.weekday]} {clock(m.starts_at)} - {clock(m.ends_at)}{m.room_text ? ` · ${m.room_text}` : ''}</T>
                {m.mine ? <T v="tiny" color={C.violet}>{t('إلك بس')}</T>
                  : m.confirmations >= 3 ? <Row gap={3}><CheckCircle2 size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('مؤكد')}</T></Row>
                  : <Tap onPress={() => confirm(m, s)} style={{ paddingHorizontal: 8, minHeight: 30, justifyContent: 'center' }}><T v="tiny" color={C.primary}>{t('صح؟ أكّد')}</T></Tap>}
              </Tap>
            ))}
            {(s.changes ?? []).map((c) => (
              <Tap key={c.id} haptic={false} onPress={() => changeMenu(c)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: c.cancelled ? C.redSoft : C.orangeSoft, borderRadius: 14, padding: 10 }}>
                <CalendarClock size={15} color={c.cancelled ? C.red : C.orange} />
                <T v="small" style={{ flex: 1 }} color={c.cancelled ? C.red : C.orange}>
                  {c.cancelled ? t('ألغيت: {0}', [dayLabel(c.on_date)]) : t('{0} ← {1} {2}', [dayLabel(c.on_date), dayLabel(c.new_date!), `${clock(c.starts_at!)}-${clock(c.ends_at!)}`])}
                  {c.room_text ? ` · ${c.room_text}` : ''}
                </T>
                <T v="tiny" color={C.muted}>{c.user_id ? t('إلك بس') : t('للشعبة')}</T>
              </Tap>
            ))}
            {(s as Sec & { hiddenCount?: number }).hiddenCount ? <T v="tiny" color={C.muted}>{t('مخبّي {0} من أوقات الشعبة من جدولك.', [(s as Sec & { hiddenCount?: number }).hiddenCount])}</T> : null}
            <Row gap={8}>
              <Button kind="soft" title={s.meetings.length ? t('ضيف وقت ثاني') : t('ضيف وقت المحاضرة')} icon={<Clock size={16} color={C.primary} />} onPress={() => openTime({ sec: s, mode: 'add' })} style={{ minHeight: 42, flex: 1 }} />
              <Button kind="white" title={t('نقل شعبة')} icon={<ArrowLeftRight size={16} color={C.ink} />} onPress={() => { setMoveFor(s); setNewSec(''); }} style={{ minHeight: 42 }} />
            </Row>
          </Animated.View>
        ))}
        {rows && rows.length > 0 && <Button kind="ghost" title={t('شوف الجدول')} onPress={() => router.push('/(tabs)/schedule')} />}
      </ScrollView>

      <Modal visible={adding} transparent animationType="fade" onRequestClose={() => setAdding(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setAdding(false)} />
        <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40 }}>
          <T v="h3">{t('ضيف مادة')}</T>
          <Field label={t('اسم المادة')} value={name} onChangeText={setName} placeholder={t('مثلاً تفاضل وتكامل 1')} maxLength={120} />
          <Field label={t('رقم الشعبة')} value={secNo} onChangeText={setSecNo} keyboardType="number-pad" placeholder="1" maxLength={4} />
          <Button title={t('ضيفها')} loading={busy} onPress={addCourse} />
        </Animated.View>
      </Modal>

      <Modal visible={!!moveFor} transparent animationType="fade" onRequestClose={() => setMoveFor(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setMoveFor(null)} />
        <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40 }}>
          <T v="h3">{t('نقل لشعبة ثانية')}</T>
          <T v="small" color={C.muted}>{t('{0} · إنت هلأ بشعبة {1}. لما تنتقل بتاخد أوقات الشعبة الجديدة وجروبها.', [nm(moveFor?.course), moveFor?.section_no ?? ''])}</T>
          <Field label={t('رقم الشعبة الجديدة')} value={newSec} onChangeText={setNewSec} keyboardType="number-pad" placeholder="2" maxLength={6} autoFocus />
          <Button title={t('انقلني')} loading={busy} disabled={busy || !newSec.trim()} onPress={moveSection} />
        </Animated.View>
      </Modal>

      <Modal visible={!!once} transparent animationType="fade" onRequestClose={() => setOnce(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setOnce(null)} />
        <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40, maxHeight: '90%' }}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <T v="h3">{onceCancel ? t('محاضرة ألغيت') : t('محاضرة انتقل موعدها')} · {nm(once?.sec.course)}</T>
            <T v="tiny" color={C.muted}>{t('لمرة وحدة بس. الجدول الأسبوعي بيضل زي ما هو.')}</T>
            <T v="small" color={C.ink2}>{t('أي محاضرة؟')}</T>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {once && nextDates(once.meeting.weekday, 4).map((d) => <Chip key={d} label={dayLabel(d)} active={onDate === d} onPress={() => { setOnDate(d); if (newDate < d) setNewDate(d); }} />)}
            </Row>
            {!onceCancel && <>
              <T v="small" color={C.ink2}>{t('صارت يوم:')}</T>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {comingDays(21).map((d) => <Chip key={d} label={dayLabel(d)} active={newDate === d} onPress={() => setNewDate(d)} />)}
              </ScrollView>
              <Row gap={10}>
                <TimeField label={t('من')} value={st} onChange={setSt} />
                <TimeField label={t('لـ')} value={en} onChange={setEn} />
              </Row>
              <Field label={t('القاعة (إذا تغيّرت)')} value={room} onChangeText={setRoom} placeholder={t('مثلاً قاعة 205')} maxLength={80} />
            </>}
            <Field label={t('ملاحظة (اختياري)')} value={note} onChangeText={setNote} placeholder={onceCancel ? t('مثلاً الدكتور مسافر') : t('مثلاً تعويض، حكى عالتيمز')} maxLength={200} />
            <Row gap={6}>
              <Chip label={t('لكل الشعبة')} active={onceAll} onPress={() => setOnceAll(true)} />
              <Chip label={t('إلي بس')} active={!onceAll} onPress={() => setOnceAll(false)} />
            </Row>
            <Button title={onceCancel ? t('احفظ إنها ملغية') : t('احفظ الموعد الجديد')} loading={busy} disabled={busy} onPress={saveOnce} />
          </ScrollView>
        </Animated.View>
      </Modal>

      <Modal visible={!!edit} transparent animationType="fade" onRequestClose={() => setEdit(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setEdit(null)} />
        <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40, maxHeight: '88%' }}>
          <ScrollView contentContainerStyle={{ gap: 12 }}>
            <T v="h3">{edit?.mode === 'me' ? t('وقتي أنا') : edit?.mode === 'all' ? t('تغيير وقت الشعبة') : t('وقت')} · {nm(edit?.sec.course)}</T>
            <T v="tiny" color={edit?.mode === 'me' ? C.violet : C.muted}>{edit?.mode === 'me' ? t('بيتغيّر بجدولك إنت بس (مثلاً نقل داخلي لمحاضرة)، وزملاؤك ما بيتأثروا.')
              : edit?.mode === 'all' ? t('استخدمها إذا الدكتور غيّر وقت المحاضرة للشعبة كلها. بيتغيّر عند كل زملائك.')
              : t('بيطلع لكل زملائك بالشعبة. لما يأكده 3 منكم بيصير مؤكد.')}</T>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {[0, 1, 2, 3, 4, 5].map((d) => <Chip key={d} label={WEEKDAYS_SHORT[d]} active={days.includes(d)} onPress={() => setDays((x) => (x.includes(d) ? x.filter((y) => y !== d) : [...x, d]))} />)}
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap' }}>
              {KINDS.map(([k, l]) => <Chip key={k} label={l} active={kind === k} onPress={() => setKind(k)} />)}
            </Row>
            <Row gap={10}>
              <TimeField label={t('من')} value={st} onChange={setSt} />
              <TimeField label={t('لـ')} value={en} onChange={setEn} />
            </Row>
            {kind !== 'online' && <Field label={t('القاعة والمبنى')} value={room} onChangeText={setRoom} placeholder={t('مثلاً قاعة 205، مبنى الآداب')} maxLength={80} />}
            <Button title={t('احفظ الوقت')} loading={busy} disabled={busy} onPress={saveTime} />
          </ScrollView>
        </Animated.View>
      </Modal>
    </Screen>
  );
}
