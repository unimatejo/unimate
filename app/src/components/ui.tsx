import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { forwardRef, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { C, F, R, avatarColors, shadow } from '@/lib/theme';

// ---------- text ----------
type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyMd' | 'bold' | 'small' | 'tiny';
const V: Record<Variant, TextStyle> = {
  display: { fontFamily: F.display, fontSize: 36, lineHeight: 54 },
  h1: { fontFamily: F.display, fontSize: 26, lineHeight: 40 },
  h2: { fontFamily: F.title, fontSize: 19, lineHeight: 28 },
  h3: { fontFamily: F.title, fontSize: 16, lineHeight: 24 },
  body: { fontFamily: F.body, fontSize: 15, lineHeight: 24 },
  bodyMd: { fontFamily: F.bodyMd, fontSize: 15, lineHeight: 22 },
  bold: { fontFamily: F.bodyBold, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: F.body, fontSize: 13, lineHeight: 20 },
  tiny: { fontFamily: F.bodyMd, fontSize: 11, lineHeight: 16 },
};
export function T({ v = 'body', color = C.ink, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  return <Text {...p} style={[V[v], { color, textAlign: 'right', writingDirection: 'rtl' }, style]} />;
}

// ---------- layout ----------
export function Screen({ children, edges = ['top'], style, bg = C.bg }: { children: ReactNode; edges?: Edge[]; style?: StyleProp<ViewStyle>; bg?: string }) {
  return <SafeAreaView edges={edges} style={[{ flex: 1, backgroundColor: bg }, style]}>{children}</SafeAreaView>;
}

export function Row({ children, gap = 8, style, center = true }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle>; center?: boolean }) {
  return <View style={[{ flexDirection: 'row', gap, alignItems: center ? 'center' : 'flex-start' }, style]}>{children}</View>;
}

export function Card({ children, style, pad = 16 }: { children: ReactNode; style?: StyleProp<ViewStyle>; pad?: number }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: R.lg, padding: pad }, shadow, style]}>{children}</View>;
}

// ---------- press with a soft spring ----------
const AP = Animated.createAnimatedComponent(Pressable);
export function Tap({ children, style, onPress, haptic = true, scale = 0.96, ...p }: PressableProps & { style?: StyleProp<ViewStyle>; haptic?: boolean; scale?: number; children: ReactNode }) {
  const s = useSharedValue(1);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AP
      {...p}
      onPressIn={() => { s.value = withTiming(scale, { duration: 90 }); }}
      onPressOut={() => { s.value = withSpring(1, { damping: 14, stiffness: 260 }); }}
      onPress={(e) => { if (haptic) Haptics.selectionAsync(); onPress?.(e); }}
      style={[style, a]}
    >
      {children}
    </AP>
  );
}

// ---------- buttons ----------
export function Button({ title, onPress, kind = 'primary', loading, disabled, icon, style }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'dark' | 'soft' | 'ghost' | 'danger' | 'green' | 'white';
  loading?: boolean; disabled?: boolean; icon?: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.primary, dark: C.ink, soft: C.primarySoft, ghost: 'transparent', danger: C.danger, green: C.green, white: C.white }[kind];
  const fg = { primary: C.white, dark: C.white, soft: C.primary, ghost: C.primary, danger: C.white, green: C.white, white: C.ink }[kind];
  const glow = kind === 'primary' ? { shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 6 } : null;
  return (
    <Tap
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[{ minHeight: 54, borderRadius: 18, backgroundColor: disabled ? '#DCE1EE' : bg, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, !disabled && glow, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {icon}
          <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: disabled ? C.muted : fg }}>{title}</Text>
        </>
      )}
    </Tap>
  );
}

export function IconButton({ children, onPress, label, dark, badge, style }: { children: ReactNode; onPress?: () => void; label: string; dark?: boolean; badge?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[{ width: 44, height: 44, borderRadius: 15, backgroundColor: dark ? C.ink : C.card, alignItems: 'center', justifyContent: 'center' }, !dark && shadow, style]}>
      {children}
      {!!badge && badge > 0 && (
        <View style={{ position: 'absolute', top: -5, left: -5, minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, backgroundColor: C.pink, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.white, fontFamily: F.bodyBold, fontSize: 10 }}>{badge > 99 ? '99+' : badge}</Text>
        </View>
      )}
    </Tap>
  );
}

export function Chip({ label, active, onPress, dot, style }: { label: string; active?: boolean; onPress?: () => void; dot?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!active }}
      style={[{ minHeight: 38, paddingHorizontal: 14, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: active ? C.ink : C.card }, !active && { borderWidth: 1, borderColor: C.line }, style]}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
      <Text style={{ fontFamily: active ? F.bodyBold : F.bodyMd, fontSize: 13, color: active ? C.white : C.ink }}>{label}</Text>
    </Tap>
  );
}

export function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, alignSelf: 'flex-start' }}>
      <Text style={{ fontFamily: F.bodyBold, fontSize: 11, color: fg }}>{label}</Text>
    </View>
  );
}

// segmented control with a sliding pill
export function Segmented({ items, value, onChange, dark }: { items: string[]; value: number; onChange: (i: number) => void; dark?: boolean }) {
  const w = useSharedValue(0);
  const x = useSharedValue(0);
  const pill = useAnimatedStyle(() => ({ width: w.value, transform: [{ translateX: x.value }] }));
  return (
    <View
      onLayout={(e) => { const cw = (e.nativeEvent.layout.width - 8) / items.length; w.value = cw; x.value = -value * cw; }}
      style={{ flexDirection: 'row', backgroundColor: dark ? 'rgba(255,255,255,0.16)' : '#E9ECF5', borderRadius: 14, padding: 4 }}
    >
      <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, right: 4, borderRadius: 11, backgroundColor: C.white }, shadow, pill]} />
      {items.map((it, i) => (
        <Pressable key={it} accessibilityRole="tab" accessibilityState={{ selected: i === value }}
          onPress={() => { Haptics.selectionAsync(); onChange(i); x.value = withSpring(-i * w.value, { damping: 18, stiffness: 220 }); }}
          style={{ flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: i === value ? F.bodyBold : F.body, fontSize: 13, color: i === value ? (dark ? C.ink : C.ink) : (dark ? C.white : C.muted) }}>{it}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ---------- avatar ----------
export function Avatar({ id, name, url, size = 44, ring, radius }: { id?: string | null; name?: string | null; url?: string | null; size?: number; ring?: boolean; radius?: number }) {
  const [bg, fg] = avatarColors(id);
  const r = radius ?? Math.round(size / 2);
  const inner = (
    <View style={{ width: size, height: size, borderRadius: r, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {url ? <Image source={{ uri: url }} style={{ width: size, height: size }} contentFit="cover" transition={150} /> : (
        <Text style={{ fontFamily: F.title, fontSize: size * 0.4, color: fg }}>{(name ?? '؟').trim().charAt(0)}</Text>
      )}
    </View>
  );
  if (!ring) return inner;
  return (
    <View style={{ padding: 3, borderRadius: r + 4, backgroundColor: C.primary }}>
      <View style={{ padding: 2, borderRadius: r + 2, backgroundColor: C.white }}>{inner}</View>
    </View>
  );
}

// ---------- header ----------
export function Header({ title, subtitle, right, back = true, onBack }: { title: string; subtitle?: string; right?: ReactNode; back?: boolean; onBack?: () => void }) {
  return (
    <Row gap={10} style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 }}>
      {back && (
        <IconButton label="رجوع" onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}>
          <ChevronRight size={22} color={C.ink} strokeWidth={2.2} />
        </IconButton>
      )}
      <View style={{ flex: 1 }}>
        <T v="h1" numberOfLines={1}>{title}</T>
        {subtitle && <T v="small" color={C.muted}>{subtitle}</T>}
      </View>
      {right}
    </Row>
  );
}

// ---------- inputs ----------
export const Field = forwardRef<ComponentRef<typeof TextInput>, TextInputProps & { label?: string }>(function Field({ label, style, ...p }, ref) {
  return (
    <View style={{ gap: 6 }}>
      {label && <T v="bold" style={{ fontSize: 14 }}>{label}</T>}
      <TextInput
        ref={ref}
        placeholderTextColor={C.faint}
        {...p}
        style={[{ minHeight: 52, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink, textAlign: 'right', writingDirection: 'rtl' }, style]}
      />
    </View>
  );
});

export function Toggle({ value, onChange, label, hint, icon }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: ReactNode }) {
  const x = useAnimatedStyle(() => ({ transform: [{ translateX: withSpring(value ? 0 : -20, { damping: 16, stiffness: 240 }) }] }), [value]);
  return (
    <Pressable onPress={() => { Haptics.selectionAsync(); onChange(!value); }} accessibilityRole="switch" accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62 }}>
      {icon}
      <View style={{ flex: 1 }}>
        <T v="bodyMd">{label}</T>
        {hint && <T v="small" color={C.muted}>{hint}</T>}
      </View>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? C.primary : '#CDD3E2', justifyContent: 'center', paddingHorizontal: 3, alignItems: 'flex-start' }}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: C.white }, shadow, x]} />
      </View>
    </Pressable>
  );
}

export function IconTile({ color, children, size = 36 }: { color: string; children: ReactNode; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size * 0.33, backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>{children}</View>;
}

export function ListRow({ icon, label, value, onPress, danger }: { icon?: ReactNode; label: string; value?: string; onPress?: () => void; danger?: boolean }) {
  return (
    <Tap onPress={onPress} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line }}>
      {icon}
      <T v="bodyMd" color={danger ? C.danger : C.ink} style={{ flex: 1 }}>{label}</T>
      {value ? <T v="small" color={C.muted}>{value}</T> : null}
      <ChevronRight size={18} color="#A3ABC2" style={{ transform: [{ scaleX: -1 }] }} />
    </Tap>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 }}>
      {icon && <View style={{ width: 64, height: 64, borderRadius: 24, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>}
      <T v="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body && <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{body}</T>}
      {action}
    </View>
  );
}

export function Loading() {
  return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }}><ActivityIndicator color={C.primary} /></View>;
}
