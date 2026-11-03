import { router } from 'expo-router';
import { Bell, CalendarPlus, Clock, MapPin, Video } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Linking, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Card, Empty, IconButton, Row, Screen, T, Tag, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { scheduleLectureReminders } from '@/lib/notify';
import { placeLine, useSchedule } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { WEEKDAYS_SHORT, clock } from '@/lib/util';

const KIND: Record<string, [string, string, string]> = {
  lecture: ['محاضرة', C.primarySoft, C.primary],
  lab: ['مختبر', C.greenSoft, C.greenInk],
  online: ['أونلاين', C.violetSoft, C.violetInk],
  tutorial: ['مناقشة', C.orangeSoft, C.orangeInk],
};
const EVENT: Record<string, string> = { exam_first: 'امتحان أول', exam_second: 'امتحان ثاني', exam_mid: 'امتحان نصفي', exam_final: 'امتحان نهائي', quiz: 'كويز', assignment: 'تسليم واجب', project: 'مشروع', custom: 'موعد' };

export default function Schedule() {
  const { profile } = useAuth();
  const { meetings, events, loading, reload } = useSchedule(profile?.id);
  const [day, setDay] = useState(Math.min(new Date().getDay(), 4));
  const [off, setOff] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!profile) return;
    supabase.from('reminders').select('meeting_id, enabled').eq('user_id', profile.id).not('meeting_id', 'is', null)
      .then(({ data }) => setOff(Object.fromEntries((data ?? []).map((r) => [r.meeting_id, !r.enabled]))));
  }, [profile]);

  useEffect(() => { if (meetings.length) scheduleLectureReminders(meetings, off).catch(() => {}); }, [meetings, off]);

  const list = useMemo(() => meetings.filter((m) => m.weekday === day), [meetings, day]);
  const nextExam = events.find((e) => e.kind.startsWith('exam') || e.kind === 'quiz');
  const daysLeft = nextExam ? Math.max(0, Math.ceil((new Date(nextExam.starts_at).getTime() - Date.now()) / 86400000)) : 0;

  async function flip(id: string, enabled: boolean) {
    setOff((o) => ({ ...o, [id]: !enabled }));
    await supabase.from('reminders').upsert({ user_id: profile!.id, meeting_id: id, enabled }, { onConflict: 'user_id,meeting_id' });
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        <Row style={{ justifyContent: 'space-between' }}>
          <View>
            <T v="h1">جدولي</T>
            <Row gap={6}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.green }} /><T v="tiny" color={C.greenInk}>محدّث تلقائياً من حسابك الجامعي</T></Row>
          </View>
          <Row gap={8}>
            <IconButton label="أضف موعد أو امتحان" onPress={() => router.push('/event/new')}><CalendarPlus size={21} color={C.ink} /></IconButton>
            <IconButton label="إعدادات التنبيهات" onPress={() => router.push('/settings/reminders')}><Bell size={21} color={C.ink} /></IconButton>
          </Row>
        </Row>

        {nextExam && (
          <Animated.View entering={FadeInDown}>
            <Row gap={12} style={{ backgroundColor: C.orangeSoft, borderRadius: 20, padding: 12 }}>
              <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: C.orange, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ fontFamily: F.display, fontSize: 22, lineHeight: 26 }} color={C.white}>{daysLeft}</T>
                <T v="tiny" color={C.white}>{daysLeft === 1 ? 'يوم' : 'أيام'}</T>
              </View>
              <View style={{ flex: 1 }}>
                <T v="bold">{EVENT[nextExam.kind] ?? nextExam.title}: {nextExam.course_name ?? nextExam.title}</T>
                <T v="small" color={C.orangeInk}>{new Date(nextExam.starts_at).toLocaleString('ar-JO', { weekday: 'long', hour: 'numeric', minute: '2-digit' })}</T>
              </View>
            </Row>
          </Animated.View>
        )}

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2, 3, 4].map((d) => {
            const on = d === day; const has = meetings.some((m) => m.weekday === d);
            return (
              <Tap key={d} onPress={() => setDay(d)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                style={[{ flex: 1, minHeight: 68, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 3, backgroundColor: on ? C.primary : C.card }, on ? { shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : shadow]}>
                <T v="tiny" color={on ? C.white : C.muted}>{WEEKDAYS_SHORT[d]}</T>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: has ? (on ? C.white : C.primary) : 'transparent' }} />
              </Tap>
            );
          })}
        </View>

        {list.length === 0 ? (
          <Empty icon={<Clock size={28} color={C.primary} />} title="ما عندك محاضرات هاليوم"
            body={meetings.length === 0 ? 'موادك بتنضاف من حسابك الجامعي. لو وقت أو قاعة ناقصة، أول ما يأكدها 3 من زملاءك بتطلع للكل.' : 'استمتع بيومك.'} />
        ) : list.map((m, i) => {
          const k = KIND[m.kind] ?? KIND.lecture;
          const enabled = !off[m.id];
          return (
            <Animated.View key={m.id} entering={FadeInDown.delay(i * 60)}>
              <Card style={{ borderRightWidth: 4, borderRightColor: k[2] }}>
                <Row gap={12} center={false}>
                  <View style={{ alignItems: 'center', width: 52 }}>
                    <T v="h3">{clock(m.starts_at)}</T>
                    <View style={{ width: 2, height: 14, backgroundColor: C.line, marginVertical: 2 }} />
                    <T v="tiny" color={C.muted}>{clock(m.ends_at)}</T>
                  </View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Row gap={6}><T v="bold">{m.course_name}</T><Tag label={k[0]} bg={k[1]} fg={k[2]} /></Row>
                    <T v="tiny" color={C.muted}>{m.instructor ?? ''} · شعبة {m.section_no}</T>
                    {m.kind === 'online' && m.online_url ? (
                      <Tap onPress={() => Linking.openURL(m.online_url!)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
                        <Video size={15} color={C.violet} /><T v="small" color={C.violet}>ادخل المحاضرة</T>
                      </Tap>
                    ) : (
                      <Tap onPress={() => router.push({ pathname: '/(tabs)/map', params: { building: m.building_id ?? '' } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32 }}>
                        <MapPin size={15} color={C.primary} /><T v="small" color={C.primary}>{placeLine(m)}</T>
                      </Tap>
                    )}
                  </View>
                </Row>
                <View style={{ borderTopWidth: 1, borderTopColor: C.line, marginTop: 8 }}>
                  <Toggle value={enabled} onChange={(v) => flip(m.id, v)} label="تنبيه قبل المحاضرة" hint="حسب إعداداتك، أو ذكي حسب بعدك عن القاعة" />
                </View>
              </Card>
            </Animated.View>
          );
        })}

        {events.length > 0 && (
          <Card>
            <T v="h3" style={{ marginBottom: 6 }}>امتحانات ومواعيد</T>
            {events.slice(0, 6).map((e) => (
              <Row key={e.id} gap={10} style={{ minHeight: 48 }}>
                <Tag label={EVENT[e.kind] ?? 'موعد'} bg={C.orangeSoft} fg={C.orangeInk} />
                <T v="small" style={{ flex: 1 }}>{e.course_name ?? e.title}</T>
                <T v="tiny" color={C.muted}>{new Date(e.starts_at).toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' })}</T>
              </Row>
            ))}
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}
