export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? 'قبل دقيقة' : m === 2 ? 'قبل دقيقتين' : `قبل ${m} دقيقة`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'قبل ساعة' : h === 2 ? 'قبل ساعتين' : `قبل ${h} ساعات`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'أمس';
  if (d < 7) return `قبل ${d} أيام`;
  return new Date(iso).toLocaleDateString('ar-JO', { day: 'numeric', month: 'short' });
}

export function clock(t: string): string {
  // "13:30:00" -> "1:30"
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')}`;
}

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEKDAYS_SHORT = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

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
  if (h < 12) return 'صباح الخير';
  if (h < 18) return 'مسا الخير';
  return 'مسا النور';
}
