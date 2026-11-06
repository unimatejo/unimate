import { useEffect, useState } from 'react';

import { Act, AdminScreen, Item, Muted, OptionPicker, Panel, Pill, SearchBox, Sheet, UniPicker, confirm, done } from '@/components/admin/kit';
import { Field, T } from '@/components/ui';
import { DateField } from '@/components/ui/DateField';
import { TimeField } from '@/components/ui/TimeField';
import { EVENT_KIND } from '@/lib/events';
import { LOCALE, t } from '@/lib/i18n';
import { sectionKnown, sectionLabel } from '@/lib/sections';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type Scope = 'section' | 'course' | 'college';
type Course = { id: string; code: string; name_ar: string };
type Section = { id: string; section_no: string; students: number };
type College = { id: string; name_ar: string };

const KINDS = Object.fromEntries(Object.entries(EVENT_KIND).filter(([k]) => k !== 'custom')) as Record<string, string>;
const SCOPES: Record<Scope, string> = { section: t('شعبة وحدة'), course: t('كل شعب المادة'), college: t('كل مواد الكلية') };

/**
 * Admin › an official exam or deadline, straight to exactly one scope (admin_post_event, 0106): one section, every
 * section of a course this term, or every course of a college. Only students enrolled there get it, tagged "رسمي".
 */
export default function OfficialEvents() {
  const [uni, setUni] = useState('');
  const [scope, setScope] = useState<Scope>('course');
  const [q, setQ] = useState('');
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<Course | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [section, setSection] = useState<Section | null>(null);
  const [colleges, setColleges] = useState<College[]>([]);
  const [college, setCollege] = useState<College | null>(null);
  const [pick, setPick] = useState<'course' | 'section' | 'college' | null>(null);
  const [kind, setKind] = useState('exam_first');
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; });
  const [place, setPlace] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setCourse(null); setSection(null); setCollege(null);
    if (!uni) { setColleges([]); return; }
    supabase.from('colleges').select('id, name_ar').eq('university_id', uni).order('name_ar').then(({ data }) => setColleges((data ?? []) as College[]));
  }, [uni]);
  useEffect(() => {
    if (!uni || q.trim().length < 2) { setCourses([]); return; }
    const tm = setTimeout(() => {
      supabase.from('courses').select('id, code, name_ar').eq('university_id', uni).ilike('name_ar', `%${q.trim()}%`).limit(30)
        .then(({ data }) => setCourses((data ?? []) as Course[]));
    }, 250);
    return () => clearTimeout(tm);
  }, [uni, q]);
  useEffect(() => {
    setSection(null); setSections([]);
    if (!course) return;
    supabase.from('sections').select('id, section_no, enrollments(count)').eq('course_id', course.id).order('section_no')
      .then(({ data }) => setSections(((data ?? []) as { id: string; section_no: string; enrollments: { count: number }[] }[])
        .filter((s) => sectionKnown(s.section_no)).map((s) => ({ id: s.id, section_no: s.section_no, students: s.enrollments?.[0]?.count ?? 0 }))));
  }, [course]);

  const target = scope === 'college' ? college?.id : scope === 'course' ? course?.id : section?.id;
  const scopeName = scope === 'college' ? college?.name_ar : scope === 'course' ? course?.name_ar : course && section ? `${course.name_ar} · ${sectionLabel(section.section_no)}` : '';
  const ttl = title.trim() || [KINDS[kind], course?.name_ar].filter(Boolean).join(' · ');

  async function post() {
    if (!target || busy) return;
    const at = when.toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' });
    if (!(await confirm(t('تنزّل الموعد الرسمي؟'), t('«{0}» · {1}\nلـ {2}. بيوصل إشعار لكل المسجلين.', [ttl, at, scopeName ?? '']), t('نزّله')))) return;
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('admin_post_event', { p_scope: scope, p_target: target, p_kind: kind, p_title: ttl, p_starts: when.toISOString(), p_location: place.trim() || null });
    setBusy(false);
    if (error) { setMsg(t('ما زبط: {0}', [error.message])); return; }
    done(); setMsg(t('نزل ✓ ووصل لـ {0} طالب', [String(data ?? 0)])); setTitle(''); setPlace('');
  }

  return (
    <AdminScreen title={t('مواعيد رسمية')} subtitle={t('امتحان أو تسليم بينزل فوراً للشعبة أو المادة أو الكلية بالضبط')}>
      <Panel>
        <UniPicker value={uni} onChange={setUni} allowAll={false} />
        <OptionPicker label={t('لمين')} value={scope} options={SCOPES} onChange={setScope} />
        {scope === 'college'
          ? <Item title={college?.name_ar ?? t('اختار الكلية')} sub={t('الكلية')} onPress={() => uni && setPick('college')} dim={!uni} />
          : <Item title={course ? `${course.name_ar}${course.code && !course.code.startsWith('X') ? ` · ${course.code}` : ''}` : t('اختار المادة')} sub={t('المادة')} onPress={() => uni && setPick('course')} dim={!uni} />}
        {scope === 'section' && course && (
          <Item title={section ? `${sectionLabel(section.section_no)} · ${t('{0} طالب', [String(section.students)])}` : t('اختار الشعبة')} sub={t('الشعبة')} onPress={() => setPick('section')} />
        )}
      </Panel>
      <Panel>
        <OptionPicker label={t('النوع')} value={kind} options={KINDS} onChange={setKind} />
        <Field label={t('العنوان')} value={title} onChangeText={setTitle} maxLength={80} placeholder={ttl} />
        <DateField value={when} onChange={(d) => { const x = new Date(when); x.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); setWhen(x); }} />
        <TimeField label={t('الساعة')} value={when} onChange={setWhen} />
        <Field label={t('المكان (اختياري)')} value={place} onChangeText={setPlace} maxLength={80} />
        <Act label={t('نزّل الموعد')} kind="primary" onPress={post} disabled={!target || ttl.length < 2} loading={busy} />
        {msg && <T v="small" color={msg.includes('✓') ? C.greenInk : C.red}>{msg}</T>}
        <Muted>{t('بيبيّن للطلاب بوسم «رسمي»، وما حدا بيقدر يشيله غير الإدارة.')}</Muted>
      </Panel>

      <Sheet open={pick === 'course'} onClose={() => setPick(null)} title={t('المادة')}>
        <SearchBox value={q} onChange={setQ} placeholder={t('اكتب اسم المادة')} />
        {courses.map((c) => <Item key={c.id} title={c.name_ar} sub={c.code.startsWith('X') ? undefined : c.code} onPress={() => { setCourse(c); setPick(null); }} end={course?.id === c.id ? <Pill label="✓" tone="green" /> : undefined} />)}
      </Sheet>
      <Sheet open={pick === 'section'} onClose={() => setPick(null)} title={t('الشعبة')}>
        {sections.length === 0 ? <Muted>{t('ما في شعب معروفة الرقم لهالمادة.')}</Muted>
          : sections.map((s) => <Item key={s.id} title={sectionLabel(s.section_no)} sub={t('{0} طالب', [String(s.students)])} onPress={() => { setSection(s); setPick(null); }} end={section?.id === s.id ? <Pill label="✓" tone="green" /> : undefined} />)}
      </Sheet>
      <Sheet open={pick === 'college'} onClose={() => setPick(null)} title={t('الكلية')}>
        {colleges.map((c) => <Item key={c.id} title={c.name_ar} onPress={() => { setCollege(c); setPick(null); }} end={college?.id === c.id ? <Pill label="✓" tone="green" /> : undefined} />)}
      </Sheet>
    </AdminScreen>
  );
}
