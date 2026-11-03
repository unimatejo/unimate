import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Meeting } from './schedule';
import { supabase } from './supabase';
import { clock } from './util';
import { t } from './i18n';

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

export async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
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
export async function scheduleLectureReminders(meetings: Meeting[], off: Record<string, boolean>) {
  if (!(await ensurePermission())) return;
  const { data: prefs } = await supabase.from('notification_prefs').select('lectures, lecture_minutes').maybeSingle();
  const base = prefs?.lecture_minutes ?? 10;
  const { data: per } = await supabase.from('reminders').select('meeting_id, minutes').not('meeting_id', 'is', null).not('minutes', 'is', null);
  const perMin = Object.fromEntries((per ?? []).map((r) => [r.meeting_id as string, r.minutes as number]));
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.identifier.startsWith('lec-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  if (prefs && prefs.lectures === false) return;

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
