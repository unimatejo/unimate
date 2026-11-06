import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { T, Tap } from '@/components/ui';
import { FRAME_COLORS, useFrame } from '@/lib/frames';
import { t } from '@/lib/i18n';
import { C, F } from '@/lib/theme';

/** Under a name on a profile: why this person wears a frame («المركز الأول بالكلية · الفصل الأول»). Opens the board. */
export function HonorChip({ id }: { id: string }) {
  const f = useFrame(id);
  if (!f) return null;
  return (
    <Tap haptic={false} scale={0.97} onPress={() => router.push('/honor')} accessibilityRole="button" accessibilityLabel={t('إطار تكريم: {0}', [f.label])}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: C.soft, maxWidth: '100%' }}>
      <LinearGradient colors={FRAME_COLORS[f.level]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: 12, height: 12, borderRadius: 6 }} />
      <T v="tiny" numberOfLines={1} style={{ fontFamily: F.bodyBold, flexShrink: 1 }}>{f.label}</T>
    </Tap>
  );
}
