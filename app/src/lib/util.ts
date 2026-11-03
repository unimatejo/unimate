import { LOCALE, t } from './i18n';
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('الآن');
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? t('قبل دقيقة') : m === 2 ? t('قبل دقيقتين') : t('قبل {0} دقيقة', [m]);
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? t('قبل ساعة') : h === 2 ? t('قبل ساعتين') : t('قبل {0} ساعات', [h]);
  const d = Math.floor(h / 24);
  if (d === 1) return t('أمس');
  if (d < 7) return t('قبل {0} أيام', [d]);
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

export function clock(t: string): string {
  // "13:30:00" -> "1:30"
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')}`;
}

export const WEEKDAYS = [t('الأحد'), t('الاثنين'), t('الثلاثاء'), t('الأربعاء'), t('الخميس'), t('الجمعة'), t('السبت')];
export const WEEKDAYS_SHORT = [t('أحد'), t('اثنين'), t('ثلاثاء'), t('أربعاء'), t('خميس'), t('جمعة'), t('سبت')];

export function minutesUntil(weekday: number, time: string, now = new Date()): number {
  const [h, m] = time.split(':').map(Number);
  const target = new Date(now);
  target.setHours(h, m, 0, 0);
  let diff = (weekday - now.getDay() + 7) % 7;
  if (diff === 0 && target.getTime() < now.getTime()) diff = 7;
  target.setDate(now.getDate() + diff);
  return Math.round((target.getTime() - now.getTime()) / 60000);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 12) return t('صباح الخير');
  if (h < 18) return t('مسا الخير');
  return t('مسا النور');
}

/** Accepts "@name", "name", or any instagram.com / snapchat.com link and returns just the username. */
export function handleFrom(input: string, site: 'instagram' | 'snapchat') {
  let s = input.trim();
  const re = site === 'instagram' ? /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#\s]+)/i : /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/(?:add\/)?([^/?#\s]+)/i;
  const m = s.match(re);
  if (m) s = m[1];
  return s.replace(/^@+/, '').trim();
}
