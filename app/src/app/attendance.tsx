import { router } from 'expo-router';
import { AlertTriangle, BookOpen, CalendarX2, ChevronLeft, Plus, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/Glyph';
import { PullRefresh } from '@/components/PullRefresh';
import { ListSkeleton } from '@/components/Skeleton';
import { AddAbsenceSheet, MarksSheet, type CourseRow, type Mark } from '@/components/study/attendance-sheets';
import { Button, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { flip, t } from '@/lib/i18n';

type Level = 'ok' | 'warn' | 'danger' | 'over';

const PALETTE = [GRAD.blue, GRAD.pink, GRAD.green, GRAD.orange, GRAD.violet, GRAD.teal, GRAD.indigo, GRAD.red];
function courseColors(name: string) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }

/** How close a course is to the absence limit. */
function levelOf(c: CourseRow): Level {
  if (c.remaining < 0) return 'over';
  if (c.remaining <= 1) return 'danger';
  if (c.limit_sessions > 0 && c.absent >= c.limit_sessions * 0.5) return 'warn';
  return 'ok';
}
const LOOK: Record<Level, { bar: string; soft: string; ink: string }> = {
  ok: { bar: C.green, soft: C.greenSoft, ink: C.greenInk },
  warn: { bar: C.orange, soft: C.orangeSoft, ink: C.orangeInk },
  danger: { bar: C.red, soft: C.redSoft, ink: C.red },
  over: { bar: '#B4122E', soft: C.redSoft, ink: C.red },
};

function Bar({ value, color }: { value: number; color: string }) {
  const p = useSharedValue(0);
  useEffect(() => { p.value = withTiming(Math.round(Math.min(1, Math.max(0, value)) * 100), { duration: 450 }); }, [value, p]);
  const w = useAnimatedStyle(() => ({ width: `${p.value}%` }));
  return (
    <View style={{ height: 8, borderRadius: 4, backgroundColor: C.soft, overflow: 'hidden' }}>
      <Animated.View style={[{ height: 8, borderRadius: 4, backgroundColor: color }, w]} />
    </View>
  );
}

function Stat({ n, label, color, soft }: { n: number; label: string; color: string; soft: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: soft, borderRadius: 20, paddingVertical: 12, alignItems: 'center', gap: 2 }}>
      <T style={{ fontFamily: F.display, fontSize: 24, lineHeight: 30 }} color={color}>{n}</T>
      <T v="tiny" color={color}>{label}</T>
    </View>
  );
}

/** «غياباتي»: absences per course against the university limit, so nobody gets barred by surprise. */
export default function Attendance() {
  const [rows, setRows] = useState<CourseRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [weeks, setWeeks] = useState(16);
  const [adding, setAdding] = useState<CourseRow | null>(null);
  const [viewing, setViewing] = useState<CourseRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_attendance');
    if (error) { setFailed(true); setRows((r) => r ?? []); return; }
    const list = (data ?? []) as CourseRow[];
    setFailed(false);
    setRows(list);
    const w = list.find((c) => c.per_week > 0);
    if (w) setWeeks(Math.round(w.total_sessions / w.per_week));
  }, []);
  useEffect(() => { load(); }, [load]);

  const pct = rows?.[0]?.absence_pct ?? 15;
  const counts = useMemo(() => {
    const c = { ok: 0, near: 0, over: 0 };
    for (const r of rows ?? []) { const l = levelOf(r); if (l === 'ok') c.ok++; else if (l === 'over') c.over++; else c.near++; }
    return c;
  }, [rows]);
  // the riskiest courses first
  const sorted = useMemo(() => [...(rows ?? [])].sort((a, b) => a.remaining - b.remaining || a.course_name.localeCompare(b.course_name)), [rows]);

  // instant feedback after saving; the real numbers come right after from the server
  function savedOne(c: CourseRow, status: Mark['status']) {
    setAdding(null);
    setRows((x) => x?.map((r) => (r.section_id !== c.section_id ? r
      : status === 'absent' ? { ...r, absent: r.absent + 1, remaining: r.remaining - 1 } : { ...r, excused: r.excused + 1 })) ?? null);
    load();
  }

  return (
    <Screen>
      <Header title={t('غياباتي')} subtitle={t('الحد {0}% من المحاضرات', [String(pct)])} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }} refreshControl={<PullRefresh onRefresh={load} />}>
        {rows === null ? <ListSkeleton n={4} />
        : rows.length === 0 ? (
          <Empty icon={<CalendarX2 size={28} color={C.primary} />}
            title={failed ? t('ما قدرنا نحمّل الغيابات') : t('ضيف موادك أول')}
            body={failed ? t('تأكد من الإنترنت وجرّب كمان مرة.') : t('بنحسب غياباتك لكل مادة من جدولك، وبنحذرك قبل ما توصل الحد.')}
            action={failed
              ? <Button kind="soft" title={t('جرّب مرة ثانية')} onPress={load} style={{ paddingHorizontal: 24 }} />
              : <Button title={t('ضيف موادي')} icon={<BookOpen size={18} color={C.white} />} onPress={() => router.push('/courses')} style={{ paddingHorizontal: 24 }} />} />
        ) : (
          <>
            <Animated.View entering={FadeIn.duration(220)} style={[{ backgroundColor: C.card, borderRadius: 26, padding: 16, gap: 12 }, shadow]}>
              <Row gap={12}>
                <GlyphTile icon={counts.over || counts.near ? AlertTriangle : ShieldCheck} colors={counts.over ? GRAD.red : counts.near ? GRAD.orange : GRAD.green} size={48} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="h3">{counts.over ? t('في مواد تجاوزت فيها الحد') : counts.near ? t('انتبه لبعض المواد') : t('وضعك تمام بكل المواد')}</T>
                  <T v="tiny" color={C.muted}>{t('المواد اللي فيها خطر بتطلع أول.')}</T>
                </View>
              </Row>
              <Row gap={8}>
                <Stat n={counts.ok} label={t('بأمان')} color={C.greenInk} soft={C.greenSoft} />
                <Stat n={counts.near} label={t('قرّبت')} color={C.orangeInk} soft={C.orangeSoft} />
                <Stat n={counts.over} label={t('تجاوزت')} color={C.red} soft={C.redSoft} />
              </Row>
            </Animated.View>

            {sorted.map((c, i) => {
              const lv = levelOf(c); const look = LOOK[lv];
              const ratio = c.limit_sessions > 0 ? c.absent / c.limit_sessions : c.absent > 0 ? 1 : 0;
              return (
                <Animated.View key={c.section_id} entering={FadeIn.delay(Math.min(i, 8) * 50).duration(220)}>
                  <Tap haptic={false} scale={0.985} onPress={() => setViewing(c)} accessibilityLabel={t('تفاصيل غيابات {0}', [c.course_name])}
                    style={[{ backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 12, borderWidth: lv === 'over' ? 1.5 : 0, borderColor: look.bar }, shadow]}>
                    <Row gap={12}>
                      <GlyphTile icon={BookOpen} colors={courseColors(c.course_name)} size={44} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <T v="bold" numberOfLines={2}>{c.course_name}</T>
                        <T v="tiny" color={C.muted} numberOfLines={1}>{[c.course_code, t('{0} بالأسبوع', [c.per_week])].filter(Boolean).join(' · ')}</T>
                      </View>
                      <ChevronLeft size={18} color={C.faint} style={flip} />
                    </Row>
                    <Bar value={ratio} color={look.bar} />
                    <Row gap={8} style={{ justifyContent: 'space-between' }}>
                      <View style={{ gap: 2, flexShrink: 1 }}>
                        <T v="small">{t('غبت {0} من {1} مسموح', [c.absent, c.limit_sessions])}</T>
                        {c.excused > 0 && <T v="tiny" color={C.muted}>{t('و{0} بعذر', [c.excused])}</T>}
                      </View>
                      <View style={{ backgroundColor: look.soft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <T v="tiny" color={look.ink} style={{ fontFamily: F.bodyBold }}>
                          {lv === 'over' ? t('تجاوزت الحد') : c.remaining === 0 ? t('ما ضلّك ولا غياب') : c.remaining === 1 ? t('ضلّك غياب واحد') : t('ضلّك {0} غيابات', [c.remaining])}
                        </T>
                      </View>
                    </Row>
                    {lv === 'over' && <T v="tiny" color={C.red}>{t('ممكن تنحرم من المادة. احكي مع الدكتور بأسرع وقت.')}</T>}
                    <Tap onPress={() => setAdding(c)} accessibilityLabel={t('سجّل غياب بـ {0}', [c.course_name])}
                      style={{ minHeight: 40, borderRadius: 14, backgroundColor: C.soft, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                      <Plus size={16} color={C.ink} /><T v="small" style={{ fontFamily: F.bodyBold }}>{t('سجّل غياب')}</T>
                    </Tap>
                  </Tap>
                </Animated.View>
              );
            })}

            <T v="tiny" color={C.faint} style={{ textAlign: 'center', marginTop: 4 }}>
              {t('الحساب تقريبي حسب جدولك ({0} أسبوع). المرجع الرسمي سجل الدكتور.', [weeks])}
            </T>
          </>
        )}
      </ScrollView>

      <AddAbsenceSheet course={adding} onClose={() => setAdding(null)} onSaved={savedOne} />
      <MarksSheet course={viewing} onClose={() => { setViewing(null); load(); }} onChanged={load} />
    </Screen>
  );
}
