import { useEffect } from 'react';
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { C } from '@/lib/theme';

/** Soft pulsing placeholder shown while content loads (instead of a blank screen). */
export function Bone({ w = '100%', h = 14, r = 8, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const v = useSharedValue(0.55);
  useEffect(() => { v.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.quad) }), -1, true); }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View style={[{ width: w, height: h, borderRadius: r, backgroundColor: C.soft }, a, style]} />;
}

export function PostSkeleton() {
  return (
    <View style={{ backgroundColor: C.card, borderRadius: 26, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Bone w={42} h={42} r={21} />
        <View style={{ flex: 1, gap: 6 }}><Bone w="45%" h={12} /><Bone w="30%" h={10} /></View>
      </View>
      <Bone h={180} r={18} />
      <Bone w="80%" /><Bone w="55%" />
    </View>
  );
}

export function RowSkeleton() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, paddingHorizontal: 12, borderRadius: 20, backgroundColor: C.card }}>
      <Bone w={54} h={54} r={27} />
      <View style={{ flex: 1, gap: 8 }}><Bone w="50%" h={12} /><Bone w="75%" h={10} /></View>
    </View>
  );
}

export function ListSkeleton({ n = 5, kind = 'row' }: { n?: number; kind?: 'row' | 'post' }) {
  return <View style={{ gap: kind === 'post' ? 14 : 6 }}>{Array.from({ length: n }, (_, i) => (kind === 'post' ? <PostSkeleton key={i} /> : <RowSkeleton key={i} />))}</View>;
}
