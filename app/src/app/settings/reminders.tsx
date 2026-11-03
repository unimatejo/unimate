import { AlarmClock, BellRing, CalendarDays, Footprints, Heart, Megaphone, MessageCircle, Moon, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip, Header, Row, Screen, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { scheduleLectureReminders } from '@/lib/notify';
import { useSchedule } from '@/lib/schedule';
import { usePrefs } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { clock, WEEKDAYS } from '@/lib/util';

const ic = (n: ReactNode) => <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{n}</View>;
const MINUTES = [5, 10, 15, 20, 30, 45, 60];

type Rem = { meeting_id: string; minutes: number | null; enabled: boolean };

export default function Reminders() {
  const { profile } = useAuth();
  const { prefs, set } = usePrefs();
  const { meetings } = useSchedule(profile?.id);
  const [rems, setRems] = useState<Record<string, Rem>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase.from('reminders').select('meeting_id, minutes, enabled').eq('user_id', profile.id).not('meeting_id', 'is', null)
      .then(({ data }) => setRems(Object.fromEntries(((data ?? []) as Rem[]).map((r) => [r.meeting_id, r]))));
  }, [profile]);

  useEffect(() => {
    if (!meetings.length) return;
    const off = Object.fromEntries(Object.values(rems).map((r) => [r.meeting_id, !r.enabled]));
    scheduleLectureReminders(meetings, off).catch(() => {});
  }, [meetings, rems, prefs.lecture_minutes, prefs.lectures]);

  async function setRem(meeting_id: string, p: Partial<Rem>) {
    const cur = rems[meeting_id] ?? { meeting_id, minutes: null, enabled: true };
    const next = { ...cur, ...p };
    setRems((x) => ({ ...x, [meeting_id]: next }));
    await supabase.from('reminders').upsert({ user_id: profile!.id, ...next }, { onConflict: 'user_id,meeting_id' });
  }

  return (
    <Screen>
      <Header title="التنبيهات والمنبّهات" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        <View style={{ gap: 12, backgroundColor: C.white, borderRadius: 22, padding: 14 }}>
          <Toggle icon={ic(<BellRing size={18} color={C.primary} />)} label="نبّهني قبل المحاضرات" value={prefs.lectures} onChange={(v) => set({ lectures: v })} />
          {prefs.lectures && (
            <>
              <T v="small" color={C.muted}>قديش قبل؟</T>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {MINUTES.map((m) => <Chip key={m} label={`${m} د`} active={prefs.lecture_minutes === m} onPress={() => set({ lecture_minutes: m })} />)}
              </Row>
              <Toggle icon={ic(<Footprints size={18} color={C.green} />)} label="«اطلع هلأ» الذكي" hint="بنحسب المشي من مكانك للقاعة وبننبهك بالوقت الصح" value={prefs.smart_leave} onChange={(v) => set({ smart_leave: v })} />
            </>
          )}
        </View>

        <View style={{ gap: 12, backgroundColor: C.white, borderRadius: 22, padding: 14 }}>
          <Toggle icon={ic(<Moon size={18} color={C.violet} />)} label="ملخص بكرة كل ليلة" hint="محاضراتك وتسليماتك لبكرة الساعة 9 بالليل" value={prefs.nightly_summary} onChange={(v) => set({ nightly_summary: v })} />
          <Toggle icon={ic(<CalendarDays size={18} color={C.orange} />)} label="الامتحانات والتسليمات" value={prefs.exams} onChange={(v) => set({ exams: v })} />
          <Toggle icon={ic(<MessageCircle size={18} color={C.pink} />)} label="الرسائل" value={prefs.messages} onChange={(v) => set({ messages: v })} />
          <Toggle icon={ic(<Heart size={18} color={C.red} />)} label="لايكات وتعليقات ومتابعات" value={prefs.social} onChange={(v) => set({ social: v })} />
          <Toggle icon={ic(<Users size={18} color={C.primary} />)} label="مجتمعات موادي وكليتي" value={prefs.community} onChange={(v) => set({ community: v })} />
          <Toggle icon={ic(<Megaphone size={18} color={C.ink2} />)} label="عروض المطاعم والمحلات" value={prefs.ads} onChange={(v) => set({ ads: v })} />
        </View>

        <View style={{ gap: 8 }}>
          <T v="h3" style={{ paddingHorizontal: 4 }}>منبّه لكل محاضرة</T>
          <T v="tiny" color={C.muted} style={{ paddingHorizontal: 4 }}>بتقدر تطفي محاضرة أو تحط لها وقت مختلف.</T>
          {meetings.length === 0 && <T v="small" color={C.muted} style={{ padding: 14 }}>جدولك لسا ما وصل.</T>}
          {meetings.map((m) => {
            const r = rems[m.id];
            const on = r?.enabled ?? true;
            return (
              <View key={m.id} style={{ backgroundColor: C.white, borderRadius: 20, padding: 12, gap: 10, opacity: prefs.lectures ? 1 : 0.5 }}>
                <Row gap={10}>
                  <AlarmClock size={20} color={on ? C.primary : C.faint} />
                  <Tap haptic={false} scale={1} onPress={() => setOpen(open === m.id ? null : m.id)} style={{ flex: 1 }}>
                    <T v="bodyMd">{m.course_name}</T>
                    <T v="tiny" color={C.muted}>{WEEKDAYS[m.weekday]} · {clock(m.starts_at)} · {r?.minutes ? `قبل ${r.minutes} د` : `قبل ${prefs.lecture_minutes} د`}</T>
                  </Tap>
                  <Toggle label="" value={on} onChange={(v) => setRem(m.id, { enabled: v })} />
                </Row>
                {open === m.id && on && (
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Chip label="الافتراضي" active={!r?.minutes} onPress={() => setRem(m.id, { minutes: null })} />
                    {MINUTES.map((x) => <Chip key={x} label={`${x} د`} active={r?.minutes === x} onPress={() => setRem(m.id, { minutes: x })} />)}
                  </Row>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>
    </Screen>
  );
}
