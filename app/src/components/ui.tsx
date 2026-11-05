import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronRight, CircleAlert } from 'lucide-react-native';
import { forwardRef, useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, View,
  type PressableProps, type StyleProp, type TextInputProps, type TextProps, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { ListSkeleton } from './Skeleton';
import { C, F, R, avatarColors, isDark, shadow, glassStyle } from '@/lib/theme';
import { flip, isAR, t, ta, rtlLayout } from '@/lib/i18n';

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
// on the web a one-line Latin name inside Arabic text used to lose its start ("…AID AKRAM"); let the browser pick the direction per line
const autoDir = Platform.OS === 'web' ? ({ dir: 'auto' } as object) : null;
export function T({ v = 'body', color: c = C.ink, style, ...p }: TextProps & { v?: Variant; color?: string }) {
  // coral text on the light background is too faint to read: use the deeper coral for words, keep the bright one for fills
  const color = !isDark && c === C.primary ? C.primaryDark : c;
  if (autoDir && p.numberOfLines) return <Text {...p} {...autoDir} style={[V[v], { color, textAlign: ta }, style]} />;
  return <Text {...p} style={[V[v], { color, textAlign: ta, writingDirection: isAR ? 'rtl' : 'ltr' }, style]} />;
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

// ---------- press: a quiet dim (Instagram-like), no bounce ----------
const AP = Animated.createAnimatedComponent(Pressable);
export function Tap({ children, style, onPress, haptic = true, scale = 0.96, throttle = 450, ...p }: PressableProps & { style?: StyleProp<ViewStyle>; haptic?: boolean; scale?: number; throttle?: number; children: ReactNode }) {
  const s = useSharedValue(0); // 0 = resting, 1 = pressed
  const last = useRef(0); // ignore double presses so a screen never opens twice
  const to = Math.max(scale, 0.98); // barely shrinks; the dim carries the feedback
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 - (1 - to) * s.value }], opacity: 1 - 0.28 * s.value }));
  return (
    <AP
      {...p}
      onPressIn={() => { s.value = withTiming(1, { duration: 80 }); }}
      onPressOut={() => { s.value = withTiming(0, { duration: 160 }); }}
      onPress={(e) => {
        const now = Date.now();
        if (throttle && now - last.current < throttle) return;
        last.current = now;
        if (haptic && onPress && !p.disabled) Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={[style, a]}
    >
      {children}
    </AP>
  );
}

// ---------- buttons ----------
export function Button({ title, onPress, kind = 'primary', loading, disabled, icon, iconEnd, style }: {
  title: string; onPress?: () => void; kind?: 'primary' | 'dark' | 'soft' | 'ghost' | 'danger' | 'green' | 'white';
  loading?: boolean; disabled?: boolean; icon?: ReactNode; iconEnd?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: C.primary, dark: C.inverse, soft: C.primarySoft, ghost: 'transparent', danger: C.danger, green: C.green, white: C.card }[kind];
  const fg = { primary: C.onPrimary, dark: C.onInverse, soft: isDark ? C.primaryDark : C.primaryDark, ghost: isDark ? C.primary : C.primaryDark, danger: C.white, green: C.white, white: C.ink }[kind];
  // every button floats: colored ones glow in their own color, light ones get a soft lift
  const tint = { primary: C.primary, dark: '#000000', danger: C.danger, green: C.green }[kind as 'primary'];
  const glow = kind === 'ghost' ? null : tint
    ? { shadowColor: tint, shadowOpacity: isDark ? 0.5 : 0.35, shadowRadius: 16, shadowOffset: { width: 0, height: 9 }, elevation: 7 }
    : { ...shadow };
  return (
    <Tap
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[{ minHeight: 52, borderRadius: 26, backgroundColor: disabled ? C.line : bg, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, !disabled && glow, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : (
        <>
          {!iconEnd && icon}
          <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: disabled ? C.muted : fg }}>{title}</Text>
          {iconEnd && icon}
        </>
      )}
    </Tap>
  );
}

export function IconButton({ children, onPress, label, dark, badge, style }: { children: ReactNode; onPress?: () => void; label: string; dark?: boolean; badge?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={[{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }, dark ? { backgroundColor: C.inverse } : glassStyle, style]}>
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
      style={[{ minHeight: 38, paddingHorizontal: 14, borderRadius: R.pill, flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: active ? C.inverse : C.card },
        active ? { shadowColor: C.ink, shadowOpacity: isDark ? 0.4 : 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 4 } : { ...shadow, shadowOpacity: isDark ? 0.4 : 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, style]}>
      {dot && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />}
      <Text style={{ fontFamily: active ? F.bodyBold : F.bodyMd, fontSize: 13, color: active ? C.onInverse : C.ink }}>{label}</Text>
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
  // the first tab sits at the "start" edge: right in Arabic, left in English
  const dir = rtlLayout() ? -1 : 1;
  useEffect(() => { if (w.value) x.value = withTiming(dir * value * w.value, { duration: 220 }); }, [value, dir, w, x]);
  return (
    <View
      onLayout={(e) => { const cw = (e.nativeEvent.layout.width - 8) / items.length; w.value = cw; x.value = dir * value * cw; }}
      style={{ flexDirection: 'row', backgroundColor: dark ? 'rgba(255,255,255,0.16)' : C.soft, borderRadius: 14, padding: 4 }}
    >
      <Animated.View style={[{ position: 'absolute', top: 4, bottom: 4, ...(Platform.OS === 'web' ? (rtlLayout() ? { right: 4 } : { left: 4 }) : { start: 4 }), borderRadius: 11, backgroundColor: C.card }, shadow, pill]} />
      {items.map((it, i) => (
        <Pressable key={it} accessibilityRole="tab" accessibilityState={{ selected: i === value }}
          onPress={() => { if (i === value) return; Haptics.selectionAsync().catch(() => {}); onChange(i); }}
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
        <Text style={{ fontFamily: F.title, fontSize: size * 0.4, color: fg }}>{(name ?? t('؟')).trim().charAt(0)}</Text>
      )}
    </View>
  );
  if (!ring) return inner;
  return (
    <View style={{ padding: 3, borderRadius: r + 4, backgroundColor: C.primary }}>
      <View style={{ padding: 2, borderRadius: r + 2, backgroundColor: C.card }}>{inner}</View>
    </View>
  );
}

// ---------- header ----------
export function Header({ title, subtitle, right, back = true, onBack }: { title: string; subtitle?: string; right?: ReactNode; back?: boolean; onBack?: () => void }) {
  return (
    <Row gap={10} style={{ paddingHorizontal: 18, paddingTop: 6, paddingBottom: 10 }}>
      {back && (
        <IconButton label={t('رجوع')} onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}>
          <ChevronRight size={22} color={C.ink} strokeWidth={2.2} style={flip} />
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
      <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
        ref={ref}
        placeholderTextColor={C.faint}
        {...p}
        style={[{ minHeight: 52, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 16, fontFamily: F.body, fontSize: 16, color: C.ink, textAlign: ta, writingDirection: isAR ? 'rtl' : 'ltr' }, style]}
      />
    </View>
  );
});

export function Toggle({ value, onChange, label, hint, icon, a11yLabel }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string; icon?: ReactNode; a11yLabel?: string }) {
  // knob starts at the "start" edge when off and slides to the end when on, mirrored like iOS in Arabic
  const end = rtlLayout() ? -20 : 20;
  const x = useAnimatedStyle(() => ({ transform: [{ translateX: withTiming(value ? end : 0, { duration: 180 }) }] }), [value, end]);
  return (
    <Pressable onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(!value); }} accessibilityRole="switch" accessibilityLabel={a11yLabel ?? label} accessibilityHint={hint} accessibilityState={{ checked: value }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62 }}>
      {icon}
      <View style={{ flex: label ? 1 : 0 }}>
        {label ? <T v="bodyMd">{label}</T> : null}
        {hint && <T v="small" color={C.muted}>{hint}</T>}
      </View>
      <View style={{ width: 50, height: 30, borderRadius: 15, backgroundColor: value ? C.primary : isDark ? C.line : '#D5DAE6', justifyContent: 'center', paddingHorizontal: 3, alignItems: 'flex-start' }}>
        <Animated.View style={[{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#FFFFFF' }, shadow, x]} />
      </View>
    </Pressable>
  );
}

function lighten(hex: string, amt = 0.35) {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const n = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16)).map((c) => Math.round(c + (255 - c) * amt));
  return '#' + n.map((c) => c.toString(16).padStart(2, '0')).join('');
}

/** Small app-icon style tile (gradient + gloss) used in lists and settings. */
export function IconTile({ color, children, size = 36 }: { color: string; children: ReactNode; size?: number }) {
  const r = size * 0.3;
  return (
    <View style={{ width: size, height: size, borderRadius: r, shadowColor: color, shadowOpacity: 0.3, shadowRadius: 5, shadowOffset: { width: 0, height: 3 } }}>
      <LinearGradient colors={[lighten(color), color]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: r, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        <View style={{ position: 'absolute', top: -size * 0.4, left: -size * 0.1, width: size * 1.2, height: size * 0.8, borderRadius: size, backgroundColor: 'rgba(255,255,255,0.18)' }} />
        {children}
      </LinearGradient>
    </View>
  );
}


/** Empty-state icon: soft gradient bubble that floats gently. */
function FloatIcon({ children }: { children: ReactNode }) {
  // still, like Instagram's empty states (it used to float and swing)
  return (
    <Animated.View style={[{ width: 76, height: 76, borderRadius: 26, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', borderWidth: 6, borderColor: C.primarySoft, marginBottom: 6 }]}>
      {children}
    </Animated.View>
  );
}

export function Empty({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: 40, paddingHorizontal: 24 }}>
      {icon && <FloatIcon>{icon}</FloatIcon>}
      <T v="h3" style={{ textAlign: 'center' }}>{title}</T>
      {body && <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{body}</T>}
      {action}
    </View>
  );
}

/**
 * One component for list states: loading (skeleton/spinner), error with "try again", empty, or the content.
 * Keeps "still loading", "nothing here" and "something went wrong" clearly different.
 */
export function StateView({ loading, error, empty, onRetry, skeleton, emptyView, children }: {
  loading?: boolean; error?: boolean; empty?: boolean; onRetry?: () => void; skeleton?: ReactNode; emptyView?: ReactNode; children?: ReactNode;
}) {
  if (loading) return <>{skeleton ?? <Loading />}</>;
  if (error) return (
    <Empty icon={<CircleAlert size={28} color={C.red} />} title={t('ما قدرنا نحمّل')} body={t('تأكد من الإنترنت وجرّب كمان مرة.')}
      action={onRetry ? <Button kind="soft" title={t('جرّب كمان مرة')} onPress={onRetry} style={{ marginTop: 10, paddingHorizontal: 20 }} /> : undefined} />
  );
  if (empty) return <>{emptyView ?? null}</>;
  return <>{children}</>;
}

/** While a screen loads: pulsing rows in the shape of the content (no spinner). */
export function Loading() {
  return <View style={{ flex: 1, paddingTop: 8 }}><ListSkeleton n={6} /></View>;
}
