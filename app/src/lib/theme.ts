import { Appearance } from 'react-native';

import { getPref } from './prefs';
import { t } from './i18n';

// Design tokens. Two palettes; the active one is copied into `C` at startup (and the app reloads when it changes).
const LIGHT = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  soft: '#F1F3F8',      // secondary surface (chips, inner boxes)
  ink: '#0E1430',
  ink2: '#3A4563',
  muted: '#5D6886',
  faint: '#8A93AE',
  line: '#ECEFF6',
  field: '#F1F3F9',
  inverse: '#0E1430',   // high-contrast filled surface (dark buttons, selected day)
  onInverse: '#FFFFFF',
  overlay: 'rgba(14,20,48,0.45)',
  glass: 'rgba(255,255,255,0.72)',
  primary: '#2E5BFF',
  primaryDark: '#1E3FD9',
  primarySoft: '#EEF1FF',
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

const DARK: typeof LIGHT = {
  bg: '#000000',
  card: '#121318',
  soft: '#1B1D24',
  ink: '#F4F5F8',
  ink2: '#D2D6E0',
  muted: '#9CA2B4',
  faint: '#6F7588',
  line: '#24262E',
  field: '#1B1D24',
  inverse: '#F4F5F8',
  onInverse: '#0E1430',
  overlay: 'rgba(0,0,0,0.6)',
  glass: 'rgba(18,19,24,0.78)',
  primary: '#4D74FF',
  primaryDark: '#8FA8FF',
  primarySoft: '#17204A',
  green: '#1FCB95',
  greenSoft: '#0D2A21',
  greenInk: '#5EE3A1',
  pink: '#FF5E7A',
  pinkSoft: '#3A1620',
  pinkInk: '#FF9BB4',
  orange: '#FF9A1F',
  orangeSoft: '#33230C',
  orangeInk: '#FFC27A',
  violet: '#8E66FF',
  violetSoft: '#241A45',
  violetInk: '#C9B8FF',
  sky: '#22B3F2',
  skySoft: '#0B2533',
  skyInk: '#8AD8FF',
  danger: '#FF4D6D',
  red: '#FF4D6D',
  redSoft: '#3A1220',
  white: '#FFFFFF',
};

export type ThemePref = 'system' | 'light' | 'dark';
export const themePref = (): ThemePref => (getPref('theme') as ThemePref) || 'system';
export const scheme: 'light' | 'dark' = (() => {
  const p = themePref();
  return p === 'system' ? (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light') : p;
})();
export const isDark = scheme === 'dark';
export const C = { ...(isDark ? DARK : LIGHT) };

export const F = {
  display: 'Alexandria_800ExtraBold',
  title: 'Alexandria_700Bold',
  titleMd: 'Alexandria_500Medium',
  body: 'Rubik_400Regular',
  bodyMd: 'Rubik_500Medium',
  bodyBold: 'Rubik_600SemiBold',
};

export const R = { sm: 12, md: 16, lg: 22, xl: 28, pill: 999 };

export const shadow = {
  shadowColor: isDark ? '#000000' : '#0E1430',
  shadowOpacity: isDark ? 0.5 : 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

// avatar palette: deterministic per user
const AV = isDark ? [
  ['#1A2350', '#8FA8FF'], ['#3A1620', '#FF9BB4'], ['#0D2A21', '#5EE3A1'], ['#33200F', '#FFB27A'],
  ['#241A45', '#C9B8FF'], ['#0B2533', '#8AD8FF'], ['#33230C', '#FFC27A'],
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
