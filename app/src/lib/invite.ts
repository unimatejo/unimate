import { Share } from 'react-native';

import { t } from './i18n';

const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? '';

/** Share sheet with an invite to UniMate (link added once the store pages exist). */
export function inviteFriends(university?: string | null) {
  const msg = t('نزّل يونيميت وخلينا نتابع بعض 🎓 جدولنا، ملخصات المواد، وكل طلاب {0} بمكان واحد.', [university ?? t('جامعتنا')]);
  return Share.share({ message: APP_URL ? `${msg}\n${APP_URL}` : msg }).catch(() => {});
}
