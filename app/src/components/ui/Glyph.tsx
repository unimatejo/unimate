import { LinearGradient } from 'expo-linear-gradient';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';

/** Gradient pairs for icon tiles (top-left -> bottom-right). */
export const GRAD = {
  blue: ['#6E95FF', '#2E5BFF'],
  indigo: ['#818CF8', '#4F46E5'],
  violet: ['#B794FF', '#7C3AED'],
  pink: ['#FF8FB1', '#F0386B'],
  red: ['#FF8A80', '#E5383B'],
  orange: ['#FFB86B', '#FF6B2C'],
  yellow: ['#FFE07A', '#F5B400'],
  green: ['#5EE3A1', '#10A36B'],
  teal: ['#5CE1E6', '#0891B2'],
  slate: ['#A5B0CC', '#56627F'],
} as const;

/**
 * App-icon style tile: gradient squircle, glossy top light, white icon, soft colored glow.
 * `live` gives it a gentle idle motion; `pop` plays a one-time bounce when it appears.
 */
export function GlyphTile({ icon: Icon, colors = GRAD.blue, size = 48, live, pop, delay = 0, fill, style }: {
  icon: LucideIcon; colors?: readonly [string, string] | readonly string[]; size?: number; live?: boolean; pop?: boolean; delay?: number; fill?: boolean; style?: StyleProp<ViewStyle>;
}) {
  // calm: no idle swinging; `pop` is a short fade-in without bounce. (`live` kept for API compatibility.)
  void live;
  const s = useSharedValue(pop ? 0 : 1);
  useEffect(() => {
    if (pop) s.value = withDelay(delay, withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [pop, delay, s]);
  const a = useAnimatedStyle(() => ({ opacity: s.value, transform: [{ scale: 0.94 + 0.06 * s.value }] }));
  const r = Math.round(size * 0.32);
  return (
    <Animated.View style={[{ width: size, height: size, borderRadius: r, shadowColor: colors[1], shadowOpacity: 0.38, shadowRadius: size * 0.22, shadowOffset: { width: 0, height: size * 0.14 }, elevation: 6 }, a, style]}>
      <LinearGradient colors={colors as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: r, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: -size * 0.35, left: -size * 0.1, width: size * 1.2, height: size * 0.75, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.22)' }} />
        <Icon size={size * 0.5} color="#fff" strokeWidth={2.3} fill={fill ? 'rgba(255,255,255,0.25)' : 'none'} />
      </LinearGradient>
    </Animated.View>
  );
}

/** One-shot wiggle for an icon (bell ring, heart pop...). Re-run by changing `trigger`. */
export function Wiggle({ children, trigger, kind = 'ring' }: { children: React.ReactNode; trigger?: unknown; kind?: 'ring' | 'pop' }) {
  // the bell no longer swings; a heart "pop" stays as a small, non-bouncy pulse
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = 0;
    if (kind === 'ring') return;
    v.value = withSequence(withTiming(1, { duration: 120 }), withTiming(0, { duration: 180 }));
  }, [trigger, kind, v]);
  const a = useAnimatedStyle(() => kind === 'ring' ? {} : { transform: [{ scale: 1 + v.value * 0.2 }] });
  return <Animated.View style={a}>{children}</Animated.View>;
}
