import { AlarmClock, EyeOff, Mail, BellRing, CalendarDays, Heart, Megaphone, MessageCircle, Moon, Users } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';

import { Chip, Header, Row, Screen, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ensurePermission, scheduleLectureReminders } from '@/lib/notify';
import { useSchedule } from '@/lib/schedule';
import { usePrefs } from '@/lib/settings';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { clock, WEEKDAYS } from '@/lib/util';
import { t } from '@/lib/i18n';
import { reportError } from '@/lib/errors';
import { run } from '@/lib/run';

const ic = (n: ReactNode) => <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>{n}</View>;
const MINUTES = [5, 10, 15, 20, 30, 45, 60];

type Rem = { meeting_id: string; minutes: number | null; enabled: boolean };

/** Settings › reminders: lecture reminders (per lecture), exams and the evening summary. */
export default function Reminders() {
  const { profile } = useAuth();
  const { prefs, set, loaded } = usePrefs();
  const { meetings } = useSchedule(profile?.id);
  const [rems, setRems] = useState<Record<string, Rem>>({});
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    supabase.from('reminders').select('meeting_id, minutes, enabled').eq('user_id', (profile?.id ?? '')).not('meeting_id', 'is', null)
      .then(({ data }) => setRems(Object.fromEntries(((data ?? []) as Rem[]).map((r) => [r.meeting_id, r]))));
  }, [profile]);

  // reschedule with the values on screen (not what the server had a moment ago)
  useEffect(() => {
    if (!loaded) return;
    const off = Object.fromEntries(Object.values(rems).map((r) => [r.meeting_id, !r.enabled]));
    const perMin = Object.fromEntries(Object.values(rems).map((r) => [r.meeting_id, r.minutes]));
    scheduleLectureReminders(meetings, off, profile?.id, { lectures: prefs.lectures, lecture_minutes: prefs.lecture_minutes, nightly_summary: prefs.nightly_summary, perMin }).catch(reportError);
  }, [meetings, rems, prefs.lecture_minutes, prefs.lectures, prefs.nightly_summary, loaded, profile?.id]);

  /** Turning a reminder on needs notification permission; if iOS won't ask again, point to Settings. */
  async function askNotif() {
    if (await ensurePermission(true)) return true;
    Alert.alert(t('التنبيهات مسكّرة'), t('فعّلها من إعدادات الجهاز عشان توصلك التذكيرات.'), [
      { text: t('إلغاء'), style: 'cancel' },
      { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings().catch(() => {}) },
    ]);
    return false;
  }

  async function setRem(meeting_id: string, p: Partial<Rem>) {
    if (!profile) return;
    const cur = rems[meeting_id] ?? { meeting_id, minutes: null, enabled: true };
    const next = { ...cur, ...p };
    setRems((x) => ({ ...x, [meeting_id]: next }));
    const r = await run(supabase.from('reminders').upsert({ user_id: profile.id, ...next }, { onConflict: 'user_id,meeting_id' }));
    if (!r.ok) setRems((x) => ({ ...x, [meeting_id]: cur }));
  }

  return (
    <Screen>
      <Header title={t('التنبيهات والمنبّهات')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        <View style={{ gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
          <Toggle icon={ic(<BellRing size={18} color={C.primary} />)} label={t('نبّهني قبل المحاضرات')} value={prefs.lectures} onChange={async (v) => { if (v && !(await askNotif())) return; set({ lectures: v }); }} />
          {prefs.lectures && (
            <>
              <T v="small" color={C.muted}>{t('قديش قبل؟')}</T>
              <Row gap={8} style={{ flexWrap: 'wrap' }}>
                {MINUTES.map((m) => <Chip key={m} label={t('{0} د', [m])} active={prefs.lecture_minutes === m} onPress={() => set({ lecture_minutes: m })} />)}
              </Row>
            </>
          )}
        </View>

        <View style={{ gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
          <Toggle icon={ic(<Moon size={18} color={C.violet} />)} label={t('ملخص بكرة كل ليلة')} hint={t('محاضراتك وتسليماتك لبكرة الساعة 9 بالليل')} value={prefs.nightly_summary} onChange={async (v) => { if (v && !(await askNotif())) return; set({ nightly_summary: v }); }} />
          <Toggle icon={ic(<CalendarDays size={18} color={C.orange} />)} label={t('الامتحانات والتسليمات')} value={prefs.exams} onChange={(v) => set({ exams: v })} />
          <Toggle icon={ic(<MessageCircle size={18} color={C.pink} />)} label={t('الرسائل')} value={prefs.messages} onChange={(v) => set({ messages: v })} />
          <Toggle icon={ic(<EyeOff size={18} color={C.violet} />)} label={t('اعرض نص الرسالة بالإشعار')} hint={t('إذا سكّرتها، الإشعار بيقول «رسالة جديدة» بس، بدون الكلام، عشان ما حدا يقرأه على شاشة القفل.')} value={prefs.preview} onChange={(v) => set({ preview: v })} />
          <Toggle icon={ic(<Heart size={18} color={C.red} />)} label={t('لايكات وتعليقات ومتابعات')} value={prefs.social} onChange={(v) => set({ social: v })} />
          <Toggle icon={ic(<Users size={18} color={C.primary} />)} label={t('مجتمعات موادي وكليتي')} value={prefs.community} onChange={(v) => set({ community: v })} />
          <Toggle icon={ic(<Megaphone size={18} color={C.ink2} />)} label={t('عروض المطاعم والمحلات')} value={prefs.ads} onChange={(v) => set({ ads: v })} />
          <Toggle icon={ic(<Mail size={18} color={C.green} />)} label={t('عروض على الإيميل')} hint={t('عروض وخصومات حوالين جامعتك على إيميلك الجامعي، وبتقدر توقفها من أي إيميل')} value={prefs.email_offers} onChange={(v) => set({ email_offers: v })} />
        </View>

        <View style={{ gap: 8 }}>
          <T v="h3" style={{ paddingHorizontal: 4 }}>{t('منبّه لكل محاضرة')}</T>
          <T v="tiny" color={C.muted} style={{ paddingHorizontal: 4 }}>{t('بتقدر تطفي محاضرة أو تحط لها وقت مختلف.')}</T>
          {meetings.length === 0 && <T v="small" color={C.muted} style={{ padding: 14 }}>{t('جدولك لسا ما وصل.')}</T>}
          {meetings.map((m) => {
            const r = rems[m.id];
            const on = r?.enabled ?? true;
            return (
              <View key={m.id} style={{ backgroundColor: C.card, borderRadius: 20, padding: 12, gap: 10, opacity: prefs.lectures ? 1 : 0.5 }}>
                <Row gap={10}>
                  <AlarmClock size={20} color={on ? C.primary : C.faint} />
                  <Tap haptic={false} scale={1} onPress={() => setOpen(open === m.id ? null : m.id)} style={{ flex: 1 }}>
                    <T v="bodyMd">{m.course_name}</T>
                    <T v="tiny" color={C.muted}>{WEEKDAYS[m.weekday]} · {clock(m.starts_at)} · {r?.minutes ? t('قبل {0} د', [r.minutes]) : t('قبل {0} د', [prefs.lecture_minutes])}</T>
                  </Tap>
                  <Toggle label="" a11yLabel={t('تنبيه {0}', [m.course_name])} value={on} onChange={(v) => setRem(m.id, { enabled: v })} />
                </Row>
                {open === m.id && on && (
                  <Row gap={6} style={{ flexWrap: 'wrap' }}>
                    <Chip label={t('الافتراضي')} active={!r?.minutes} onPress={() => setRem(m.id, { minutes: null })} />
                    {MINUTES.map((x) => <Chip key={x} label={t('{0} د', [x])} active={r?.minutes === x} onPress={() => setRem(m.id, { minutes: x })} />)}
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
