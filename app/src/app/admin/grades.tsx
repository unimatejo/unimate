import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Act, Actions, AdminScreen, Muted, Panel, UniPicker, confirm, done , fmtNum } from '@/components/admin/kit';
import { Field, T, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Row = { student_number: string; term_gpa: number | null; cumulative_gpa: number | null; credit_hours: number | null };

const toEn = (s: string) => s.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/٫/g, '.');
const gpaOk = (v: number | null) => v === null || (Number.isFinite(v) && v >= 0 && v <= 4);

/** Parse the registrar's file: «رقم الطالب، المعدل الفصلي، المعدل التراكمي، الساعات» per line. */
function parse(text: string) {
  const good: Row[] = []; let bad = 0; const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = toEn(raw).trim();
    if (!line) continue;
    const c = line.split(/[\t,،;]/).map((x) => x.trim());
    if (!/^[0-9]{5,12}$/.test(c[0] ?? '')) { if (/[0-9]/.test(c[0] ?? '')) bad++; continue; } // header rows have no number
    const num = (s?: string) => (s === undefined || s === '' ? null : Number(s));
    const r: Row = { student_number: c[0], term_gpa: num(c[1]), cumulative_gpa: num(c[2]), credit_hours: num(c[3]) };
    const hoursOk = r.credit_hours === null || (Number.isInteger(r.credit_hours) && r.credit_hours >= 0 && r.credit_hours <= 300);
    if (!gpaOk(r.term_gpa) || !gpaOk(r.cumulative_gpa) || (r.term_gpa === null && r.cumulative_gpa === null) || !hoursOk || seen.has(r.student_number)) { bad++; continue; }
    seen.add(r.student_number); good.push(r);
  }
  return { good, bad };
}

/** Upload the university's official GPAs for the honor board. Students can never set these. */
export default function Grades() {
  const { profile } = useAuth();
  const [uni, setUni] = useState(profile?.university_id ?? '');
  const [term, setTerm] = useState('');
  const [text, setText] = useState('');
  const [current, setCurrent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<string | null>(null);
  const { good, bad } = useMemo(() => parse(text), [text]);
  const ready = !!uni && term.trim().length >= 2 && good.length > 0 && good.length <= 30000;

  async function importNow() {
    if (!ready) return;
    const ok = await confirm(t('نرفع العلامات؟'),
      t('{0} طالب لـ «{1}». الطلاب المسجلين بيطلعوا بلوحة المتفوقين حسب معدلهم.', [fmtNum(good.length), term.trim()]), t('ارفع'));
    if (!ok) return;
    setBusy(true); setRes(null);
    const r = await run(supabase.rpc('admin_import_grades', { p_university: uni, p_term: term.trim(), p_rows: good, p_make_current: current }));
    setBusy(false);
    if (!r.ok) return;
    const d = r.data as { saved: number; matched: number; bad: number };
    done(); setRes(t('انحفظ {0} · طابق {1} طالب مسجّل · {2} سطر غلط', [fmtNum(d.saved), fmtNum(d.matched), fmtNum(d.bad + bad)]));
  }

  return (
    <AdminScreen title={t('علامات الجامعة')} subtitle={t('معدلات الطلاب الرسمية للوحة المتفوقين')}>
      <Panel>
        <Muted>{t('الملف من دائرة القبول والتسجيل. كل سطر طالب: رقم الطالب، المعدل الفصلي، المعدل التراكمي، الساعات. بيقبل فاصلة أو Tab، والسطر الأول إذا كان عناوين بيتجاهله.')}</Muted>
      </Panel>
      <UniPicker value={uni} onChange={setUni} allowAll={false} />
      <Field label={t('اسم الفصل')} value={term} onChangeText={setTerm} placeholder={t('الفصل الأول 2026/2027')} maxLength={40} />
      <TextInput multiline value={text} onChangeText={(v) => { setText(v); setRes(null); }}
        placeholder={'2620387, 3.71, 3.60, 96\n2620707, 3.98, 3.90, 102'} placeholderTextColor={C.faint}
        style={{ minHeight: 200, backgroundColor: C.soft, borderRadius: 14, padding: 12, fontFamily: F.body, fontSize: 13, color: C.ink, textAlignVertical: 'top', textAlign: 'left', writingDirection: 'ltr' }} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <T v="small" color={C.greenInk}>{t('{0} سطر صحيح', [fmtNum(good.length)])}</T>
        {bad > 0 && <T v="small" color={C.red}>{t('{0} سطر غلط (بيتجاهلهم)', [fmtNum(bad)])}</T>}
      </View>
      <Toggle value={current} onChange={setCurrent} label={t('اعتبره الفصل الحالي')} hint={t('لوحة المتفوقين بتعرض «هالفصل» من هالملف.')} />
      {res && <T v="bodyMd" color={C.greenInk}>{res}</T>}
      <Actions><Act label={t('ارفع العلامات')} kind="primary" onPress={importNow} loading={busy} disabled={!ready || busy} /></Actions>
    </AdminScreen>
  );
}
