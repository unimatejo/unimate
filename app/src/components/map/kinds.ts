import {
  Banknote, BookOpen, Building2, Bus, Car, Coffee, DoorOpen, GraduationCap, Landmark, MapPin, Moon, Pill, Printer, ShoppingBag, Stethoscope, Store, Trees, Trophy,
  UtensilsCrossed, type LucideIcon,
} from 'lucide-react-native';

import { GRAD } from '@/components/ui/Glyph';
import { t } from '@/lib/i18n';
import { normalize } from '@/lib/util';

/** A place on the campus map: our buildings and approved places (with the OSM ones), or a spot shared in a chat. */
/** `alt`: nicknames and other names (search only); `sub` of a building is its code («C11»). */
export type Pin = { id: string; kind: string; name: string; sub?: string | null; lat: number; lng: number; advertiser_id?: string | null; alt?: string[] };

type G = readonly [string, string];
const KIND: Record<string, { icon: LucideIcon; g: G; label: string; words?: string[] }> = {
  building: { icon: Building2, g: GRAD.blue, label: t('مبنى'), words: ['مبنى', 'مباني', 'كلية', 'عمادة'] },
  college: { icon: GraduationCap, g: GRAD.indigo, label: t('كلية') },
  cafeteria: { icon: Coffee, g: GRAD.orange, label: t('كافتيريا'), words: ['كافتيريا', 'كافيتيريا', 'قهوة', 'كافيه', 'كوفي'] },
  restaurant: { icon: UtensilsCrossed, g: GRAD.orange, label: t('مطعم'), words: ['مطعم', 'مطاعم', 'اكل', 'أكل'] },
  kiosk: { icon: Store, g: GRAD.yellow, label: t('كشك'), words: ['كشك', 'اكشاك', 'أكشاك'] },
  shop: { icon: ShoppingBag, g: GRAD.yellow, label: t('محل'), words: ['محل', 'محلات', 'سوبرماركت', 'دكان'] },
  print: { icon: Printer, g: GRAD.yellow, label: t('طباعة وقرطاسية'), words: ['طباعة', 'تصوير', 'قرطاسية', 'مكتبة تصوير'] },
  parking: { icon: Car, g: GRAD.slate, label: t('موقف سيارات'), words: ['موقف', 'مواقف', 'باركينج', 'كراج'] },
  bus: { icon: Bus, g: GRAD.teal, label: t('موقف حافلات'), words: ['باص', 'حافلات', 'مجمع', 'سرفيس', 'كوستر'] },
  gate: { icon: DoorOpen, g: GRAD.indigo, label: t('بوابة'), words: ['بوابة', 'باب', 'مدخل'] },
  mosque: { icon: Moon, g: GRAD.green, label: t('مسجد'), words: ['مسجد', 'مصلى', 'جامع'] },
  library: { icon: BookOpen, g: GRAD.violet, label: t('مكتبة'), words: ['مكتبة'] },
  bank: { icon: Landmark, g: GRAD.green, label: t('بنك'), words: ['بنك'] },
  atm: { icon: Banknote, g: GRAD.green, label: t('صراف آلي'), words: ['صراف', 'atm'] },
  clinic: { icon: Stethoscope, g: GRAD.red, label: t('عيادة'), words: ['عيادة', 'طبيب', 'اسعاف', 'إسعاف'] },
  pharmacy: { icon: Pill, g: GRAD.red, label: t('صيدلية'), words: ['صيدلية'] },
  sports: { icon: Trophy, g: GRAD.pink, label: t('رياضة'), words: ['ملعب', 'ملاعب', 'رياضة', 'جيم', 'مسبح'] },
  garden: { icon: Trees, g: GRAD.green, label: t('حديقة'), words: ['حديقة', 'حدائق', 'ساحة'] },
};
export const kindOf = (k: string) => KIND[k] ?? { icon: MapPin, g: GRAD.green, label: t('خدمة') };

const GROUPS: Record<string, string[]> = {
  building: ['building'], food: ['cafeteria', 'restaurant'], shops: ['kiosk', 'shop', 'print'], parking: ['parking'], bus: ['bus'],
};
export const FILTERS = [
  { key: 'all', label: t('الكل') },
  { key: 'building', label: t('المباني') },
  { key: 'food', label: t('طعام وقهوة') },
  { key: 'shops', label: t('أكشاك ومتاجر') },
  { key: 'parking', label: t('مواقف') },
  { key: 'bus', label: t('حافلات') },
  { key: 'service', label: t('خدمات') },
] as const;
export type FilterKey = (typeof FILTERS)[number]['key'];
export const inGroup = (f: string, k: string) => f === 'all' || (f === 'service' ? !Object.values(GROUPS).flat().includes(k) : (GROUPS[f] ?? []).includes(k));
/** Small things that only show once you zoom in (or pick their filter), so the campus never looks cluttered. */
export const MINOR = ['parking', 'bus', 'atm', 'shop', 'service', 'gate', 'room', 'lab', 'other'];
/** What a virtual walk stops at: the places people actually look for. */
export const TOUR_KINDS = ['gate', 'building', 'library', 'cafeteria', 'restaurant', 'kiosk', 'mosque', 'sports', 'garden', 'clinic', 'bank'];
export const SUGGEST_KINDS = ['building', 'cafeteria', 'restaurant', 'kiosk', 'print', 'shop', 'parking', 'bus', 'gate', 'mosque', 'library', 'atm', 'clinic', 'sports', 'garden', 'service'];

// ---------- instant search over what's already on the map ----------
// Arabic spelling differences people type every day (أ/إ/آ/ا, ة/ه, ى/ي, tashkeel) don't matter
const norm = normalize;

/** Places whose name matches, or every place of a kind when the words name one («كشك», «باص», «صراف»). */
export function localSearch(pins: Pin[], q: string, near?: { lat: number; lng: number } | null): Pin[] {
  const n = norm(q);
  if (n.length < 2) return [];
  const kinds = Object.entries(KIND).filter(([, v]) => v.words?.some((w) => norm(w).startsWith(n) || n.startsWith(norm(w)))).map(([k]) => k);
  const named = (p: Pin) => norm(p.name).includes(n) || !!p.alt?.some((x) => norm(x).includes(n)) || (p.kind === 'building' && !!p.sub && norm(p.sub).startsWith(n));
  const hit = pins.filter((p) => named(p) || (kinds.includes(p.kind) && p.kind !== 'building'));
  const d = (p: Pin) => (near ? (p.lat - near.lat) ** 2 + (p.lng - near.lng) ** 2 : 0);
  return hit.sort((a, b) => Number(norm(b.name).startsWith(n)) - Number(norm(a.name).startsWith(n)) || d(a) - d(b)).slice(0, 12);
}
