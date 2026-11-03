import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StatusBar, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Tap } from './ui';
import { t } from '@/lib/i18n';

/** Full-screen photo: pinch to zoom (native iOS zoom), tap the X or the background to close. */
export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <StatusBar barStyle="light-content" />
      <Animated.View entering={FadeIn} style={{ flex: 1, backgroundColor: '#000' }}>
        <ScrollView maximumZoomScale={4} minimumZoomScale={1} centerContent bouncesZoom showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}
          contentContainerStyle={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable onPress={onClose} style={{ width, height }} accessibilityLabel={t('سكّر الصورة')}>
            {uri && <Image source={{ uri }} style={{ width, height }} contentFit="contain" transition={150} />}
          </Pressable>
        </ScrollView>
        <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0 }}>
          <View style={{ padding: 10 }}>
            <Tap onPress={onClose} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={24} color="#fff" />
            </Tap>
          </View>
        </SafeAreaView>
      </Animated.View>
    </Modal>
  );
}
