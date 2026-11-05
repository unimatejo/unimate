import { Image } from 'expo-image';
import { Share2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Share, StatusBar, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture, useExclusiveGestures } from 'react-native-gesture-handler';
import Animated, { Easing, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { T, Tap } from './ui';
import { toast } from '@/lib/toast';
import { t } from '@/lib/i18n';

const EASE = { duration: 220, easing: Easing.out(Easing.cubic) };

/** One photo: pinch or double tap to zoom, drag when zoomed, drag down to close when not. */
function Page({ uri, w, h, drag, onZoom, onClose }: { uri: string; w: number; h: number; drag: SharedValue<number>; onZoom: (z: boolean) => void; onClose: () => void }) {
  const s = useSharedValue(1), saved = useSharedValue(1);
  const x = useSharedValue(0), y = useSharedValue(0), sx = useSharedValue(0), sy = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);
  const setZ = (z: boolean) => { setZoomed(z); onZoom(z); };

  const clampXY = () => {
    'worklet';
    const mx = (w * s.value - w) / 2, my = (h * s.value - h) / 2;
    x.value = withTiming(Math.min(mx, Math.max(-mx, x.value)), EASE);
    y.value = withTiming(Math.min(my, Math.max(-my, y.value)), EASE);
  };
  const reset = () => {
    'worklet';
    s.value = withTiming(1, EASE); saved.value = 1; x.value = withTiming(0, EASE); y.value = withTiming(0, EASE);
    runOnJS(setZ)(false);
  };

  const pinch = usePinchGesture({
    onUpdate: (e) => { 'worklet'; s.value = Math.min(5, Math.max(0.8, saved.value * e.scale)); },
    onDeactivate: () => {
      'worklet';
      if (s.value <= 1.02) reset();
      else { saved.value = s.value; clampXY(); runOnJS(setZ)(true); }
    },
  });
  // zoomed: move around the photo
  const panZoom = usePanGesture({
    enabled: zoomed,
    onBegin: () => { 'worklet'; sx.value = x.value; sy.value = y.value; },
    onUpdate: (e) => { 'worklet'; x.value = sx.value + e.translationX; y.value = sy.value + e.translationY; },
    onDeactivate: () => { 'worklet'; clampXY(); },
  });
  // not zoomed: drag down (or up) to close, sideways is left to the photo pager
  const panClose = usePanGesture({
    enabled: !zoomed,
    activeOffsetY: [-14, 14],
    failOffsetX: [-14, 14],
    onUpdate: (e) => { 'worklet'; y.value = e.translationY; drag.value = e.translationY; },
    onDeactivate: (e) => {
      'worklet';
      if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900) {
        y.value = withTiming(Math.sign(e.translationY || 1) * h, EASE, (f) => { if (f) runOnJS(onClose)(); });
        drag.value = withTiming(h, EASE);
      } else { y.value = withTiming(0, EASE); drag.value = withTiming(0, EASE); }
    },
  });
  const dbl = useTapGesture({
    numberOfTaps: 2,
    maxDelay: 260,
    onActivate: (e) => {
      'worklet';
      if (s.value > 1.02) { reset(); return; }
      const z = 2.5;
      s.value = withTiming(z, EASE); saved.value = z;
      // zoom towards the tapped point
      const mx = (w * z - w) / 2, my = (h * z - h) / 2;
      x.value = withTiming(Math.min(mx, Math.max(-mx, (w / 2 - e.x) * (z - 1))), EASE);
      y.value = withTiming(Math.min(my, Math.max(-my, (h / 2 - e.y) * (z - 1))), EASE);
      runOnJS(setZ)(true);
    },
  });
  const single = useTapGesture({ numberOfTaps: 1, maxDelay: 260, onActivate: () => { 'worklet'; } });
  const gesture = useSimultaneousGestures(pinch, panZoom, panClose, useExclusiveGestures(dbl, single));
  const st = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }, { translateY: y.value }, { scale: s.value }] }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: w, height: h, overflow: 'hidden' }}>
        <Animated.View style={[{ width: w, height: h }, st]}>
          <Image source={{ uri }} style={{ width: w, height: h }} contentFit="contain" transition={160} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

/**
 * Full-screen photos like Instagram / WhatsApp: opens with a calm fade, swipe between photos,
 * pinch or double tap to zoom, drag down to close (the background fades as you drag), share / save.
 * Pass `uri` for one photo or `images` + `index` for a gallery.
 */
export function ImageViewer({ uri, images, index = 0, onClose }: { uri?: string | null; images?: string[] | null; index?: number; onClose: () => void }) {
  const list = images?.length ? images : uri ? [uri] : [];
  const open = list.length > 0;
  const { width: w, height: h } = useWindowDimensions();
  const [i, setI] = useState(index);
  const [zoomed, setZoomed] = useState(false);
  const drag = useSharedValue(0);
  const shown = useSharedValue(0);
  const pager = useRef<FlatList<string>>(null);

  useEffect(() => {
    if (!open) return;
    setI(index); setZoomed(false); drag.value = 0;
    shown.value = 0; shown.value = withTiming(1, EASE);
  }, [open, index, drag, shown]);

  const close = () => { shown.value = withTiming(0, { duration: 160 }, (f) => { if (f) runOnJS(onClose)(); }); };
  const bg = useAnimatedStyle(() => ({ opacity: shown.value * interpolate(Math.abs(drag.value), [0, 400], [1, 0.15], 'clamp') }));
  const body = useAnimatedStyle(() => ({ opacity: shown.value, transform: [{ scale: interpolate(shown.value, [0, 1], [0.96, 1]) }] }));
  const chrome = useAnimatedStyle(() => ({ opacity: shown.value * interpolate(Math.abs(drag.value), [0, 80], [1, 0], 'clamp') }));

  async function share() {
    const u = list[i];
    if (!u) return;
    if (Platform.OS === 'web') {
      try {
        const blob = await (await fetch(u)).blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `unimate-${Date.now()}.${(blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')}`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
        toast(t('انحفظت الصورة'));
      } catch { window.open(u, '_blank'); }
      return;
    }
    Share.share(Platform.OS === 'ios' ? { url: u } : { message: u }).catch(() => {});
  }

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" />
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, bg]} />
        <Animated.View style={[{ flex: 1 }, body]}>
          {/* the pager is always laid out left-to-right so paging offsets work the same on every platform (RTL web mirrors them) */}
          <FlatList ref={pager} data={list} horizontal pagingEnabled style={{ direction: 'ltr' }} scrollEnabled={!zoomed && list.length > 1} showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(index, Math.max(0, list.length - 1))} getItemLayout={(_, k) => ({ length: w, offset: w * k, index: k })}
            keyExtractor={(u, k) => `${k}-${u}`}
            onScroll={(e) => setI(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / w))} scrollEventThrottle={32}
            renderItem={({ item }) => <Page uri={item} w={w} h={h} drag={drag} onZoom={setZoomed} onClose={onClose} />} />
        </Animated.View>
        <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', top: 0, left: 0, right: 0 }, chrome]}>
          <SafeAreaView edges={['top']}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10 }}>
              <Tap onPress={close} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <X size={22} color="#fff" />
              </Tap>
              {list.length > 1 ? <T v="bold" color="#fff">{i + 1} / {list.length}</T> : <View />}
              <Tap onPress={share} accessibilityLabel={Platform.OS === 'web' ? t('احفظ الصورة') : t('شارك الصورة')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Share2 size={20} color="#fff" />
              </Tap>
            </View>
          </SafeAreaView>
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
