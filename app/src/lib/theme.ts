import { getPref } from './prefs';
import { t } from './i18n';

// Design tokens. Three palettes (navy is the default; black and light from Settings › Appearance).
// The active one is copied into `C` at startup (the app reloads when it changes).
// The accent is the logo's coral dot; text on it is navy. Selected tabs / filters use `inverse`.
const MIDNIGHT = {
  bg: '#0E1430',
  card: '#17204A',      // surface
  soft: '#1F2A5C',      // surface 2 (chips, bubbles, inner boxes)
  ink: '#FFFFFF',
  ink2: '#D9DEEE',
  muted: '#A5AECB',
  faint: '#7A84A8',
  line: '#2C3772',
  field: '#17204A',
  inverse: '#FFFFFF',   // selected tab / filter
  onInverse: '#0E1430',
  overlay: 'rgba(5,8,24,0.62)',
  glass: 'rgba(23,32,74,0.82)',
  primary: '#FF7A59',   // accent
  onPrimary: '#0E1430',
  primaryDark: '#FFA88F',
  primarySoft: '#3A2A44',
  blue: '#5B7CFF',
  green: '#34D399',
  greenSoft: '#0F3333',
  greenInk: '#6EE7B7',
  pink: '#FF5470',
  pinkSoft: '#3D1B3A',
  pinkInk: '#FF9BB4',
  orange: '#FF9A1F',
  orangeSoft: '#3A2C2A',
  orangeInk: '#FFC27A',
  violet: '#8E66FF',
  violetSoft: '#2A2463',
  violetInk: '#C9B8FF',
  sky: '#22B3F2',
  skySoft: '#123A5C',
  skyInk: '#8AD8FF',
  danger: '#FF5A72',
  red: '#FF5A72',
  redSoft: '#3D1B34',
  white: '#FFFFFF',
};

const BLACK: typeof MIDNIGHT = {
  ...MIDNIGHT,
  bg: '#05070F',
  card: '#0D1124',
  soft: '#151A33',
  ink: '#F5F6FA',
  ink2: '#D2D6E0',
  muted: '#9CA2B4',
  faint: '#6F7588',
  line: '#232A4A',
  field: '#0D1124',
  inverse: '#F5F6FA',
  onInverse: '#05070F',
  overlay: 'rgba(0,0,0,0.66)',
  glass: 'rgba(13,17,36,0.82)',
  primarySoft: '#2E1C22',
  greenSoft: '#0B2620', pinkSoft: '#33141F', orangeSoft: '#2E2015', violetSoft: '#1E1A40', skySoft: '#0B2533', redSoft: '#33121D',
};

const LIGHT: typeof MIDNIGHT = {
  bg: '#F4F5F8',
  card: '#FFFFFF',
  soft: '#E9ECF5',
  ink: '#0E1430',
  ink2: '#3A4563',
  muted: '#5D6886',
  faint: '#8A93AE',
  line: '#DDE1EC',
  field: '#FFFFFF',
  inverse: '#17204A',
  onInverse: '#FFFFFF',
  overlay: 'rgba(14,20,48,0.45)',
  glass: 'rgba(255,255,255,0.8)',
  primary: '#FF6B4A',
  onPrimary: '#0E1430',
  primaryDark: '#C2412A',
  primarySoft: '#FFE9E3',
  blue: '#2E5BFF',
  green: '#12B886',
  greenSoft: '#E3F8F1',
  greenInk: '#0A6B4E',
  pink: '#FF5470',
  pinkSoft: '#FFE9EE',
  pinkInk: '#C0264A',
  orange: '#FF8A00',
  orangeSoft: '#FFF3E0',
  orangeInk: '#7A4A00',
  violet: '#7C4DFF',
  violetSoft: '#F1E8FF',
  violetInk: '#5B21B6',
  sky: '#0EA5E9',
  skySoft: '#E3F2FC',
  skyInk: '#075985',
  danger: '#E11D48',
  red: '#E11D48',
  redSoft: '#FFE4EA',
  white: '#FFFFFF',
};

export type ThemePref = 'midnight' | 'black' | 'light';
export const themePref = (): ThemePref => {
  const v = getPref('theme');
  if (v === 'light' || v === 'black' || v === 'midnight') return v;
  return v === 'dark' ? 'black' : 'midnight'; // older choices: dark → black, system → the new default
};
export const scheme: 'light' | 'dark' = themePref() === 'light' ? 'light' : 'dark';
export const isDark = scheme === 'dark';
export const C = { ...({ midnight: MIDNIGHT, black: BLACK, light: LIGHT }[themePref()]) };
/** The three looks, for the picker in Settings. */
export const THEMES = { midnight: MIDNIGHT, black: BLACK, light: LIGHT };

/** Soft spring for everything that moves (≈300ms, no bounce-back wobble). */
export const SPRING = { damping: 22, stiffness: 260, mass: 0.9 };

export const F = {
  display: 'IBMPlexSansArabic_700Bold',
  title: 'IBMPlexSansArabic_700Bold',
  titleMd: 'IBMPlexSansArabic_600SemiBold',
  body: 'IBMPlexSansArabic_400Regular',
  bodyMd: 'IBMPlexSansArabic_500Medium',
  bodyBold: 'IBMPlexSansArabic_600SemiBold',
};

export const R = { sm: 16, md: 18, lg: 22, xl: 28, pill: 999 };

/** Everything floats a little: a soft lift plus a hairline edge that catches the light. */
export const shadow = {
  shadowColor: isDark ? '#000000' : '#1B2250',
  shadowOpacity: isDark ? 0.35 : 0.08,
  shadowRadius: 22,
  shadowOffset: { width: 0, height: 10 },
  elevation: 5,
  borderWidth: 1,
  borderColor: isDark ? C.line : 'rgba(255,255,255,0.9)',
};

/** Frosted glass for buttons that sit on top of content. */
export const glassStyle = {
  backgroundColor: C.glass,
  borderWidth: 1,
  borderColor: isDark ? C.line : 'rgba(255,255,255,0.95)',
  shadowColor: isDark ? '#000000' : '#1B2250',
  shadowOpacity: isDark ? 0.5 : 0.14,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 6,
  ...({ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' } as object), // web only; ignored on phones
};

// avatar palette: deterministic per user
const AV = isDark ? [
  ['#2E5BFF', '#FFFFFF'], ['#6A3BE0', '#FFFFFF'], ['#0D9488', '#FFFFFF'], ['#C0264A', '#FFFFFF'],
  ['#B45309', '#FFFFFF'], ['#3A4563', '#FFFFFF'], ['#0369A1', '#FFFFFF'],
] : [
  ['#DCE3FF', '#2E5BFF'], ['#FFE3EA', '#C0264A'], ['#E3F8F1', '#0A6B4E'], ['#FFE6D5', '#C2410C'],
  ['#F1E8FF', '#6A3BE0'], ['#E3F2FC', '#0369A1'], ['#FFF3E0', '#B45309'],
];
export function avatarColors(id?: string | null) {
  let h = 0;
  for (const ch of id ?? 'x') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}

export const CATEGORY: Record<string, { label: string; color: string; soft: string; ink: string }> = {
  square: { label: t('الساحة'), color: C.primary, soft: C.primarySoft, ink: C.primaryDark },
  summaries: { label: t('ملخصات'), color: C.green, soft: C.greenSoft, ink: C.greenInk },
  assignments: { label: t('واجبات'), color: C.violet, soft: C.violetSoft, ink: C.violetInk },
  tutoring: { label: t('دروس خصوصية'), color: '#4F46E5', soft: isDark ? '#1D1B45' : '#ECEBFF', ink: isDark ? '#B4B0FF' : '#3730A3' },
  lost_found: { label: t('المفقودات'), color: '#0D9488', soft: isDark ? '#0B2724' : '#E3F6F4', ink: isDark ? '#5EE6D6' : '#0A6B62' },
  market: { label: t('سوق الطلاب'), color: C.orange, soft: C.orangeSoft, ink: C.orangeInk },
  exchange: { label: t('تبادل وتبرعات'), color: '#DB2777', soft: isDark ? '#38122A' : '#FDEBF4', ink: isDark ? '#F9A8D4' : '#9D174D' },
  transport_housing: { label: t('مواصلات وسكن'), color: C.sky, soft: C.skySoft, ink: C.skyInk },
  events: { label: t('فعاليات'), color: C.pink, soft: C.pinkSoft, ink: C.pinkInk },
  opportunities: { label: t('فرص وتدريب'), color: '#64748B', soft: isDark ? '#1E222B' : '#EEF0F6', ink: isDark ? '#CBD5E1' : '#334155' },
};
