// Design tokens from the approved UniMate canvas.
export const C = {
  bg: '#F5F6FA',
  card: '#FFFFFF',
  ink: '#0E1430',
  ink2: '#3A4563',
  muted: '#5D6886',
  faint: '#8A93AE',
  line: '#ECEFF6',
  field: '#F1F3F9',
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
  shadowColor: '#0E1430',
  shadowOpacity: 0.07,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
};

// avatar palette: deterministic per user
const AV = [
  ['#DCE3FF', '#2E5BFF'], ['#FFE3EA', '#C0264A'], ['#E3F8F1', '#0A6B4E'], ['#FFE6D5', '#C2410C'],
  ['#F1E8FF', '#6A3BE0'], ['#E3F2FC', '#0369A1'], ['#FFF3E0', '#B45309'],
];
export function avatarColors(id?: string | null) {
  let h = 0;
  for (const ch of id ?? 'x') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AV[h % AV.length];
}

export const CATEGORY: Record<string, { label: string; color: string; soft: string; ink: string }> = {
  square: { label: 'الساحة', color: C.primary, soft: C.primarySoft, ink: C.primaryDark },
  summaries: { label: 'ملخصات', color: C.green, soft: C.greenSoft, ink: C.greenInk },
  assignments: { label: 'واجبات', color: C.violet, soft: C.violetSoft, ink: C.violetInk },
  tutoring: { label: 'دروس خصوصية', color: '#4F46E5', soft: '#ECEBFF', ink: '#3730A3' },
  lost_found: { label: 'المفقودات', color: '#0D9488', soft: '#E3F6F4', ink: '#0A6B62' },
  market: { label: 'سوق الطلاب', color: C.orange, soft: C.orangeSoft, ink: C.orangeInk },
  exchange: { label: 'تبادل وتبرعات', color: '#DB2777', soft: '#FDEBF4', ink: '#9D174D' },
  transport_housing: { label: 'مواصلات وسكن', color: C.sky, soft: C.skySoft, ink: C.skyInk },
  events: { label: 'فعاليات', color: C.pink, soft: C.pinkSoft, ink: C.pinkInk },
  opportunities: { label: 'فرص وتدريب', color: '#475569', soft: '#EEF0F6', ink: '#334155' },
};
