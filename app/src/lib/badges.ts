import type { ImageSourcePropType } from 'react-native';

import { t } from './i18n';

/** 3D emoji (Microsoft Fluent UI Emoji, MIT) used across badges and the leaderboard. */
export const EMOJI = {
  trophy: require('../../assets/emoji3d/trophy_3d.png'),
  gold: require('../../assets/emoji3d/1st_place_medal_3d.png'),
  silver: require('../../assets/emoji3d/2nd_place_medal_3d.png'),
  bronze: require('../../assets/emoji3d/3rd_place_medal_3d.png'),
  medal: require('../../assets/emoji3d/sports_medal_3d.png'),
  seedling: require('../../assets/emoji3d/seedling_3d.png'),
  books: require('../../assets/emoji3d/books_3d.png'),
  cap: require('../../assets/emoji3d/graduation_cap_3d.png'),
  star: require('../../assets/emoji3d/glowing_star_3d.png'),
  key: require('../../assets/emoji3d/key_3d.png'),
  car: require('../../assets/emoji3d/automobile_3d.png'),
  fire: require('../../assets/emoji3d/fire_3d.png'),
  locked: require('../../assets/emoji3d/locked_3d.png'),
} satisfies Record<string, ImageSourcePropType>;

export type BadgeKey = 'pioneer' | 'summary_1' | 'summary_10' | 'liked_50' | 'finder' | 'driver_5' | 'points_100' | 'top3_month';
export type BadgeState = { key: BadgeKey; earned: boolean; progress: number | null; goal: number | null };

export const BADGES: Record<BadgeKey, { img: ImageSourcePropType; name: string; how: string }> = {
  pioneer: { img: EMOJI.seedling, name: t('من الأوائل'), how: t('سجّل بيونيميت قبل 2027.') },
  summary_1: { img: EMOJI.books, name: t('أول ملخّص'), how: t('انشر أول ملخّص لزملائك.') },
  summary_10: { img: EMOJI.cap, name: t('صاحب ملخّصات'), how: t('انشر 10 ملخّصات.') },
  liked_50: { img: EMOJI.star, name: t('ملخّصاته مفيدة'), how: t('اجمع 50 لايك من زملائك على ملخّصاتك.') },
  finder: { img: EMOJI.key, name: t('أمين'), how: t('بلّغ عن غرض لقيته ورجّعه لصاحبه.') },
  driver_5: { img: EMOJI.car, name: t('سائق الجامعة'), how: t('أعطِ 5 مقاعد بالتوصيلات.') },
  points_100: { img: EMOJI.fire, name: t('نشيط'), how: t('اجمع 100 نقطة.') },
  top3_month: { img: EMOJI.trophy, name: t('من الأوائل بكليته'), how: t('كون من أول 3 بكليتك هالشهر.') },
};

/** Order the server's list: earned first, then the closest to being earned. */
export function sortBadges(list: BadgeState[]) {
  const pct = (b: BadgeState) => (b.key === 'top3_month' || !b.goal ? 0 : Math.min(1, (b.progress ?? 0) / b.goal));
  return [...list].filter((b) => b.key in BADGES).sort((a, b) => Number(b.earned) - Number(a.earned) || pct(b) - pct(a));
}

/** "3/10", or for the monthly rank "مركزك 7". */
export function progressLabel(b: BadgeState) {
  if (b.key === 'top3_month') return b.progress ? t('مركزك {0}', [b.progress]) : '';
  if (b.goal == null) return '';
  return `${Math.min(b.progress ?? 0, b.goal)}/${b.goal}`;
}
export const progressPct = (b: BadgeState) => (b.key === 'top3_month' ? (b.progress ? Math.min(1, 3 / b.progress) : 0) : b.goal ? Math.min(1, (b.progress ?? 0) / b.goal) : 0);

export const POINT_KIND: Record<string, string> = {
  summary: t('نشرت ملخّص'),
  summary_like: t('لايك على ملخّصك'),
  found_item: t('بلّغت عن غرض لقيته'),
  ride_seat: t('أعطيت مقعد بتوصيلة'),
};

export const POINT_RULES: [string, string][] = [
  [t('ملخّص بتنشره'), '+10'],
  [t('كل لايك من زميل على ملخّصك (لحد 30 باليوم)'), '+1'],
  [t('بلّغت عن غرض لقيته'), '+5'],
  [t('كل مقعد بتعطيه بتوصيلة'), '+3'],
];
