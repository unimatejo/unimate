import { LOCALE, t } from './i18n';

export type Direction = 'to_campus' | 'from_campus';
/** offer: I have seats · need: I'm looking for a ride and someone with a car answers */
export type RideKind = 'offer' | 'need';
export type MyStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | null;

/** One row of rides_feed(): the ride, the driver's public card and where I stand with it. */
export type Ride = {
  id: string; driver_id: string; driver_name: string; driver_username: string | null; driver_avatar: string | null;
  driver_verified: boolean; driver_title: string | null; driver_title_verified: boolean;
  kind: RideKind; direction: Direction; area: string; stops: string[]; meet_point: string | null; campus_spot: string | null; depart_at: string;
  seats_total: number; seats_taken: number; price_jod: number; notes: string | null;
  my_status: MyStatus; pending_count: number;
};

/** One row of ride_requests_for(): what the driver sees about each rider. */
export type RideRequest = {
  id: string; rider_id: string; name: string; username: string | null; avatar_url: string | null;
  seats: number; note: string | null; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; created_at: string;
};

// same limits as the database (0072_rides.sql)
export const LIMITS = { areaMin: 2, areaMax: 40, areasMax: 4, spotMax: 40, meetMax: 80, notesMax: 200, noteMax: 140, seatsMax: 6, askMax: 3, priceMax: 10, priceStep: 0.25, daysAhead: 14 };

/** Areas Hashemite University students commute from, grouped by city. Area names stay Arabic (they are saved on the ride and shown to everyone). */
export const AREAS: { city: string; areas: string[] }[] = [
  { city: t('عمّان'), areas: ['طبربور', 'ماركا', 'صويلح', 'الجبيهة', 'شفا بدران', 'أبو نصير', 'تلاع العلي', 'خلدا', 'المقابلين', 'الهاشمي الشمالي', 'وسط البلد'] },
  { city: t('الزرقاء'), areas: ['الزرقاء الجديدة', 'الرصيفة', 'الزرقاء القديمة', 'الهاشمية', 'الضليل', 'البتراوي'] },
  { city: t('محافظات ثانية'), areas: ['المفرق', 'إربد', 'جرش', 'السلط', 'مادبا'] },
];

/** Where on campus a ride starts or ends. Names stay Arabic for the same reason as the areas. */
export const CAMPUS_SPOTS = ['البوابة الرئيسية', 'البوابة الشمالية', 'البوابة الجنوبية', 'سكنات الطلاب', 'مواقف السيارات'];

/** "طبربور ← ماركا ← الجامعة" style route, the way the car actually goes. */
export function routeLabel(r: Pick<Ride, 'area' | 'stops' | 'direction'>) {
  const places = [r.area, ...(r.stops ?? [])];
  return (r.direction === 'to_campus' ? places : [...places].reverse()).join(' ← ');
}
export const allAreas = (r: Pick<Ride, 'area' | 'stops'>) => [r.area, ...(r.stops ?? [])];

/** "0791234567", "+962 79…", "00962…" → "0791234567"; null when it isn't a Jordanian mobile. Same rule as the server. */
export function joMobile(s: string): string | null {
  const d = s.replace(/\D/g, '');
  return /^(00962|962)?0?7[789]\d{7}$/.test(d) ? `0${d.slice(-9)}` : null;
}

export const EMOJI = {
  car: require('../../assets/emoji3d/automobile_3d.png'),
  oncoming: require('../../assets/emoji3d/oncoming_automobile_3d.png'),
  pin: require('../../assets/emoji3d/round_pushpin_3d.png'),
  seat: require('../../assets/emoji3d/seat_3d.png'),
  school: require('../../assets/emoji3d/school_3d.png'),
  house: require('../../assets/emoji3d/house_3d.png'),
};

export const seatsLeft = (r: Pick<Ride, 'seats_total' | 'seats_taken'>) => Math.max(0, r.seats_total - r.seats_taken);

export function priceLabel(p: number) {
  const v = Number(p) || 0;
  if (v <= 0) return t('ببلاش');
  return t('{0} دينار', [String(Number(v.toFixed(2)))]);
}

export const timeLabel = (iso: string) => new Date(iso).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });

const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
/** "اليوم" / "بكرا" / "الأحد ٩ تشرين الثاني" */
export function dayLabel(iso: string, now = new Date()) {
  const diff = Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(now).getTime()) / 86400000);
  if (diff === 0) return t('اليوم');
  if (diff === 1) return t('بكرا');
  return new Date(iso).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });
}
export const dayKey = (iso: string) => startOfDay(new Date(iso)).toISOString();

export const directionLabel = (d: Direction) => (d === 'to_campus' ? t('للجامعة') : t('من الجامعة'));

/** Server errors (0072) in plain Arabic. */
export function rideError(e: { message?: string } | null | undefined): string {
  const m = e?.message ?? '';
  if (/bad_time/.test(m)) return t('اختار وقت من بعد 5 دقايق لحد أسبوعين.');
  if (/rate_limited/.test(m)) return t('استنى شوي، عملت كثير بوقت قصير.');
  if (/too_many_open/.test(m)) return t('عندك 10 توصيلات مفتوحة، الغي وحدة قبل ما تضيف.');
  if (/not_available/.test(m)) return t('هالتوصيلة ما عادت متاحة.');
  if (/own_ride/.test(m)) return t('هاي توصيلتك إنت.');
  if (/no_seats/.test(m)) return t('ما في مقاعد كفاية.');
  if (/already_requested/.test(m)) return t('طلبت مقعد بهالتوصيلة من قبل.');
  if (/bad_phone/.test(m)) return t('رقم الموبايل مش صحيح، اكتبه مثل 0791234567.');
  if (/too_many_stops/.test(m)) return t('بتقدر تختار لحد 4 مناطق.');
  if (/not_pending/.test(m)) return t('هالطلب انرد عليه من قبل.');
  if (/not allowed/.test(m)) return t('ما عندك صلاحية لهالإشي.');
  if (/fetch|network|timeout/i.test(m)) return t('تأكد من الإنترنت وجرّب كمان مرة.');
  return t('صار خطأ، جرّب كمان مرة.');
}

export const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
