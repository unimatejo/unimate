import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { Act, Actions, AdminScreen, Muted, Panel, Section, State, UniPicker, confirm, done } from '@/components/admin/kit';
import { Chip, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Grade = { g: string; p: string };
type Rules = { absence_pct: number; weeks: number; max_gpa: number; scale: { g: string; p: number }[] };

const LETTER = /^[A-DF][+-]?$/;
const num = (s: string) => (s.trim() === '' ? NaN : Number(s.replace(',', '.')));

/** Per-university rules behind the GPA calculator and the absence tracker. Every save is checked here and again on the server. */
export default function StudyRules() {
  const { profile } = useAuth();
  const [uni, setUni] = useState(profile?.university_id ?? '');
  const [loading, setLoading] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [pct, setPct] = useState('15');
  const [weeks, setWeeks] = useState('16');
  const [maxGpa, setMaxGpa] = useState(4);
  const [scale, setScale] = useState<Grade[]>([]);
  const [busy, setBusy] = useState(false);
  const [ver, setVer] = useState(0); // bump to reload after a save

  useEffect(() => { if (!uni && profile?.university_id) setUni(profile.university_id); }, [profile?.university_id, uni]);

  useEffect(() => {
    if (!uni) return;
    let live = true;
    setLoading(true); setLoadErr(null);
    supabase.rpc('study_rules_for', { uni }).then(({ data, error }) => {
      if (!live) return;
      setLoading(false);
      if (error || !data) { setLoadErr(error?.message ?? t('لم يتم العثور على الجامعة')); return; }
      const r = data as Rules;
      setPct(String(r.absence_pct)); setWeeks(String(r.weeks)); setMaxGpa(Number(r.max_gpa) === 5 ? 5 : 4);
      setScale((r.scale ?? []).map((x) => ({ g: x.g, p: String(x.p) })));
    }, (e) => { if (live) { setLoading(false); setLoadErr(String(e?.message ?? e)); } });
    return () => { live = false; };
  }, [uni, ver]);

  // every problem, in plain Arabic; saving stays off until the list is empty
  const problems = useMemo(() => {
    const out: string[] = [];
    const a = num(pct), w = num(weeks);
    if (!(a >= 1 && a <= 50) || Math.round(a * 2) !== a * 2) out.push(t('يجب أن تكون نسبة الغياب بين 1 و50 (بزيادات 0.5).'));
    if (!(w >= 8 && w <= 20) || !Number.isInteger(w)) out.push(t('يجب أن يكون عدد أسابيع الفصل رقمًا صحيحًا بين 8 و20.'));
    if (scale.length < 1 || scale.length > 20) out.push(t('يجب أن يحتوي السلم على علامة واحدة إلى 20 علامة.'));
    const seen = new Set<string>();
    scale.forEach((x, i) => {
      const g = x.g.trim().toUpperCase(), p = num(x.p);
      if (!LETTER.test(g)) out.push(t('السطر {0}: «{1}» ليست علامة صحيحة (مثل A أو B+ أو F).', [i + 1, x.g || '—']));
      else if (seen.has(g)) out.push(t('العلامة {0} مكررة.', [g]));
      seen.add(g);
      if (!(p >= 0 && p <= maxGpa)) out.push(t('السطر {0}: يجب أن تكون النقاط بين 0 و{1}.', [i + 1, maxGpa]));
      if (i > 0) { const prev = num(scale[i - 1].p); if (p >= 0 && prev >= 0 && p >= prev) out.push(t('السطر {0}: يجب أن تكون النقاط أقل من نقاط السطر الذي فوقه.', [i + 1])); }
    });
    return out;
  }, [pct, weeks, scale, maxGpa]);

  const preview = useMemo(() => {
    const a = num(pct), w = num(weeks);
    if (!(a > 0) || !(w > 0)) return null;
    return t('مادة 3 ساعات أسبوعياً: الحد {0} غيابات', [Math.floor((3 * w * a) / 100)]);
  }, [pct, weeks]);

  const setRow = (i: number, patch: Partial<Grade>) => setScale((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const move = (i: number, d: -1 | 1) => setScale((s) => { const n = [...s]; const j = i + d; if (j < 0 || j >= n.length) return s; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function save(rules: Record<string, unknown>, msg: string) {
    if (!uni) return;
    if (!(await confirm(t('حفظ القواعد؟'), msg, t('احفظ')))) return;
    setBusy(true);
    const r = await run(supabase.rpc('admin_set_study_rules', { p_university: uni, p_rules: rules }), { msg: t('لم تُحفظ. تأكد من أن جميع القيم صحيحة.') });
    setBusy(false);
    if (r.ok) { done(); setVer((v) => v + 1); }
  }

  function saveAll() {
    if (problems.length) return;
    save({
      absence_pct: num(pct), weeks: num(weeks), max_gpa: maxGpa,
      scale: scale.map((x) => ({ g: x.g.trim().toUpperCase(), p: Math.round(num(x.p) * 100) / 100 })),
    }, t('يُطبَّق على جميع طلاب هذه الجامعة في حاسبة المعدل والغيابات.'));
  }

  const inputStyle = { minHeight: 44, borderRadius: 12, backgroundColor: C.soft, paddingHorizontal: 12, fontFamily: F.bodyMd, fontSize: 15, color: C.ink, textAlign: 'center' as const };

  return (
    <AdminScreen ownerOnly title={t('قواعد الدراسة')} subtitle={t('نسبة الحرمان وأسابيع الفصل وسلم العلامات')}>
      <UniPicker value={uni} onChange={setUni} allowAll={false} />
      <State loading={loading} error={loadErr}>
        <Panel>
          <T v="bodyMd">{t('الغيابات')}</T>
          <Row gap={10}>
            <View style={{ flex: 1, gap: 4 }}>
              <Muted>{t('نسبة الحرمان %')}</Muted>
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={pct} onChangeText={setPct} keyboardType="decimal-pad" maxLength={4} style={inputStyle} accessibilityLabel={t('نسبة الحرمان %')} />
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Muted>{t('أسابيع الفصل')}</Muted>
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={weeks} onChangeText={setWeeks} keyboardType="number-pad" maxLength={2} style={inputStyle} accessibilityLabel={t('أسابيع الفصل')} />
            </View>
          </Row>
          {preview && <T v="small" color={C.primary}>{preview}</T>}
        </Panel>

        <Section title={t('سلم العلامات')} right={
          <Row gap={6}>
            <Chip label={t('من 4')} active={maxGpa === 4} onPress={() => setMaxGpa(4)} />
            <Chip label={t('من 5')} active={maxGpa === 5} onPress={() => setMaxGpa(5)} />
          </Row>
        } />
        <Panel>
          <Row gap={8}><T v="tiny" color={C.muted} style={{ flex: 1 }}>{t('العلامة')}</T><T v="tiny" color={C.muted} style={{ flex: 1 }}>{t('النقاط')}</T><View style={{ width: 120 }} /></Row>
          {scale.map((x, i) => (
            <Row key={i} gap={8}>
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={x.g} onChangeText={(v) => setRow(i, { g: v.toUpperCase().slice(0, 2) })} autoCapitalize="characters" autoCorrect={false}
                style={[inputStyle, { flex: 1 }]} accessibilityLabel={t('العلامة')} />
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={x.p} onChangeText={(v) => setRow(i, { p: v.slice(0, 5) })} keyboardType="decimal-pad"
                style={[inputStyle, { flex: 1 }]} accessibilityLabel={t('النقاط')} />
              <Row gap={4} style={{ width: 120, justifyContent: 'flex-end' }}>
                <Tap onPress={() => move(i, -1)} disabled={i === 0} accessibilityLabel={t('إلى الأعلى')} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', opacity: i === 0 ? 0.4 : 1 }}><ArrowUp size={16} color={C.ink} /></Tap>
                <Tap onPress={() => move(i, 1)} disabled={i === scale.length - 1} accessibilityLabel={t('إلى الأسفل')} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', opacity: i === scale.length - 1 ? 0.4 : 1 }}><ArrowDown size={16} color={C.ink} /></Tap>
                <Tap onPress={() => setScale((s) => s.filter((_, j) => j !== i))} accessibilityLabel={t('احذف')} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={16} color={C.red} /></Tap>
              </Row>
            </Row>
          ))}
          {scale.length < 20 && (
            <Tap onPress={() => setScale((s) => [...s, { g: '', p: '' }])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 }}>
              <Plus size={16} color={C.primary} /><T v="small" color={C.primary}>{t('أضف علامة')}</T>
            </Tap>
          )}
          <Muted>{t('يُطبَّق على جميع طلاب هذه الجامعة في حاسبة المعدل والغيابات')}</Muted>
        </Panel>

        {problems.length > 0 && (
          <Panel style={{ borderColor: C.red }}>
            {problems.slice(0, 6).map((p, i) => <T key={i} v="small" color={C.red}>• {p}</T>)}
          </Panel>
        )}

        <Actions>
          <Act label={t('احفظ')} kind="primary" onPress={saveAll} disabled={problems.length > 0 || !uni} loading={busy} />
          <Act label={t('استعادة الافتراضي')} onPress={() => save({}, t('تعود النسبة إلى 15%، و16 أسبوعاً، وسلّم العلامات الأردني الافتراضي.'))} disabled={!uni || busy} />
        </Actions>
      </State>
    </AdminScreen>
  );
}
