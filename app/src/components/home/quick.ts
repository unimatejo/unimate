import { BookOpen, GraduationCap, MapPin, PartyPopper, Repeat, SearchCheck, ShoppingBag, Sparkles, Trophy } from 'lucide-react-native';

import { GRAD } from '@/components/ui/Glyph';
import type { FeatureKey, QuickKey } from '@/lib/appContent';
import { t } from '@/lib/i18n';

/** The quick links on Home. The owner can reorder or hide them from the admin panel ("شكل التطبيق"). */
export const QUICK = [
  { key: 'map', label: t('وين قاعتي'), icon: MapPin, g: GRAD.green, to: '/map', feature: 'map' },
  { key: 'swap', label: t('تبديل شعب'), icon: Repeat, g: GRAD.blue, to: '/swap', feature: 'swap' },
  { key: 'summaries', label: t('ملخصات'), icon: BookOpen, g: GRAD.violet, to: '/section/summaries' },
  { key: 'market', label: t('السوق'), icon: ShoppingBag, g: GRAD.pink, to: '/section/market', feature: 'market' },
  { key: 'study', label: t('ندرس سوا'), icon: GraduationCap, g: GRAD.indigo, to: '/study', feature: 'study' },
  { key: 'ranks', label: t('الترتيب'), icon: Trophy, g: GRAD.red, to: '/leaderboard', feature: 'leaderboard' },
  { key: 'events', label: t('فعاليات'), icon: PartyPopper, g: GRAD.orange, to: '/section/events' },
  { key: 'lost_found', label: t('مفقودات'), icon: SearchCheck, g: GRAD.teal, to: '/section/lost_found' },
  { key: 'sections', label: t('كل الأقسام'), icon: Sparkles, g: GRAD.yellow, to: '/sections' },
] as const satisfies readonly { key: QuickKey; label: string; to: string; feature?: FeatureKey; icon: unknown; g: unknown }[];

/** The links Home shows until the owner picks his own (two rows of four); the rest can be switched on in «شكل التطبيق». */
export const DEFAULT_QUICK = QUICK.filter((q) => q.key !== 'lost_found');
