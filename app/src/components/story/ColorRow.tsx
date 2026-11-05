import { LinearGradient } from 'expo-linear-gradient';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { t } from '@/lib/i18n';
import { TEXT_COLORS } from '@/lib/storyOverlay';

/** white → the rainbow → black, so any colour is one drag away */
const STOPS = ['#FFFFFF', '#FF0000', '#FF8A00', '#FFE600', '#34C759', '#00C2FF', '#2E5BFF', '#7C3AED', '#FF2DAA', '#000000'];
const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** The colour at 0..1 along the spectrum bar. */
export function colorAt(p: number) {
  const f = Math.min(1, Math.max(0, p)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(f)), k = f - i;
  const a = rgb(STOPS[i]), b = rgb(STOPS[i + 1]);
  return `#${hex(a[0] + (b[0] - a[0]) * k)}${hex(a[1] + (b[1] - a[1]) * k)}${hex(a[2] + (b[2] - a[2]) * k)}`.toUpperCase();
}

/**
 * Instagram's colour row: the usual swatches, then a rainbow button that opens a spectrum bar —
 * drag along it to pick any colour (shown live in the bubble above your finger).
 */
export function ColorRow({ value, onChange, size = 30 }: { value: string; onChange: (c: string) => void; size?: number }) {
  const [spectrum, setSpectrum] = useState(false);
  const [w, setW] = useState(1);
  const [pos, setPos] = useState<number | null>(null);
  const pick = (x: number) => { const p = Math.min(1, Math.max(0, x / w)); setPos(p); onChange(colorAt(p)); };
  const custom = !TEXT_COLORS.includes(value);

  if (spectrum) return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, height: size + 14, direction: 'ltr' }}>
      <Pressable onPress={() => setSpectrum(false)} accessibilityLabel={t('رجوع للألوان')} hitSlop={8}
        style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 2, borderColor: '#fff', backgroundColor: value, alignItems: 'center', justifyContent: 'center' }}>
        <X size={14} color={value === '#FFFFFF' ? '#000' : '#fff'} />
      </Pressable>
      <View style={{ flex: 1, height: size, justifyContent: 'center' }} onLayout={(e) => setW(e.nativeEvent.layout.width || 1)}
        onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)} onResponderMove={(e) => pick(e.nativeEvent.locationX)} onResponderRelease={() => setPos(null)}>
        <LinearGradient pointerEvents="none" colors={STOPS as unknown as [string, string, ...string[]]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
          style={{ height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)' }} />
        {pos != null && (
          <View pointerEvents="none" style={{ position: 'absolute', left: pos * w - 16, top: -38, width: 32, height: 32, borderRadius: 16, borderWidth: 3, borderColor: '#fff', backgroundColor: value }} />
        )}
      </View>
    </Animated.View>
  );

  return (
    <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always"
      contentContainerStyle={{ gap: 10, paddingHorizontal: 14, alignItems: 'center', height: size + 14 }}>
      <Pressable onPress={() => setSpectrum(true)} accessibilityLabel={t('لون مخصص')} hitSlop={4}>
        <LinearGradient colors={['#FF0000', '#FFE600', '#34C759', '#00C2FF', '#7C3AED', '#FF2DAA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, borderWidth: custom ? 3 : 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          {custom ? <View style={{ width: size * 0.45, height: size * 0.45, borderRadius: size, backgroundColor: value, borderWidth: 1.5, borderColor: '#fff' }} /> : null}
        </LinearGradient>
      </Pressable>
      {TEXT_COLORS.map((c) => (
        <Pressable key={c} onPress={() => onChange(c)} accessibilityLabel={c} accessibilityState={{ selected: value === c }}
          style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c, borderWidth: value === c ? 3 : 2, borderColor: '#fff', transform: [{ scale: value === c ? 1.12 : 1 }] }} />
      ))}
    </ScrollView>
  );
}
