import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Meeting } from './schedule';
import { supabase } from './supabase';
import { clock } from './util';
import { t } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Reminders need notification permission. It is asked once, in onboarding (lib/notifPermission); here it is only
 * checked. `force` is a student turning a reminder on in Settings: then the system may ask, if it still can.
 */
export async function ensurePermission(force = false): Promise<boolean> {
  if (Platform.OS === 'web') return false; // local reminders are phone-only; the web app uses web push
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!force || !cur.canAskAgain) return false;
  const req = await Notifications.requestPermissionsAsync();
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('lectures', { name: t('المحاضرات'), importance: Notifications.AndroidImportance.HIGH });
  }
  return req.granted;
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

async function doSchedule(meetings: Meeting[], off: Record<string, boolean>, userId?: string, override?: Override) {
  if (Platform.OS === 'web') return; // the browser has no scheduled local notifications (web push covers messages)
  // clear old lecture reminders first (also when the schedule became empty)
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.identifier.startsWith('lec-') || n.identifier.startsWith('night-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (!meetings.length || !userId) return;
  if (!(await ensurePermission())) return;
  const { data: prefs, error: pe } = await supabase.from('notification_prefs').select('lectures, lecture_minutes, nightly_summary').eq('user_id', userId).maybeSingle();
  if (pe) throw pe;
  const lectures = override?.lectures ?? prefs?.lectures ?? true;
  const base = override?.lecture_minutes ?? prefs?.lecture_minutes ?? 10;
  const { data: per, error: re } = await supabase.from('reminders').select('meeting_id, minutes').eq('user_id', userId).not('meeting_id', 'is', null).not('minutes', 'is', null);
  if (re) throw re;
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
    const where = m.kind === 'online' ? t('أونلاين') : [m.building_name, m.room_code ? t('قاعة {0}', [m.room_code]) : null].filter(Boolean).join(' · ');
    await Notifications.scheduleNotificationAsync({
      identifier: `lec-${m.id}`,
      content: {
        title: t('بعد {0} دقايق: {1}', [minutes, m.course_name]),
        body: t('{0} · {1}', [where || t('شوف القاعة بالجدول'), clock(m.starts_at)]),
        data: { kind: 'lecture', meeting: m.id, building: m.building_id },
      },
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
