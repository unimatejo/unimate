import { LOCALE, t } from './i18n';
export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t('الآن');
  const m = Math.floor(s / 60);
  // Arabic counting: 3–10 take the plural (دقائق/ساعات), 11+ take the singular (دقيقة/ساعة)
  if (m < 60) return m === 1 ? t('قبل دقيقة') : m === 2 ? t('قبل دقيقتين') : m <= 10 ? t('قبل {0} دقائق', [m]) : t('قبل {0} دقيقة', [m]);
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? t('قبل ساعة') : h === 2 ? t('قبل ساعتين') : h <= 10 ? t('قبل {0} ساعات', [h]) : t('قبل {0} ساعة', [h]);
  const d = Math.floor(h / 24);
  if (d === 1) return t('أمس');
  if (d === 2) return t('قبل يومين');
  if (d < 7) return t('قبل {0} أيام', [d]);
  return new Date(iso).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

/** "13:30:00" -> "1:30 م" (or "1:30 PM" in English). Pass ampm=false for the bare time. */
export function clock(time: string, ampm = true): string {
  const [h, m] = time.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  const base = `${hh}:${String(m).padStart(2, '0')}`;
  return ampm ? `${base} ${h < 12 ? t('ص') : t('م')}` : base;
}

/** Arabic-insensitive search key: unify alef/yaa/taa marbuta forms, drop diacritics and tatweel, Arabic digits → Latin. */
export function normalize(s: string | null | undefined): string {
  return (s ?? '').toLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/\s+/g, ' ').trim();
}


/** Only open real web links from user content (never `javascript:` or other schemes). */
export const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\/[^\s]+$/i.test(u.trim());

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
  return t('مسا الخير');
}

/** Accepts "@name", "name", or any instagram.com / snapchat.com link and returns just the username. */
export function handleFrom(input: string, site: 'instagram' | 'snapchat') {
  let s = input.trim();
  const re = site === 'instagram' ? /(?:https?:\/\/)?(?:www\.)?(?:instagram\.com|instagr\.am)\/([^/?#\s]+)/i : /(?:https?:\/\/)?(?:www\.)?snapchat\.com\/(?:add\/)?([^/?#\s]+)/i;
  const m = s.match(re);
  if (m) s = m[1];
  return s.replace(/^@+/, '').trim();
}
