import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Heart } from 'lucide-react-native';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { Platform, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, useExclusiveGestures, usePanGesture, usePinchGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { interpolate, makeMutable, runOnJS, useAnimatedStyle, useSharedValue, withSequence, withTiming, Easing } from 'react-native-reanimated';

/**
 * Instagram-style photo behaviour, shared by posts and chats:
 * - double tap: heart pops in the middle (+ haptic) and onDoubleTap runs (like)
 * - pinch with two fingers: the photo lifts above the whole screen over a dim backdrop, follows the fingers,
 *   and glides back into place when released (no bounce).
 * Mount <ZoomHost /> once at the root of the app.
 */

// image aspect ratios (width / height) we have already seen, so a photo keeps its shape when it shows again
export const aspectCache = new Map<string, number>();

// one lifted photo at a time; these live outside React so any photo can drive the overlay
const lift = { s: makeMutable(1), tx: makeMutable(0), ty: makeMutable(0), on: makeMutable(0) };
type Rect = { x: number; y: number; w: number; h: number; uri: string; fit: 'cover' | 'contain' };
let setOverlay: ((r: Rect | null) => void) | null = null;

const EASE = { duration: 240, easing: Easing.out(Easing.cubic) };

export function ZoomHost() {
  const [r, setR] = useState<Rect | null>(null);
  useEffect(() => { setOverlay = setR; return () => { setOverlay = null; }; }, []);
  const dim = useAnimatedStyle(() => ({ opacity: lift.on.value * interpolate(lift.s.value, [1, 2.2], [0, 0.8], 'clamp') }));
  const img = useAnimatedStyle(() => ({ transform: [{ translateX: lift.tx.value }, { translateY: lift.ty.value }, { scale: lift.s.value }] }));
  if (!r) return null;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, dim]} />
      <Animated.View style={[{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h, overflow: 'hidden' }, img]}>
        <Image source={{ uri: r.uri }} style={{ width: '100%', height: '100%' }} contentFit={r.fit} />
      </Animated.View>
    </View>
  );
}

export function ZoomableImage({ uri, cacheKey, style, fit = 'cover', onDoubleTap, onSingleTap, onAspect, radius = 0, children }: {
  uri: string | null; cacheKey?: string; style?: StyleProp<ViewStyle>; fit?: 'cover' | 'contain';
  onDoubleTap?: () => void; onSingleTap?: () => void; onAspect?: (a: number) => void; radius?: number; children?: ReactNode;
}) {
  const box = useRef<ComponentRef<typeof View>>(null);
  const hidden = useSharedValue(0);
  const burst = useSharedValue(0);

  function begin() {
    if (!uri || !setOverlay) return;
    box.current?.measureInWindow((x: number, y: number, w: number, h: number) => { setOverlay?.({ x, y, w, h, uri, fit }); lift.on.value = 1; hidden.value = 1; });
  }
  function end() { setOverlay?.(null); hidden.value = 0; }
  const lastTap = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (tapTimer.current) clearTimeout(tapTimer.current); }, []);
  function liked() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onDoubleTap?.();
  }

  const pinch = usePinchGesture({
    onActivate: () => { 'worklet'; lift.s.value = 1; lift.tx.value = 0; lift.ty.value = 0; runOnJS(begin)(); },
    onUpdate: (e) => { 'worklet'; lift.s.value = Math.min(4, Math.max(1, e.scale)); },
    onFinalize: () => {
      'worklet';
      if (lift.on.value === 0) return;
      lift.tx.value = withTiming(0, EASE); lift.ty.value = withTiming(0, EASE);
      lift.s.value = withTiming(1, EASE, (f) => { if (f) { lift.on.value = 0; runOnJS(end)(); } });
    },
  });
  const move = usePanGesture({
    minPointers: 2,
    onUpdate: (e) => { 'worklet'; lift.tx.value += e.changeX; lift.ty.value += e.changeY; },
  });
  const dbl = useTapGesture({
    numberOfTaps: 2,
    maxDelay: 260,
    onActivate: () => {
      'worklet';
      burst.value = withSequence(withTiming(1, { duration: 140 }), withTiming(1, { duration: 380 }), withTiming(0, { duration: 220 }));
      runOnJS(liked)();
    },
  });
  const single = useTapGesture({ numberOfTaps: 1, maxDelay: 260, onActivate: () => { 'worklet'; if (onSingleTap) runOnJS(onSingleTap)(); } });
  // a single tap waits to be sure it isn't the first half of a double tap
  const taps = useExclusiveGestures(dbl, single);
  const gesture = useSimultaneousGestures(pinch, move, taps);

  const hide = useAnimatedStyle(() => ({ opacity: hidden.value ? 0 : 1 }));
  const pop = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 0.6 + burst.value * 0.5 }] }));

  const body = (
    <>
      <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }, hide]}>
        {uri ? (
          <Image source={cacheKey ? { uri, cacheKey } : { uri }} style={{ width: '100%', height: '100%' }} contentFit={fit} transition={180}
            onLoad={(e) => { const a = e.source.width / Math.max(1, e.source.height); if (cacheKey) aspectCache.set(cacheKey, a); onAspect?.(a); }} />
        ) : null}
      </Animated.View>
      {children}
      <Animated.View pointerEvents="none" style={pop}><Heart size={92} color="#fff" fill="#fff" /></Animated.View>
    </>
  );
  const boxStyle = [{ overflow: 'hidden' as const, borderRadius: radius, alignItems: 'center' as const, justifyContent: 'center' as const }, style];

  // the web: plain taps (a gesture handler there would stop the page from scrolling when a finger starts on the photo)
  if (Platform.OS === 'web') {
    const press = () => {
      const now = Date.now();
      if (now - lastTap.current < 280) {
        if (tapTimer.current) clearTimeout(tapTimer.current);
        lastTap.current = 0;
        burst.value = withSequence(withTiming(1, { duration: 140 }), withTiming(1, { duration: 380 }), withTiming(0, { duration: 220 }));
        liked();
        return;
      }
      lastTap.current = now;
      if (onSingleTap) tapTimer.current = setTimeout(onSingleTap, 290);
    };
    return <Pressable onPress={press} style={boxStyle} accessibilityRole="image">{body}</Pressable>;
  }

  return (
    <GestureDetector gesture={gesture}>
      <View ref={box} collapsable={false} style={boxStyle}>{body}</View>
    </GestureDetector>
  );
}
