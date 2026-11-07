import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { roomRoute, type Meeting } from './schedule';
import { supabase } from './supabase';
import { clock } from './util';
import { t } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Reminders need notification permission. It is asked in ONE place only: the onboarding screen ((auth)/notify,
 * lib/notifPermission). Everywhere else it is only checked, never requested.
 */
export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false; // local reminders are phone-only; the web app uses web push
  return (await Notifications.getPermissionsAsync()).granted;
}

/**
 * Weekly local reminders for every lecture, stored on the phone so they work offline.
 * Minutes come from the student's settings (default 10); a lecture can be switched off.
 */
let scheduling: Promise<void> = Promise.resolve();
/** Calls are queued, so two quick changes never interleave their cancel/schedule steps. */
type Override = { lectures?: boolean; lecture_minutes?: number; nightly_summary?: boolean; perMin?: Record<string, number | null> };
export function scheduleLectureReminders(meetings: Meeting[], off: Record<string, boolean>, userId?: string, override?: Override) {
  scheduling = scheduling.catch(() => {}).then(() => doSchedule(meetings, off, userId, override));
  return scheduling;
}

/** "In 10 minutes: <course>" — tapping it opens the walk to the room (lib/webpush useOpenTapped), else the timetable. */
function lectureContent(m: Meeting, minutes: number): Notifications.NotificationContentInput {
  const where = m.kind === 'online' ? t('أونلاين') : m.kind === 'blended' && !m.room_code && !m.building_name ? t('مدمج') : [m.building_name, m.room_code ? t('قاعة {0}', [m.room_code]) : null].filter(Boolean).join(' · ');
  const walk = !!m.building_id && m.kind !== 'online';
  return {
    title: t('بعد {0} دقايق: {1}', [minutes, m.course_name]),
    body: walk ? t('{0} · {1} · اكبس وبوديك للقاعة', [where, clock(m.starts_at)]) : t('{0} · {1}', [where || t('شوف القاعة بالجدول'), clock(m.starts_at)]),
    data: { kind: 'lecture', meeting: m.id, building: m.building_id, url: walk ? roomUrl(m) : '/(tabs)/schedule' },
  };
}

/**
 * Settings › "جرّب التنبيه": the reminder of the next lecture (one with a room on the map if there is one), 5 seconds
 * from now, exactly as it will come before the lecture. Lock the phone and tap it to check it opens the walk.
 */
export async function testLectureReminder(meetings: Meeting[], minutes: number): Promise<'sent' | 'no_permission' | 'no_lectures'> {
  if (!(await ensurePermission())) return 'no_permission';
  const now = new Date(), wd = now.getDay(), nowMin = now.getHours() * 60 + now.getMinutes();
  // minutes until each lecture's next time this week (or next week if it already passed)
  const ahead = (m: Meeting) => {
    const [h, mm] = m.starts_at.split(':').map(Number);
    const d = ((m.weekday - wd + 7) % 7) * 1440 + h * 60 + mm - nowMin;
    return d < 0 ? d + 7 * 1440 : d;
  };
  const sorted = [...meetings].sort((a, b) => ahead(a) - ahead(b));
  const m = sorted.find((x) => x.building_id && x.kind !== 'online') ?? sorted[0];
  if (!m) return 'no_lectures';
  await Notifications.scheduleNotificationAsync({
    identifier: `test-${Date.now()}`,
    content: lectureContent(m, minutes),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 5, channelId: 'lectures' },
  });
  return 'sent';
}

const roomUrl = (m: Meeting) => { const r = roomRoute(m); return `${r.pathname}?${new URLSearchParams(r.params as Record<string, string>).toString()}`; };

async function doSchedule(meetings: Meeting[], off: Record<string, boolean>, userId?: string, override?: Override) {
  if (Platform.OS === 'web') return; // the browser has no scheduled local notifications (web push covers messages)
  if (!userId) return;
  // the settings first: without internet this fails and the reminders already on the phone stay as they are (they
  // ring offline); only with fresh settings are the old ones replaced (also when the schedule became empty)
  const [{ data: prefs, error: pe }, { data: per, error: re }] = await Promise.all([
    supabase.from('notification_prefs').select('lectures, lecture_minutes, nightly_summary').eq('user_id', userId).maybeSingle(),
    supabase.from('reminders').select('meeting_id, minutes').eq('user_id', userId).not('meeting_id', 'is', null).not('minutes', 'is', null),
  ]);
  if (pe) throw pe;
  if (re) throw re;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.identifier.startsWith('lec-') || n.identifier.startsWith('night-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!meetings.length) return;
  if (!(await ensurePermission())) return;
  const lectures = override?.lectures ?? prefs?.lectures ?? true;
  const base = override?.lecture_minutes ?? prefs?.lecture_minutes ?? 10;
  const perMin: Record<string, number | null> = { ...Object.fromEntries((per ?? []).map((r) => [r.meeting_id as string, r.minutes as number])), ...(override?.perMin ?? {}) };

  // tomorrow's summary at 9 PM: one weekly reminder per evening that lists the next day's lectures
  if (override?.nightly_summary ?? prefs?.nightly_summary ?? true) {
    for (let d = 0; d < 7; d++) {
      const next = meetings.filter((m) => m.weekday === (d + 1) % 7 && !off[m.id]).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
      if (!next.length) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `night-${d}`,
        content: { title: t('بكرة عندك {0}', [next.length === 1 ? t('محاضرة وحدة') : t('{0} محاضرات', [next.length])]), body: next.map((m) => `${clock(m.starts_at)} ${m.course_name}`).join('\n'), data: { kind: 'summary' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: d + 1, hour: 21, minute: 0, channelId: 'lectures' },
      });
    }
  }
  if (!lectures) return;

  for (const m of meetings) {
    if (off[m.id]) continue;
    const minutes = perMin[m.id] ?? base;
    const [h, mm] = m.starts_at.split(':').map(Number);
    let total = h * 60 + mm - minutes;
    let weekday = m.weekday;
    if (total < 0) { total += 1440; weekday = (weekday + 6) % 7; }
    await Notifications.scheduleNotificationAsync({
      identifier: `lec-${m.id}`,
      content: lectureContent(m, minutes),
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: weekday + 1, // expo: 1 = Sunday
        hour: Math.floor(total / 60),
        minute: total % 60,
        channelId: 'lectures',
      },
    });
  }
}
