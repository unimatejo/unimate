import { View } from 'react-native';

import { useOnline } from '@/lib/presence';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** Green dot on an avatar's bottom corner while that person has UniMate open. */
export function OnlineDot({ id, size = 14, ring = C.bg }: { id?: string | null; size?: number; ring?: string }) {
  const on = useOnline(id);
  if (!on) return null;
  return (
    <View accessibilityLabel={t('نشط الآن')} style={{ position: 'absolute', bottom: 0, left: 0, width: size, height: size, borderRadius: size / 2, backgroundColor: '#34D399', borderWidth: size > 12 ? 3 : 2, borderColor: ring }} />
  );
}
