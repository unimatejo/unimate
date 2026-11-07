import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { ensurePermission } from './notify';
import { LOCALE, t } from './i18n';

type ExamLike = { id: string; kind: string; title: string; starts_at: string; course_name?: string | null; location?: string | null };

const REMIND = new Set(['exam_first', 'exam_second', 'exam_mid', 'exam_final', 'quiz', 'assignment', 'project']);

let running: Promise<void> = Promise.resolve();

/**
 * Phone-only local reminders for exams and deadlines: one the day before and one an hour before.
 * Replaces any earlier "exam-" reminders, so calling it again after a change is safe.
 */
export function scheduleExamReminders(events: ExamLike[]) {
  running = running.catch(() => {}).then(() => doSchedule(events));
  return running;
}

async function doSchedule(events: ExamLike[]) {
  if (Platform.OS === 'web') return;
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(existing.filter((n) => n.identifier.startsWith('exam-')).map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  const now = Date.now();
  const upcoming = events.filter((e) => REMIND.has(e.kind) && new Date(e.starts_at).getTime() > now).slice(0, 30);
  if (!upcoming.length) return;
  if (!(await ensurePermission())) return;
  for (const e of upcoming) {
    const at = new Date(e.starts_at).getTime();
    const name = e.course_name || e.title;
    const when = new Date(at).toLocaleString(LOCALE, { weekday: 'long', hour: 'numeric', minute: '2-digit' });
    const slots: [string, number, string, string][] = [
      ['d', at - 24 * 3600_000, t('غداً: {0}', [name]), t('{0}{1}. بالتوفيق!', [when, e.location ? ` · ${e.location}` : ''])],
      ['h', at - 3600_000, t('بعد ساعة: {0}', [name]), t('استعد{0}', [e.location ? ` · ${e.location}` : ''])],
    ];
    for (const [k, time, title, body] of slots) {
      if (time <= now + 60_000) continue;
      await Notifications.scheduleNotificationAsync({
        identifier: `exam-${k}-${e.id}`,
        content: { title, body, data: { kind: 'exam', url: '/exams' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(time), channelId: 'lectures' },
      });
    }
  }
}
