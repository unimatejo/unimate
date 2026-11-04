import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, BellOff, BookOpen, CalendarPlus, Clock, FlaskConical, MapPin, MessagesSquare, Video } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown, LinearTransition, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/Glyph';

import { Button, Card, Empty, IconButton, Row, Screen, T, Tag, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { scheduleLectureReminders } from '@/lib/notify';
import { placeLine, useSchedule } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { WEEKDAYS_SHORT, clock } from '@/lib/util';
import { LOCALE, t } from '@/lib/i18n';

const KIND: Record<string, [string, string, string]> = {
  lecture: [t('محاضرة'), C.primarySoft, C.primary],
  lab: [t('مختبر'), C.greenSoft, C.greenInk],
  online: [t('أونلاين'), C.violetSoft, C.violetInk],
  tutorial: [t('مناقشة'), C.orangeSoft, C.orangeInk],
};
const EVENT: Record<string, string> = { exam_first: t('امتحان أول'), exam_second: t('امتحان ثاني'), exam_mid: t('امتحان نصفي'), exam_final: t('امتحان نهائي'), quiz: t('كويز'), assignment: t('تسليم واجب'), project: t('مشروع'), custom: t('موعد') };

const KIND_ICON = { lecture: BookOpen, lab: FlaskConical, online: Video, tutorial: MessagesSquare } as const;
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

export default function Schedule() {
  const { profile } = useAuth();
  const { meetings, events, loading, reload } = useSchedule(profile?.id);
  const [day, setDay] = useState(Math.min(new Date().getDay(), 4));
  const [off, setOff] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!profile) return;
    supabase.from('reminders').select('meeting_id, enabled').eq('user_id', (profile?.id ?? '')).not('meeting_id', 'is', null)
      .then(({ data }) => setOff(Object.fromEntries((data ?? []).map((r) => [r.meeting_id, !r.enabled]))));
  }, [profile]);

  useEffect(() => { if (!loading) scheduleLectureReminders(meetings, off, profile?.id).catch(reportError); }, [meetings, off, loading, profile?.id]);

  const list = useMemo(() => meetings.filter((m) => m.weekday === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [meetings, day]);
  const week = useMemo(() => {
    const now = new Date(); const sun = new Date(now); sun.setDate(now.getDate() - now.getDay());
    return [0, 1, 2, 3, 4].map((d) => { const x = new Date(sun); x.setDate(sun.getDate() + d); return x; });
  }, []);
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const isToday = day === new Date().getDay();
  const todayCount = meetings.filter((m) => m.weekday === new Date().getDay()).length;
  const nextExam = events.find((e) => e.kind.startsWith('exam') || e.kind === 'quiz');
  const daysLeft = nextExam ? Math.max(0, Math.ceil((new Date(nextExam.starts_at).getTime() - Date.now()) / 86400000)) : 0;

  async function flip(id: string, enabled: boolean) {
    setOff((o) => ({ ...o, [id]: !enabled }));
    await supabase.from('reminders').upsert({ user_id: (profile?.id ?? ''), meeting_id: id, enabled }, { onConflict: 'user_id,meeting_id' });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 130 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="h1">{t('جدولي')}</T>
            <Row gap={6}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.green }} /><T v="tiny" color={C.greenInk}>{t('بيتحدّث تلقائياً')}</T></Row>
          </View>
          <Row gap={8}>
            <IconButton label={t('موادي')} onPress={() => router.push('/courses')}><BookOpen size={21} color={C.ink} /></IconButton>
            <IconButton label={t('أضف موعد أو امتحان')} onPress={() => router.push('/event/new')}><CalendarPlus size={21} color={C.ink} /></IconButton>
            <IconButton label={t('إعدادات التنبيهات')} onPress={() => router.push('/settings/reminders')}><Bell size={21} color={C.ink} /></IconButton>
          </Row>
        </Row>

        <Animated.View entering={FadeInDown.duration(450)} style={{ borderRadius: 28, overflow: 'hidden' }}>
          <LinearGradient colors={['#2E5BFF', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 12 }}>
            <View style={{ position: 'absolute', top: -60, left: -40, width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.12)' }} />
            <Row gap={12}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="small" color="#DCE3FF">{new Date().toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })}</T>
                <T v="h2" color={C.white} style={{ fontFamily: F.display, fontSize: 22 }}>{todayCount ? t('عندك {0} {1} اليوم', [todayCount, todayCount === 1 ? t('محاضرة') : todayCount === 2 ? t('محاضرتين') : t('محاضرات')]) : t('اليوم فاضي')}</T>
              </View>
              <GlyphTile icon={Clock} colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.12)']} size={52} live />
            </Row>
            {nextExam && (
              <Row gap={10} style={{ backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 18, padding: 10 }}>
                <View style={{ width: 46, height: 46, borderRadius: 15, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
                  <T style={{ fontFamily: F.display, fontSize: 19, lineHeight: 22 }} color={C.orange}>{daysLeft}</T>
                  <T v="tiny" color={C.orange} style={{ fontSize: 10 }}>{daysLeft === 1 ? t('يوم') : t('أيام')}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T v="bold" color={C.white} numberOfLines={1}>{EVENT[nextExam.kind] ?? nextExam.title}: {nextExam.course_name ?? nextExam.title}</T>
                  <T v="tiny" color="#DCE3FF">{new Date(nextExam.starts_at).toLocaleString(LOCALE, { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</T>
                </View>
              </Row>
            )}
          </LinearGradient>
        </Animated.View>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {week.map((date, d) => {
            const on = d === day; const has = meetings.some((m) => m.weekday === d); const today = d === new Date().getDay();
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

        {list.length === 0 ? (
          <Empty icon={<Clock size={28} color={C.primary} />} title={t('ما عندك محاضرات هاليوم')}
            body={meetings.length === 0 ? t('جيب موادك من Teams بكبسة، أو ضيفها مرة وحدة. وقت المحاضرة اللي بيضيفه أي زميل بشعبتك بيطلع للكل.') : t('استمتع بيومك.')}
            action={meetings.length === 0 ? <Button title={t('ضيف موادي')} icon={<BookOpen size={18} color={C.white} />} onPress={() => router.push('/courses')} style={{ marginTop: 8, paddingHorizontal: 22 }} /> : undefined} />
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
            <Animated.View key={m.id} entering={FadeInDown.delay(i * 60).springify().damping(16)} layout={LinearTransition} style={{ opacity: done ? 0.55 : 1 }}>
              <Row gap={10} center={false}>
                <View style={{ width: 50, alignItems: 'center', paddingTop: 6 }}>
                  <T v="bold" style={{ fontSize: 15 }}>{clock(m.starts_at)}</T>
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
                  {live && (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: C.soft, overflow: 'hidden' }}>
                      <View style={{ width: `${Math.round(pct * 100)}%`, height: 6, borderRadius: 3, backgroundColor: g[1] }} />
                    </View>
                  )}
                  <Row gap={8}>
                    {m.kind === 'online' && m.online_url ? (
                      <Tap onPress={() => Linking.openURL(m.online_url!)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.violetSoft }}>
                        <Video size={15} color={C.violet} /><T v="small" color={C.violet}>{t('ادخل المحاضرة')}</T>
                      </Tap>
                    ) : (
                      <Tap onPress={() => router.push({ pathname: '/map', params: { building: m.building_id ?? '' } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.primarySoft }}>
                        <MapPin size={15} color={C.primary} /><T v="small" color={C.primary} numberOfLines={1} style={{ flexShrink: 1 }}>{placeLine(m)}</T>
                      </Tap>
                    )}
                    <Tap onPress={() => flip(m.id, !enabled)} accessibilityLabel={enabled ? t('وقّف التنبيه') : t('شغّل التنبيه')} accessibilityState={{ checked: enabled }}
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
              <Row key={e.id} gap={10} style={{ minHeight: 48 }}>
                <Tag label={EVENT[e.kind] ?? t('موعد')} bg={C.orangeSoft} fg={C.orangeInk} />
                <T v="small" style={{ flex: 1 }}>{e.course_name ?? e.title}</T>
                <T v="tiny" color={C.muted}>{new Date(e.starts_at).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' })}</T>
              </Row>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
