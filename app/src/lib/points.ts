import { t } from './i18n';

/** 3D emoji (Microsoft Fluent UI Emoji, MIT) used on the points leaderboard. */
export const EMOJI = {
  trophy: require('../../assets/emoji3d/trophy_3d.png'),
  gold: require('../../assets/emoji3d/1st_place_medal_3d.png'),
  silver: require('../../assets/emoji3d/2nd_place_medal_3d.png'),
  bronze: require('../../assets/emoji3d/3rd_place_medal_3d.png'),
  medal: require('../../assets/emoji3d/sports_medal_3d.png'),
} satisfies Record<string, number>;

/** What each line of "my points" means (the kinds are set by the database). */
export const POINT_KIND: Record<string, string> = {
  summary: t('نشرت ملخّص'),
  summary_like: t('لايك على ملخّصك'),
  found_item: t('بلّغت عن غرض لقيته'),
  ride_seat: t('أعطيت مقعد بتوصيلة'),
};

/** How points are earned, shown on the leaderboard. Must match migration 0075. */
export const POINT_RULES: [string, string][] = [
  [t('ملخّص بتنشره'), '+10'],
  [t('كل لايك من زميل على ملخّصك (لحد 30 باليوم)'), '+1'],
  [t('بلّغت عن غرض لقيته'), '+5'],
  [t('كل مقعد بتعطيه بتوصيلة'), '+3'],
];
