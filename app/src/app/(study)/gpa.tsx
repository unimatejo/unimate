import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { ChevronDown, ChevronLeft, Download, GraduationCap, Plus, Target } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/ui/Glyph';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { CourseRow, type Course } from '@/components/study/gpa-course';
import { Button, Card, Empty, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { DEFAULT_SCALE, cumulative, gradeFor, neededAverage, round2, semesterGpa, standingOf, totals, whatIf, type Base, type ScaleRow } from '@/lib/gpa';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { flip, t } from '@/lib/i18n';
import { featureOn, useAppContent } from '@/lib/appContent';

const STANDING_LABEL = {
  excellent: [t('ممتاز'), GRAD.green], very_good: [t('جيد جداً'), GRAD.blue], good: [t('جيد'), GRAD.teal],
  pass: [t('مقبول'), GRAD.orange], warning: [t('تحت الإنذار'), GRAD.red],
} as const;

/** "الفصل الأول 2026/2027": Sep–Jan first, Feb–Jun second, Jul–Aug summer. */
function currentTerm(d = new Date()) {
  const m = d.getMonth(), y = d.getFullYear();
  if (m >= 8) return t('الفصل الأول {0}/{1}', [y, y + 1]);
  if (m === 0) return t('الفصل الأول {0}/{1}', [y - 1, y]);
  if (m <= 5) return t('الفصل الثاني {0}/{1}', [y - 1, y]);
  return t('الفصل الصيفي {0}/{1}', [y - 1, y]);
}

/** Counts up to the new value instead of jumping. */
function useCountUp(target: number | null) {
  const [v, setV] = useState(target ?? 0);
  const from = useRef(v);
  useEffect(() => {
    if (target == null) return;
    const start = Date.now(), a = from.current, dur = 550;
    let raf = 0;
    const tick = () => {
      const k = Math.min(1, (Date.now() - start) / dur), e = 1 - Math.pow(1 - k, 3);
      const n = a + (target - a) * e; setV(n); from.current = n;
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}

const tick = () => Haptics.selectionAsync().catch(() => {});

/** معدلي: the student's GPA, term by term, with "what do I need" planning. Everything here is private to them. */
export default function Gpa() {
  const content = useAppContent();
  const { profile } = useAuth();
  const [scale, setScale] = useState<ScaleRow[]>(DEFAULT_SCALE);
  const [maxGpa, setMaxGpa] = useState(4);
  const [rows, setRows] = useState<Course[] | null>(null);
  const [base, setBase] = useState<Base>({ hours: 0, gpa: 0 });
  const [baseText, setBaseText] = useState({ hours: '', gpa: '' });
  const [showScale, setShowScale] = useState(false);
  const [target, setTarget] = useState('');
  const [adding, setAdding] = useState<{ name: string; hours: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const term = useMemo(() => currentTerm(), []);

  const load = useCallback(async () => {
    if (!profile) return;
    const [rules, gr, gb] = await Promise.all([
      profile.university_id ? supabase.rpc('study_rules_for', { uni: profile.university_id }) : Promise.resolve({ data: null }),
      supabase.from('grade_records').select('id, term_label, course_name, course_code, credit_hours, grade, target_grade, section_id, position').order('position').order('created_at'),
      supabase.from('gpa_base').select('hours, gpa').maybeSingle(),
    ]);
    const r = rules.data as { scale?: ScaleRow[]; max_gpa?: number } | null;
    if (r?.scale?.length) setScale(r.scale.map((s) => ({ g: String(s.g), p: Number(s.p) })));
    if (r?.max_gpa) setMaxGpa(Number(r.max_gpa));
    if (gr.error) { setRows([]); return; }
    setRows((gr.data ?? []) as Course[]);
    if (gb.data) {
      const b = { hours: Number(gb.data.hours) || 0, gpa: Number(gb.data.gpa) || 0 };
      setBase(b); setBaseText({ hours: b.hours ? String(b.hours) : '', gpa: b.hours ? b.gpa.toFixed(2) : '' });
    }
  }, [profile]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => () => { Object.values(timers.current).forEach(clearTimeout); }, []);

  // ---------- numbers ----------
  const all = rows ?? [];
  const real = cumulative(base, all, scale);
  const plan = whatIf(base, all, scale);
  const shown = useCountUp(real.gpa);
  const standing = standingOf(real.gpa);
  const terms = useMemo(() => {
    const order: string[] = [];
    for (const r of all) if (!order.includes(r.term_label)) order.push(r.term_label);
    if (!order.includes(term)) order.unshift(term);
    // the current term first, then the rest newest-looking first
    return [term, ...order.filter((x) => x !== term).reverse()];
  }, [all, term]);
  const plannedHours = all.filter((r) => r.grade == null).reduce((s, r) => s + (r.credit_hours || 0), 0);

  const goal = Number(target.replace(',', '.'));
  const goalOk = target.trim() !== '' && goal > 0 && goal <= maxGpa;
  const need = goalOk ? neededAverage(goal, real.points, real.hours, plannedHours) : null;

  // ---------- saving ----------
  function patch(id: string, p: Partial<Course>) {
    setRows((x) => x?.map((r) => (r.id === id ? { ...r, ...p } : r)) ?? null);
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const ok = await run(supabase.from('grade_records').update(p).eq('id', id), { msg: t('لم يُحفظ التعديل، حاول مرة أخرى.') });
      if (ok.ok) tick();
    }, 450);
  }

  function remove(c: Course) {
    Alert.alert(t('حذف «{0}»؟', [c.course_name]), t('ستُستبعد من حساب معدلك.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('احذف'), style: 'destructive', onPress: async () => {
        const before = rows;
        setRows((x) => x?.filter((r) => r.id !== c.id) ?? null);
        const r = await run(supabase.from('grade_records').delete().eq('id', c.id));
        if (!r.ok) setRows(before);
      } },
    ]);
  }

  async function addCourse() {
    if (!adding) return;
    const name = adding.name.trim();
    if (name.length < 1 || name.length > 80) { Alert.alert(t('اكتب اسم المادة')); return; }
    const r = await run(supabase.from('grade_records').insert({ term_label: term, course_name: name, credit_hours: adding.hours, position: all.length })
      .select('id, term_label, course_name, course_code, credit_hours, grade, target_grade, section_id, position').single(),
      { msg: t('لم تُضف المادة، حاول مرة أخرى.') });
    if (r.ok && r.data) { setRows((x) => [...(x ?? []), r.data as unknown as Course]); setAdding(null); tick(); }
  }

  async function importTerm() {
    if (!profile || importing) return;
    setImporting(true);
    try {
      const { data, error } = await supabase.from('enrollments').select('section:sections(id, course:courses(name_ar, code, credit_hours))').eq('user_id', profile.id);
      if (error) { Alert.alert(t('تعذّر جلب موادك'), t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.')); return; }
      const have = new Set(all.map((r) => r.section_id).filter(Boolean));
       
      const fresh = ((data ?? []) as any[]).map((e) => e.section).filter((s) => s && !have.has(s.id)).map((s, i) => ({
        term_label: term, course_name: String(s.course?.name_ar ?? t('مادة')).slice(0, 80), course_code: s.course?.code ? String(s.course.code).slice(0, 20) : null,
        credit_hours: Math.max(0, Math.min(12, Number(s.course?.credit_hours) || 3)), section_id: s.id, position: all.length + i,
      }));
      if (!fresh.length) { Alert.alert(t('موادك موجودة'), t('كل مواد جدولك لهذا الفصل مضافة.')); return; }
      const r = await run(supabase.from('grade_records').insert(fresh).select('id, term_label, course_name, course_code, credit_hours, grade, target_grade, section_id, position'),
        { msg: t('لم تُضف المواد، حاول مرة أخرى.') });
      if (r.ok && r.data) { setRows((x) => [...(x ?? []), ...(r.data as Course[])]); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); }
    } finally { setImporting(false); }
  }

  async function saveBase() {
    const h = Math.round(Number(baseText.hours) || 0), g = Number(baseText.gpa.replace(',', '.')) || 0;
    if (h < 0 || h > 300) { Alert.alert(t('عدد الساعات من 0 إلى 300')); return; }
    if (g < 0 || g > maxGpa) { Alert.alert(t('المعدل من 0 إلى {0}', [maxGpa])); return; }
    if (h > 0 && g === 0) { Alert.alert(t('اكتب معدلك التراكمي')); return; }
    const next = { hours: h, gpa: round2(g) };
    const r = await run(supabase.from('gpa_base').upsert(next, { onConflict: 'user_id' }), { msg: t('لم يُحفظ، حاول مرة أخرى.') });
    if (r.ok) { setBase(next); tick(); }
  }

  if (!rows) return <Screen><Header title={t('معدلي')} /><ListSkeleton n={5} /></Screen>;

  const st = standing ? STANDING_LABEL[standing] : null;
  return (
    <Screen>
      <Header title={t('معدلي')} subtitle={t('يبقى لك وحدك، ولا يراه أحد')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 120 }}>
          {/* the honor board: official GPAs from the university */}
          {featureOn(content, 'honor') && <Tap onPress={() => router.push('/honor')} scale={0.98} accessibilityRole="button" accessibilityLabel={t('اعرف ترتيبك بين المتفوقين')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 12, borderWidth: 1, borderColor: '#F5A90055' }}>
            <Image source={require('../../../assets/emoji3d/trophy_3d.png')} style={{ width: 40, height: 40 }} contentFit="contain" />
            <View style={{ flex: 1 }}>
              <T v="bodyMd">{t('اعرف ترتيبك بين المتفوقين')}</T>
              <T v="tiny" color={C.muted}>{t('ترتيب المعدلات الرسمي على تخصصك وكليتك والجامعة')}</T>
            </View>
            <ChevronLeft size={18} color={C.muted} style={flip} />
          </Tap>}
          {/* hero */}
          <Animated.View entering={FadeIn.duration(220)} style={{ borderRadius: 28, overflow: 'hidden' }}>
            <LinearGradient colors={(st?.[1] ?? GRAD.indigo) as unknown as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20, gap: 14 }}>
              <View style={{ position: 'absolute', top: -70, left: -50, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.14)' }} />
              <Row gap={14}>
                <View style={{ flex: 1 }}>
                  <T v="small" color={C.white} style={{ opacity: 0.8 }}>{t('المعدل التراكمي')}</T>
                  <T color={C.white} style={{ fontFamily: F.display, fontSize: 54, lineHeight: 68, writingDirection: 'ltr', textAlign: 'left', alignSelf: 'flex-start' }}>
                    {real.gpa == null ? '—' : shown.toFixed(2)}
                  </T>
                  <T v="small" color={C.white} style={{ opacity: 0.85 }}>
                    {real.hours ? t('من {0} · {1} ساعة معتمدة', [maxGpa.toFixed(2), real.hours]) : t('أضف علاماتك لنحسب لك')}
                  </T>
                </View>
                <GlyphTile icon={GraduationCap} colors={['rgba(255,255,255,0.32)', 'rgba(255,255,255,0.14)']} size={58} />
              </Row>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {st && <View style={{ backgroundColor: 'rgba(255,255,255,0.26)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><T v="bold" color={C.white} style={{ fontSize: 13 }}>{st[0]}</T></View>}
                {plan.gpa != null && plannedHours > 0 && plan.gpa !== real.gpa && (
                  <View style={{ backgroundColor: 'rgba(14,20,48,0.22)', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                    <T v="small" color={C.white}>{t('إذا حققت أهدافك: {0}', [plan.gpa.toFixed(2)])}</T>
                  </View>
                )}
              </Row>
            </LinearGradient>
          </Animated.View>

          {/* before the app */}
          <Card style={{ gap: 10 }}>
            <T v="h3">{t('معدلي قبل يونيميت')}</T>
            <T v="tiny" color={C.muted}>{t('اكتب معدلك التراكمي وساعاتك من كشف العلامات، ولا حاجة لإضافة المواد السابقة واحدة تلو الأخرى.')}</T>
            <Row gap={10}>
              <View style={{ flex: 1 }}>
                <Field label={t('الساعات المقطوعة')} value={baseText.hours} onChangeText={(v) => setBaseText((b) => ({ ...b, hours: v.replace(/[^0-9]/g, '').slice(0, 3) }))}
                  keyboardType="number-pad" placeholder="0" onBlur={saveBase} style={{ textAlign: 'center', writingDirection: 'ltr' }} />
              </View>
              <View style={{ flex: 1 }}>
                <Field label={t('المعدل التراكمي')} value={baseText.gpa} onChangeText={(v) => setBaseText((b) => ({ ...b, gpa: v.replace(/[^0-9.,]/g, '').slice(0, 4) }))}
                  keyboardType="decimal-pad" placeholder="0.00" onBlur={saveBase} style={{ textAlign: 'center', writingDirection: 'ltr' }} />
              </View>
            </Row>
          </Card>

          {/* terms */}
          {terms.map((tl) => {
            const list = all.filter((r) => r.term_label === tl);
            const cur = tl === term;
            if (!cur && !list.length) return null;
            const g = semesterGpa(list, scale), gw = semesterGpa(list, scale, true);
            const hrs = totals(list, scale).hours;
            return (
              <Card key={tl} style={{ gap: 4 }}>
                <Row gap={10} style={{ marginBottom: 4 }}>
                  <View style={{ flex: 1 }}>
                    <T v="h3" numberOfLines={1}>{tl}</T>
                    <T v="tiny" color={C.muted}>{list.length ? t('{0} مواد · {1} ساعة محسوبة', [list.length, hrs]) : t('لا توجد مواد حتى الآن')}</T>
                  </View>
                  <View style={{ alignItems: 'center', minWidth: 64, backgroundColor: C.soft, borderRadius: 14, paddingVertical: 6, paddingHorizontal: 10 }}>
                    <T style={{ fontFamily: F.display, fontSize: 20, lineHeight: 26, writingDirection: 'ltr' }}>{g != null ? g.toFixed(2) : gw != null ? `~${gw.toFixed(2)}` : '—'}</T>
                    <T v="tiny" color={C.muted} style={{ fontSize: 10 }}>{g != null ? t('الفصلي') : gw != null ? t('متوقع') : t('الفصلي')}</T>
                  </View>
                </Row>
                {list.map((c) => <CourseRow key={c.id} c={c} scale={scale} onChange={(p) => patch(c.id, p)} onDelete={() => remove(c)} />)}
                {cur && (
                  <View style={{ gap: 8, paddingTop: 10, borderTopWidth: list.length ? 1 : 0, borderTopColor: C.line }}>
                    {adding ? (
                      <View style={{ gap: 8 }}>
                        <Field value={adding.name} onChangeText={(v) => setAdding((a) => a && { ...a, name: v.slice(0, 80) })} placeholder={t('اسم المادة')} autoFocus maxLength={80} />
                        <Row gap={8}>
                          {[1, 2, 3, 4].map((h) => (
                            <Tap key={h} onPress={() => setAdding((a) => a && { ...a, hours: h })} scale={0.94}
                              style={{ flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: adding.hours === h ? C.inverse : C.soft }}>
                              <T v="bold" color={adding.hours === h ? C.onInverse : C.ink2}>{t('{0} س', [h])}</T>
                            </Tap>
                          ))}
                        </Row>
                        <Row gap={8}>
                          <Button title={t('أضف')} onPress={addCourse} style={{ flex: 1 }} />
                          <Button kind="soft" title={t('إلغاء')} onPress={() => setAdding(null)} style={{ flex: 1 }} />
                        </Row>
                      </View>
                    ) : (
                      <Row gap={8}>
                        <Button kind="soft" title={t('استيراد مواد هذا الفصل')} icon={<Download size={17} color={C.primary} />} loading={importing} onPress={importTerm} style={{ flex: 1 }} />
                        <Button kind="soft" title={t('مادة')} icon={<Plus size={17} color={C.primary} />} onPress={() => setAdding({ name: '', hours: 3 })} style={{ paddingHorizontal: 18 }} />
                      </Row>
                    )}
                  </View>
                )}
              </Card>
            );
          })}

          {/* what do I need? */}
          <Card style={{ gap: 10 }}>
            <Row gap={10}>
              <GlyphTile icon={Target} colors={GRAD.violet} size={42} />
              <View style={{ flex: 1 }}>
                <T v="h3">{t('ماذا يجب أن أحضر؟')}</T>
                <T v="tiny" color={C.muted}>{t('اكتب المعدل الذي تريد الوصول إليه، وسنحسبه لك بناءً على مواد هذا الفصل التي ما زلت تدرسها.')}</T>
              </View>
            </Row>
            <Field value={target} onChangeText={(v) => setTarget(v.replace(/[^0-9.,]/g, '').slice(0, 4))} keyboardType="decimal-pad" placeholder={t('مثلاً 3.00')}
              style={{ textAlign: 'center', writingDirection: 'ltr', fontFamily: F.display, fontSize: 22 }} />
            {target.trim() !== '' && !goalOk && <T v="small" color={C.red}>{t('المعدل من 0 إلى {0}', [maxGpa])}</T>}
            {need != null && (() => {
              const top = Math.max(...scale.map((s) => s.p));
              const box = (bg: string, fg: string, title: string, body: string) => (
                <Animated.View entering={FadeIn.duration(200)} style={{ backgroundColor: bg, borderRadius: 16, padding: 12, gap: 2 }}>
                  <T v="bold" color={fg}>{title}</T><T v="small" color={fg}>{body}</T>
                </Animated.View>
              );
              if (!plannedHours) return box(C.soft, C.ink2, t('لا توجد مواد تدرسها حاليًا'), t('أضف مواد هذا الفصل التي لم تُرصد علاماتها بعد لنتمكن من الحساب.'));
              if (need <= 0 || (real.gpa != null && need <= Math.min(...scale.map((s) => s.p)))) return box(C.greenSoft, C.greenInk, t('مضمون ✓'), t('حتى لو حصلت على أدنى علامة، ستصل إلى {0}.', [goal.toFixed(2)]));
              if (need > top + 1e-9) return box(C.redSoft, C.red, t('غير ممكن هذا الفصل'), t('تحتاج إلى معدل {0} في {1} ساعة، وهذا أعلى من العلامة القصوى. ركّز على الفصل القادم أيضاً.', [need.toFixed(2), plannedHours]));
              return box(C.violetSoft, C.violetInk, t('تحتاج إلى معدل {0} في مواد هذا الفصل', [round2(need).toFixed(2)]), t('أي تقريبًا {0} أو أعلى في كل مادة ({1} ساعة).', [gradeFor(need, scale) ?? '', plannedHours]));
            })()}
          </Card>

          {/* the scale */}
          <Tap haptic={false} onPress={() => setShowScale((s) => !s)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', paddingVertical: 6 }}>
            <T v="tiny" color={C.muted}>{t('السلم وفق إعدادات جامعتك')}</T>
            <ChevronDown size={14} color={C.muted} style={{ transform: [{ rotate: showScale ? '180deg' : '0deg' }] }} />
          </Tap>
          {showScale && (
            <Animated.View entering={FadeIn.duration(180)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
              {scale.map((s) => (
                <View key={s.g} style={{ backgroundColor: C.card, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 54 }}>
                  <T v="bold" style={{ writingDirection: 'ltr' }}>{s.g}</T>
                  <T v="tiny" color={C.muted} style={{ writingDirection: 'ltr' }}>{s.p.toFixed(2)}</T>
                </View>
              ))}
              <T v="tiny" color={C.faint} style={{ width: '100%', textAlign: 'center', marginTop: 4 }}>{t('P = ناجح، ولا تُحتسب في المعدل. راجع دليل جامعتك في حال وجود اختلاف.')}</T>
            </Animated.View>
          )}

          {!all.length && !base.hours && (
            <Empty icon={<GraduationCap size={28} color={C.primary} />} title={t('ابدأ بمعدلك')} body={t('استورد مواد هذا الفصل من جدولك بضغطة واحدة، أو اكتب معدلك السابق في الأعلى.')} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
