import { MapPin } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { Button, Row, T } from '@/components/ui';
import { t } from '@/lib/i18n';
import { C, shadow } from '@/lib/theme';

/** The admin points at a spot (an advertiser's shop): move the map under the red pin, then «هنا تمامًا». */
export function PickPoint({ onPick, onCancel }: { onPick: () => void; onCancel: () => void }) {
  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginTop: -44 }}>
          <MapPin size={44} color={C.red} fill={C.red} />
          <View style={{ width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        </View>
      </View>
      <Animated.View entering={SlideInDown.duration(240)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 28, padding: 16, gap: 10 }, shadow]}>
        <T v="h3">{t('حدّد مكان المحل')}</T>
        <T v="small" color={C.muted}>{t('حرّك الخريطة حتى يصبح الدبوس الأحمر فوق المحل تمامًا. ابحث عن المبنى من الأعلى إن احتجت.')}</T>
        <Row gap={8}>
          <Button kind="soft" title={t('إلغاء')} onPress={onCancel} style={{ flex: 1 }} />
          <Button title={t('هنا تمامًا')} onPress={onPick} style={{ flex: 1.4 }} />
        </Row>
      </Animated.View>
    </>
  );
}
