import { router } from 'expo-router';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, BellOff, BookOpen, Calculator, Car, CalendarPlus, CalendarX, ScanLine, Clock, FlaskConical, Hourglass, MapPin, MessagesSquare, UserX, Video, EyeOff, MonitorSmartphone } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/ui/Glyph';

import { Button, Card, Empty, IconButton, Row, Screen, T, Tag, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { run } from '@/lib/run';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { scheduleLectureReminders } from '@/lib/notify';
import { SectionAsks } from '@/components/study/SectionAsks';
import { placeLine, useSchedule, ymd, type Meeting } from '@/lib/schedule';
import { toast } from '@/lib/toast';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { WEEKDAYS_SHORT, clock, isWebUrl } from '@/lib/util';
import { LOCALE, t } from '@/lib/i18n';
import { useScreenTimer } from '@/lib/perf';
import { featureOn, useAppContent } from '@/lib/appContent';

const KIND: Record<string, [string, string, string]> = {
  lecture: [t('محاضرة'), C.primarySoft, C.primary],
  lab: [t('مختبر'), C.greenSoft, C.greenInk],
  online: [t('أونلاين'), C.violetSoft, C.violetInk],
  blended: [t('مدمج'), C.skySoft, C.blue],
  tutorial: [t('مناقشة'), C.orangeSoft, C.orangeInk],
};
const EVENT: Record<string, string> = { exam_first: t('امتحان أول'), exam_second: t('امتحان ثاني'), exam_mid: t('امتحان نصفي'), exam_final: t('امتحان نهائي'), quiz: t('كويز'), assignment: t('تسليم واجب'), project: t('مشروع'), custom: t('موعد') };

const KIND_ICON = { lecture: BookOpen, lab: FlaskConical, online: Video, blended: MonitorSmartphone, tutorial: MessagesSquare } as const;
const PALETTE = [GRAD.blue, GRAD.pink, GRAD.green, GRAD.orange, GRAD.violet, GRAD.teal, GRAD.indigo, GRAD.red];
function courseColors(name: string) { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function LiveDot() {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1300 }), -1, false); }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.7 * (1 - t.value), transform: [{ scale: 1 + t.value * 1.8 }] }));
  return (
    <View style={{ width: 8, height: 8 }}>
      <Animated.View style={[{ position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }, ring]} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' }} />
    </View>
  );
}

/** The timetable tab: the week's classes, attendance, GPA and exams tools, and reading a timetable photo. */
export default function Schedule() {
  const content = useAppContent(); // the owner can switch tools off
  const { profile } = useAuth();
  const { meetings, events, loading, error, reload, now } = useSchedule(profile?.id);
  useScreenTimer('schedule', !loading);
  // Friday / Saturday: show the coming Sunday
  const [day, setDay] = useState(() => { const d = new Date().getDay(); return d > 4 ? 0 : d; });
  const [flipping, setFlipping] = useState<string | null>(null);
  const [off, setOff] = useState<Record<string, boolean>>({});
  // today's absences I marked from this screen: `${section}|${HH:MM}` -> mark id
  const [absent, setAbsent] = useState<Record<string, string>>({});
  const today = ymd(new Date());
  useEffect(() => {
    if (!profile) return;
    supabase.from('attendance_marks').select('id, section_id, slot').eq('on_date', today)
      .then(({ data }) => setAbsent(Object.fromEntries((data ?? []).map((a) => [`${a.section_id}|${a.slot}`, a.id as string]))), () => {});
  }, [profile, today]);
  async function toggleAbsent(m: Meeting) {
    const key = `${m.section_id}|${m.starts_at.slice(0, 5)}`;
    const had = absent[key];
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (had) {
      setAbsent((a) => { const n = { ...a }; delete n[key]; return n; });
      const r = await run(supabase.from('attendance_marks').delete().eq('id', had));
      if (!r.ok) setAbsent((a) => ({ ...a, [key]: had }));
      return;
    }
    setAbsent((a) => ({ ...a, [key]: 'pending' }));
    const r = await run(supabase.from('attendance_marks').insert({ section_id: m.section_id, on_date: today, slot: m.starts_at.slice(0, 5), status: 'absent' }).select('id').single(), { quiet: true });
    if (!r.ok || !r.data) { setAbsent((a) => { const n = { ...a }; delete n[key]; return n; }); toast.error(t('ما انسجل الغياب، جرّب كمان مرة.')); return; }
    setAbsent((a) => ({ ...a, [key]: (r.data as unknown as { id: string }).id }));
    toast(t('انسجل غياب {0} ✓', [m.course_name]));
  }

  useEffect(() => {
    if (!profile) return;
    supabase.from('reminders').select('meeting_id, enabled').eq('user_id', (profile?.id ?? '')).not('meeting_id', 'is', null)
      .then(({ data }) => setOff(Object.fromEntries((data ?? []).map((r) => [r.meeting_id, !r.enabled]))));
  }, [profile]);

  useEffect(() => { if (!loading) scheduleLectureReminders(meetings, off, profile?.id).catch(reportError); }, [meetings, off, loading, profile?.id]);

  const list = useMemo(() => meetings.filter((m) => m.weekday === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [meetings, day]);
  const dow = now.getDay();
  const week = useMemo(() => {
    const sun = new Date(now); sun.setDate(now.getDate() - dow + (dow > 4 ? 7 : 0));
    return [0, 1, 2, 3, 4].map((d) => { const x = new Date(sun); x.setDate(sun.getDate() + d); return x; });
  }, [now, dow]);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const isToday = day === dow;
  const todayCount = meetings.filter((m) => m.weekday === dow).length;
  const nextExam = events.find((e) => e.kind.startsWith('exam') || e.kind === 'quiz');
  const daysLeft = nextExam ? Math.max(0, Math.ceil((new Date(nextExam.starts_at).getTime() - Date.now()) / 86400000)) : 0;

  // a classmate's time that isn't mine (another section in the same Teams group): gone from my schedule in one tap
  function notMine(m: Meeting) {
    Alert.alert(t('مش محاضرتك؟'), t('بنشيلها من جدولك إنت بس، وما بتتغيّر عند زملائك.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('شيلها'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('personal_meetings').insert({ user_id: profile?.id, section_id: m.section_id, replaces: m.id, hidden: true });
        if (error) Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); else reload();
      } },
    ]);
  }

  async function flip(id: string, enabled: boolean) {
    if (!profile || flipping) return;
    setFlipping(id);
    setOff((o) => ({ ...o, [id]: !enabled }));
    const r = await run(supabase.from('reminders').upsert({ user_id: profile.id, meeting_id: id, enabled }, { onConflict: 'user_id,meeting_id' }), { msg: t('ما قدرنا نغيّر التنبيه، جرّب كمان مرة.') });
    if (!r.ok) setOff((o) => ({ ...o, [id]: enabled }));
    setFlipping(null);
  }

  function openLink(url: string) { if (!isWebUrl(url)) { Alert.alert(t('الرابط مش صالح')); return; } Linking.openURL(url).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط'))); }

  function eventMenu(e: (typeof events)[number]) {
    Alert.alert(e.title, new Date(e.starts_at).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) + (e.location ? `\n${e.location}` : ''), [
      { text: t('تعديل'), onPress: () => router.push({ pathname: '/event/new', params: { id: e.id } }) },
      { text: t('إغلاق'), style: 'cancel' },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 130 }} refreshControl={<PullRefresh onRefresh={reload} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="h1">{t('جدولي')}</T>
            <Row gap={6}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.green }} /><T v="tiny" color={C.greenInk}>{t('بيتحدّث تلقائياً')}</T></Row>
          </View>
          <Row gap={8}>
            <IconButton label={t('صوّر جدولك')} onPress={() => router.push({ pathname: '/courses', params: { scan: '1' } })}><ScanLine size={21} color={C.ink} /></IconButton>
            <IconButton label={t('موادي')} onPress={() => router.push('/courses')}><BookOpen size={21} color={C.ink} /></IconButton>
            <IconButton label={t('أضف موعد أو امتحان')} onPress={() => router.push('/event/new')}><CalendarPlus size={21} color={C.ink} /></IconButton>
            <IconButton label={t('إعدادات التنبيهات')} onPress={() => router.push('/settings/reminders')}><Bell size={21} color={C.ink} /></IconButton>
          </Row>
        </Row>

        <Animated.View entering={FadeIn.duration(220)} style={{ borderRadius: 28, overflow: 'hidden' }}>
          <LinearGradient colors={[C.primary, C.primaryDark === '#C2412A' ? '#FF8E73' : '#FF9A80']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 12 }}>
            <View style={{ position: 'absolute', top: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.16)' }} />
            <Row gap={12}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="small" color={C.onPrimary} style={{ opacity: 0.75 }}>{new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</T>
                <T v="h2" color={C.onPrimary} style={{ fontFamily: F.display, fontSize: 22 }}>{todayCount ? t('عندك {0} {1} اليوم', [todayCount, todayCount === 1 ? t('محاضرة') : todayCount === 2 ? t('محاضرتين') : t('محاضرات')]) : t('اليوم فاضي')}</T>
              </View>
              <GlyphTile icon={Clock} colors={['rgba(14,20,48,0.22)', 'rgba(14,20,48,0.10)']} size={52} live />
            </Row>
            {nextExam && (
              <Row gap={10} style={{ backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: 18, padding: 10 }}>
                <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
                  <T style={{ fontFamily: F.display, fontSize: 19, lineHeight: 22 }} color={C.orange}>{daysLeft}</T>
                  <T v="tiny" color={C.orange} style={{ fontSize: 10 }}>{daysLeft === 1 ? t('يوم') : t('أيام')}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="bold" color={C.onPrimary} numberOfLines={1}>{EVENT[nextExam.kind] ?? nextExam.title}: {nextExam.course_name ?? nextExam.title}</T>
                  <T v="tiny" color={C.onPrimary} style={{ opacity: 0.75 }}>{new Date(nextExam.starts_at).toLocaleString(LOCALE, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</T>
                </View>
              </Row>
            )}
          </LinearGradient>
        </Animated.View>

        <SectionAsks onChange={reload} />

        <Row gap={10}>
          {([
            [t('غياباتي'), CalendarX, GRAD.red, '/attendance', 'attendance'],
            [t('معدلي'), Calculator, GRAD.blue, '/gpa', 'gpa'],
            [t('امتحاناتي'), Hourglass, GRAD.orange, '/exams', 'exams'],
            [t('توصيلات'), Car, GRAD.green, '/rides', 'rides'],
          ] as const).filter((x) => featureOn(content, x[4])).map(([label, Icon, g, to]) => (
            <Tap key={to} onPress={() => router.push(to)} scale={0.95} accessibilityRole="button" accessibilityLabel={label}
              style={[{ flex: 1, backgroundColor: C.card, borderRadius: 22, paddingVertical: 12, alignItems: 'center', gap: 8 }, shadow]}>
              <GlyphTile icon={Icon} colors={g} size={42} />
              <T v="small" style={{ fontFamily: F.bodyBold }}>{label}</T>
            </Tap>
          ))}
        </Row>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {week.map((date, d) => {
            const on = d === day; const has = meetings.some((m) => m.weekday === d); const today = d === dow;
            return (
              <Tap key={d} onPress={() => setDay(d)} scale={0.92} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={[{ flex: 1, minHeight: 76, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 2, backgroundColor: on ? C.inverse : C.card, borderWidth: today && !on ? 1.5 : 0, borderColor: C.primary }, on ? { shadowColor: C.ink, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : shadow]}>
                <T v="tiny" color={on ? C.faint : C.muted}>{WEEKDAYS_SHORT[d]}</T>
                <T style={{ fontFamily: F.display, fontSize: 20, lineHeight: 26 }} color={on ? C.onInverse : C.ink}>{date.getDate()}</T>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: has ? (on ? '#FFB547' : C.primary) : 'transparent' }} />
              </Tap>
            );
          })}
        </View>

        {loading && meetings.length === 0 ? <ListSkeleton n={3} />
        : error && meetings.length === 0 ? <Empty icon={<Clock size={28} color={C.red} />} title={t('ما قدرنا نحمّل الجدول')} body={t('تأكد من الإنترنت وجرّب كمان مرة.')} action={<Button kind="soft" title={t('جرّب مرة ثانية')} onPress={reload} style={{ paddingHorizontal: 24 }} />} />
        : list.length === 0 ? (
          <Empty icon={<Clock size={28} color={C.primary} />} title={t('ما عندك محاضرات هاليوم')}
            body={meetings.length === 0 ? t('جيب موادك من Teams بكبسة، أو ضيفها مرة وحدة. وقت المحاضرة اللي بيضيفه أي زميل بشعبتك بيطلع للكل.') : t('استمتع بيومك.')}
            action={meetings.length === 0 ? (
              <View style={{ gap: 8, marginTop: 8 }}>
                <Button title={t('صوّر جدولك')} icon={<ScanLine size={18} color={C.white} />} onPress={() => router.push({ pathname: '/courses', params: { scan: '1' } })} style={{ paddingHorizontal: 22 }} />
                <Button kind="soft" title={t('ضيف موادي')} icon={<BookOpen size={18} color={C.primary} />} onPress={() => router.push('/courses')} style={{ paddingHorizontal: 22 }} />
              </View>
            ) : undefined} />
        ) : list.map((m, i) => {
          const k = KIND[m.kind] ?? KIND.lecture;
          const Icon = KIND_ICON[m.kind as keyof typeof KIND_ICON] ?? BookOpen;
          const g = courseColors(m.course_name);
          const enabled = !off[m.id];
          const st = toMin(m.starts_at), en = toMin(m.ends_at);
          const live = isToday && nowMin >= st && nowMin < en;
          const done = isToday && nowMin >= en;
          const pct = live ? (nowMin - st) / (en - st) : 0;
          return (
            <Animated.View key={m.id} entering={FadeIn.delay(i * 60).duration(220)} style={{ opacity: done || m.changed === 'cancelled' ? 0.55 : 1 }}>
              <Row gap={10} center={false}>
                <View style={{ width: 50, alignItems: 'center', paddingTop: 6 }}>
                  <T v="bold" style={{ fontSize: 15 }}>{clock(m.starts_at, false)}</T>
                  <T v="tiny" color={C.muted} style={{ fontSize: 10, marginTop: -2 }}>{Number(m.starts_at.slice(0, 2)) < 12 ? t('ص') : t('م')}</T>
                  <View style={{ width: 2, flex: 1, minHeight: 30, backgroundColor: live ? g[1] : C.line, marginVertical: 4, borderRadius: 1 }} />
                  <T v="tiny" color={C.muted}>{clock(m.ends_at)}</T>
                </View>
                <View style={[{ flex: 1, backgroundColor: C.card, borderRadius: 24, padding: 14, gap: 10, overflow: 'hidden' }, shadow]}>
                  {live && (
                    <LinearGradient colors={g as unknown as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4 }} />
                  )}
                  <Row gap={12}>
                    <GlyphTile icon={Icon} colors={g} size={46} live={live} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T v="bold" numberOfLines={2}>{m.course_name}</T>
                      <T v="tiny" color={C.muted} numberOfLines={1}>{[m.instructor, t('شعبة {0}', [m.section_no])].filter(Boolean).join(' · ')}</T>
                    </View>
                    {live ? (
                      <Row gap={6} style={{ backgroundColor: g[1], paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 }}><LiveDot /><T v="tiny" color={C.white}>{t('هلأ')}</T></Row>
                    ) : <Tag label={k[0]} bg={k[1]} fg={k[2]} />}
                  </Row>
                  {m.changed && (
                    <Tap haptic={false} onPress={() => router.push('/courses')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: m.changed === 'cancelled' ? C.redSoft : C.orangeSoft }}>
                      <T v="tiny" color={m.changed === 'cancelled' ? C.red : C.orange} style={{ flex: 1 }}>
                        {m.changed === 'cancelled' ? t('ألغيت هالمحاضرة هالأسبوع') : t('موعد معدّل لهالأسبوع بس')}{m.note ? ` · ${m.note}` : ''}
                      </T>
                    </Tap>
                  )}
                  {live && (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.soft, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.round(pct * 100)}%`, height: 6, borderRadius: 3, backgroundColor: g[1] }} />
                    </View>
                  )}
                  <Row gap={8}>
                    {m.kind === 'online' && m.online_url ? (
                      <Tap onPress={() => openLink(m.online_url!)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.violetSoft }}>
                        <Video size={15} color={C.violet} /><T v="small" color={C.violet}>{t('ادخل المحاضرة')}</T>
                      </Tap>
                    ) : (
                      <Tap onPress={() => router.push({ pathname: '/map', params: { building: m.building_id ?? '' } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.primarySoft }}>
                        <MapPin size={15} color={C.primary} /><T v="small" color={C.primary} numberOfLines={1} style={{ flexShrink: 1 }}>{placeLine(m)}</T>
                      </Tap>
                    )}
                    {done && m.changed !== 'cancelled' && (() => {
                      const on = !!absent[`${m.section_id}|${m.starts_at.slice(0, 5)}`];
                      return (
                        <Tap onPress={() => toggleAbsent(m)} accessibilityRole="button" accessibilityState={{ checked: on }} accessibilityLabel={on ? t('شيل الغياب') : t('غبت عن هالمحاضرة')}
                          style={{ height: 38, paddingHorizontal: 10, borderRadius: 12, backgroundColor: on ? C.redSoft : C.soft, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <UserX size={15} color={on ? C.red : C.muted} /><T v="tiny" color={on ? C.red : C.muted}>{on ? t('غبت ✓') : t('غبت؟')}</T>
                        </Tap>
                      );
                    })()}
                    {m.source !== 'personal' && m.source !== 'change' && (
                      <Tap onPress={() => notMine(m)} accessibilityLabel={t('مش محاضرتي')}
                        style={{ height: 38, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.soft, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <EyeOff size={15} color={C.muted} /><T v="tiny" color={C.muted}>{t('مش إلي')}</T>
                      </Tap>
                    )}
                    <Tap onPress={() => flip(m.id, !enabled)} disabled={flipping === m.id} accessibilityLabel={enabled ? t('وقّف التنبيه') : t('شغّل التنبيه')} accessibilityState={{ checked: enabled }}
                      style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: enabled ? C.orangeSoft : C.soft, alignItems: 'center', justifyContent: 'center' }}>
                      {enabled ? <Bell size={17} color={C.orange} fill={C.orange} /> : <BellOff size={17} color={C.muted} />}
                    </Tap>
                  </Row>
                </View>
              </Row>
            </Animated.View>
          );
        })}

        {events.length > 0 && (
          <Card>
            <T v="h3" style={{ marginBottom: 6 }}>{t('امتحانات ومواعيد')}</T>
            {events.slice(0, 6).map((e) => (
              <Tap key={e.id} haptic={false} scale={0.98} onPress={() => eventMenu(e)} accessibilityLabel={e.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 }}>
                <Tag label={EVENT[e.kind] ?? t('موعد')} bg={C.orangeSoft} fg={C.orangeInk} />
                <T v="small" style={{ flex: 1 }}>{e.course_name ?? e.title}</T>
                <T v="tiny" color={C.muted}>{new Date(e.starts_at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</T>
              </Tap>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
