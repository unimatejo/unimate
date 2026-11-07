import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Image } from 'expo-image';
import { RotateCw } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T, Tap } from '@/components/ui';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Src = { uri: string; width: number; height: number };

/**
 * Instagram-style profile photo crop: drag and pinch the photo under a circle, rotate in 90° steps.
 * Gives back a square JPEG of exactly what is inside the circle.
 */
export function AvatarCropper({ src, onDone, onCancel }: { src: Src | null; onDone: (f: { uri: string; mime: string }) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const box = Math.min(width - 40, 340); // the circle
  const [img, setImg] = useState<Src | null>(src);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setImg(src); }, [src]);

  // the photo is drawn to cover the circle at scale 1
  const base = img ? Math.max(box / img.width, box / img.height) : 1;
  const x = useSharedValue(0), y = useSharedValue(0), sc = useSharedValue(1);
  const reset = () => { x.value = 0; y.value = 0; sc.value = 1; };
  useEffect(reset, [img]); // eslint-disable-line react-hooks/exhaustive-deps

  const dw = img ? img.width * base : box, dh = img ? img.height * base : box;
  // keep the circle always covered by the photo
  const clamp = () => {
    'worklet';
    const mx = (dw * sc.value - box) / 2, my = (dh * sc.value - box) / 2;
    x.value = withTiming(Math.min(mx, Math.max(-mx, x.value)), { duration: 120 });
    y.value = withTiming(Math.min(my, Math.max(-my, y.value)), { duration: 120 });
  };
  const pan = usePanGesture({
    onUpdate: (e) => { 'worklet'; x.value += e.changeX; y.value += e.changeY; },
    onDeactivate: () => { 'worklet'; clamp(); },
  });
  const pinch = usePinchGesture({
    onUpdate: (e) => { 'worklet'; sc.value = Math.min(5, Math.max(1, sc.value * e.scaleChange)); },
    onDeactivate: () => { 'worklet'; clamp(); },
  });
  const gesture = useSimultaneousGestures(pan, pinch);
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: sc.value }] }));


  async function rotate() {
    if (!img || busy) return;
    setBusy(true);
    try {
      const r = await (await ImageManipulator.manipulate(img.uri).rotate(90).renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
      setImg({ uri: r.uri, width: r.width, height: r.height });
    } finally { setBusy(false); }
  }

  async function done() {
    if (!img || busy) return;
    setBusy(true);
    try {
      const s = sc.value, ox = x.value, oy = y.value;
      // circle in photo pixels: centre shifted by the drag, size shrunk by the zoom
      const k = base * s;
      const side = Math.min(img.width, img.height, box / k);
      const cx = img.width / 2 - ox / k, cy = img.height / 2 - oy / k;
      const originX = Math.max(0, Math.min(img.width - side, cx - side / 2));
      const originY = Math.max(0, Math.min(img.height - side, cy - side / 2));
      const ctx = ImageManipulator.manipulate(img.uri).crop({ originX: Math.round(originX), originY: Math.round(originY), width: Math.round(side), height: Math.round(side) });
      if (side > 720) ctx.resize({ width: 720, height: 720 });
      const out = await (await ctx.renderAsync()).saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
      onDone({ uri: out.uri, mime: 'image/jpeg' });
    } catch { onCancel(); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible={!!src} animationType="slide" onRequestClose={onCancel}>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        {/* the phone's own insets: a SafeAreaView inside a Modal opened from a sheet reads them as zero on iPhone */}
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, height: 52 }}>
            <Tap onPress={onCancel} accessibilityLabel={t('إلغاء')}><T v="bodyMd" color="#fff">{t('إلغاء')}</T></Tap>
            <T v="bold" color="#fff">{t('عدّل الصورة')}</T>
            <Tap onPress={done} disabled={busy} accessibilityLabel={t('تم')}>{busy ? <ActivityIndicator color="#fff" /> : <T v="bold" color={C.primary}>{t('تم')}</T>}</Tap>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <GestureDetector gesture={gesture}>
              <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
                {img && (
                  <Animated.View style={[{ width: dw, height: dh }, st]}>
                    <Image source={{ uri: img.uri }} style={{ width: dw, height: dh }} contentFit="cover" />
                  </Animated.View>
                )}
                {/* dark outside, clear circle inside */}
                <View pointerEvents="none" style={{ position: 'absolute', width: box + 2000, height: box + 2000, borderRadius: (box + 2000) / 2, borderWidth: 1000, borderColor: 'rgba(0,0,0,0.6)' }} />
                <View pointerEvents="none" style={{ position: 'absolute', width: box, height: box, borderRadius: box / 2, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }} />
              </View>
            </GestureDetector>
          </View>
          <View style={{ alignItems: 'center', gap: 14, paddingBottom: 30 }}>
            <T v="small" color="#AEB8D8">{t('اسحب الصورة وكبّرها بإصبعين')}</T>
            <Tap onPress={rotate} disabled={busy} accessibilityLabel={t('دوّر')} style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
              <RotateCw size={22} color="#fff" />
            </Tap>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
