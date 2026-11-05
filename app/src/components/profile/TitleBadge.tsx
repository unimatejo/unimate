import { BookOpen, BriefcaseBusiness, Crown, GraduationCap, Landmark, Users } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** A verified academic title (set by an admin). Students have none. */
type AcademicTitle =
  | 'prof' | 'assoc_prof' | 'asst_prof' | 'doctor' | 'lecturer' | 'teacher_assistant'
  | 'dean' | 'vice_dean' | 'head' | 'president' | 'vice_president' | 'staff';

export const TITLE_ORDER: AcademicTitle[] = ['president', 'vice_president', 'dean', 'vice_dean', 'head', 'prof', 'assoc_prof', 'asst_prof', 'doctor', 'lecturer', 'teacher_assistant', 'staff'];

export function titleLabel(k?: string | null): string {
  switch (k) {
    case 'prof': return t('أستاذ دكتور');
    case 'assoc_prof': return t('أستاذ مشارك');
    case 'asst_prof': return t('أستاذ مساعد');
    case 'doctor': return t('دكتور');
    case 'lecturer': return t('محاضر');
    case 'teacher_assistant': return t('مساعد تدريس');
    case 'dean': return t('عميد');
    case 'vice_dean': return t('نائب عميد');
    case 'head': return t('رئيس قسم');
    case 'president': return t('رئيس الجامعة');
    case 'vice_president': return t('نائب رئيس الجامعة');
    case 'staff': return t('موظف');
    default: return '';
  }
}

// one colour family per level: leadership gold, heads violet, professors/doctors blue, teaching teal, staff slate
const LOOK: Record<AcademicTitle, { bg: string; fg: string; icon: typeof Crown }> = {
  president: { bg: '#F5B700', fg: '#3A2A00', icon: Crown },
  vice_president: { bg: '#F5B700', fg: '#3A2A00', icon: Crown },
  dean: { bg: '#F5B700', fg: '#3A2A00', icon: Landmark },
  vice_dean: { bg: '#F5B700', fg: '#3A2A00', icon: Landmark },
  head: { bg: '#8E66FF', fg: '#FFFFFF', icon: Users },
  prof: { bg: '#3D6BFF', fg: '#FFFFFF', icon: GraduationCap },
  assoc_prof: { bg: '#3D6BFF', fg: '#FFFFFF', icon: GraduationCap },
  asst_prof: { bg: '#3D6BFF', fg: '#FFFFFF', icon: GraduationCap },
  doctor: { bg: '#3D6BFF', fg: '#FFFFFF', icon: GraduationCap },
  lecturer: { bg: '#0D9488', fg: '#FFFFFF', icon: BookOpen },
  teacher_assistant: { bg: '#0D9488', fg: '#FFFFFF', icon: BookOpen },
  staff: { bg: '#56627F', fg: '#FFFFFF', icon: BriefcaseBusiness },
};

const DOCTOR_LEVEL = new Set(['assoc_prof', 'asst_prof', 'doctor', 'dean', 'vice_dean', 'head', 'president', 'vice_president']);

/** "د. محمد" for doctor-level titles, "أ.د. محمد" for full professors; anyone else stays as is. */
export function titledName(name: string | null | undefined, title?: string | null, verified?: boolean | null) {
  const n = (name ?? '').trim();
  if (!verified || !title || !n) return n;
  if (title === 'prof') return `${t('أ.د.')} ${n}`;
  if (DOCTOR_LEVEL.has(title)) return `${t('د.')} ${n}`;
  return n;
}

/**
 * The badge next to a name. `size="sm"` is the compact chip for lists (icon + short label),
 * `size="md"` is the profile pill. Shows nothing unless an admin verified the title.
 */
export function TitleBadge({ title, verified, size = 'sm', label }: { title?: string | null; verified?: boolean | null; size?: 'sm' | 'md'; label?: string }) {
  if (!verified || !title || !(title in LOOK)) return null;
  const l = LOOK[title as AcademicTitle];
  const Icon = l.icon;
  const md = size === 'md';
  return (
    <View accessibilityRole="text" accessibilityLabel={titleLabel(title)}
      style={{ flexDirection: 'row', alignItems: 'center', gap: md ? 6 : 3, backgroundColor: l.bg, borderRadius: 999, paddingHorizontal: md ? 11 : 6, height: md ? 28 : 18, alignSelf: md ? 'flex-start' : 'center', flexShrink: 0 }}>
      <Icon size={md ? 15 : 11} color={l.fg} strokeWidth={2.4} />
      <Text numberOfLines={1} style={{ fontFamily: F.bodyBold, fontSize: md ? 13 : 10, color: l.fg }}>{label ?? titleLabel(title)}</Text>
    </View>
  );
}
