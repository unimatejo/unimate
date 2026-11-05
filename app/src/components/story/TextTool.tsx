import { AlignCenter, AlignLeft, AlignRight, AtSign, MapPin } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorRow } from './ColorRow';

import { StyledText } from './StickerBody';
import { VSlider } from './VSlider';
import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';
import type { Overlay, TextStyle } from '@/lib/storyOverlay';

export type TextDraft = { id?: string; text: string; color: string; bg: Overlay['bg']; style: TextStyle; align: NonNullable<Overlay['align']>; size: number };

const STYLES: [TextStyle, string][] = [
  ['classic', t('كلاسيك')], ['poster', t('بوستر')], ['bubble', t('فقاعة')], ['neon', t('نيون')], ['typewriter', t('آلة كاتبة')], ['squeeze', t('مضغوط')],
];

/** the text grows softly into place (no bounce) */
const grow = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.86 }] },
    animations: { opacity: withTiming(1, { duration: 180 }), transform: [{ scale: withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }) }] },
  };
};

/** Instagram's text screen: dimmed story, keyboard up, looks on top, colours under, size slider on the side. */
export function TextTool({ draft, width, onChange, onDone, onMention, onPlace }: {
  draft: TextDraft | null; width: number; onChange: (d: TextDraft) => void; onDone: () => void; onMention: () => void; onPlace: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [colors, setColors] = useState(true);
  const input = useRef<{ focus: () => void } | null>(null);
  const open = !!draft;
  // the modal takes focus when it opens (web), so put the caret in the text right after
  useEffect(() => { if (!open) return; const h = setTimeout(() => input.current?.focus(), 80); return () => clearTimeout(h); }, [open]);
  if (!draft) return null;
  const preview: Overlay = { id: 'p', kind: 'text', text: draft.text || ' ', x: 0.5, y: 0.5, size: draft.size, scale: 1, rotation: 0, color: draft.color, bg: draft.bg, font: 'display', style: draft.style, align: draft.align };
  const AlignIcon = draft.align === 'left' ? AlignLeft : draft.align === 'right' ? AlignRight : AlignCenter;
  const pill = (on: boolean) => ({ minHeight: 34, paddingHorizontal: 14, borderRadius: 17, alignItems: 'center' as const, justifyContent: 'center' as const, backgroundColor: on ? '#FFFFFF' : 'rgba(255,255,255,0.14)' });

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
        <View style={{ flex: 1, paddingTop: insets.top + 6 }}>
          {/* top: style, colour / alignment / background toggles, done */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12 }}>
            <Pressable onPress={() => setColors((c) => !c)} accessibilityLabel={t('الألوان')} style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#fff', backgroundColor: draft.color }} />
            </Pressable>
            <Pressable onPress={() => onChange({ ...draft, align: draft.align === 'center' ? (Platform.OS === 'web' ? 'right' : 'left') : draft.align === 'right' ? 'left' : draft.align === 'left' ? 'center' : 'center' })} accessibilityLabel={t('المحاذاة')}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}><AlignIcon size={22} color="#fff" /></Pressable>
            <Pressable onPress={() => onChange({ ...draft, bg: draft.bg === 'none' ? 'solid' : draft.bg === 'solid' ? 'soft' : 'none' })} accessibilityLabel={t('الخلفية')}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ paddingHorizontal: 5, borderRadius: 5, borderWidth: 1.5, borderColor: '#fff', backgroundColor: draft.bg === 'solid' ? '#fff' : draft.bg === 'soft' ? 'rgba(255,255,255,0.35)' : 'transparent' }}>
                <Text style={{ fontFamily: F.title, fontSize: 14, color: draft.bg === 'solid' ? '#000' : '#fff' }}>A</Text>
              </View>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 40, paddingHorizontal: 14, justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: '#fff' }}>{t('تم')}</Text>
            </Pressable>
          </View>

          {/* the text, live in its look */}
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
            <VSlider value={(draft.size - 0.04) / 0.12} onChange={(v) => onChange({ ...draft, size: 0.04 + v * 0.12 })} height={220} />
            <View style={{ flex: 1, alignItems: draft.align === 'center' ? 'center' : draft.align === 'right' ? 'flex-end' : 'flex-start', justifyContent: 'center', paddingHorizontal: 16 }}>
              <Animated.View entering={grow}>
                <View pointerEvents="none" style={{ opacity: draft.text ? 1 : 0 }}><StyledText o={preview} fs={draft.size * width} width={width} /></View>
                {/* the real input sits on top, transparent, so the caret is where the text is */}
                <TextInput ref={input as never} autoFocus multiline value={draft.text} onChangeText={(v) => onChange({ ...draft, text: v.slice(0, 220) })} placeholder={t('اكتب…')} placeholderTextColor="rgba(255,255,255,0.65)" keyboardAppearance="dark"
                  style={{ position: draft.text ? 'absolute' : 'relative', top: 0, left: 0, right: 0, bottom: 0, minWidth: 140, textAlign: draft.align, fontFamily: F.display, fontSize: draft.size * width, color: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none', caretColor: '#fff' } as object : {}) }}
                  selectionColor="#FFFFFF" />
              </Animated.View>
            </View>
          </View>

          {/* looks */}
          <ScrollView horizontal style={{ flexGrow: 0 }} showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingBottom: 10 }}>
            {STYLES.map(([s, l]) => (
              <Pressable key={s} onPress={() => onChange({ ...draft, style: s, bg: s === 'bubble' ? 'solid' : draft.bg })} accessibilityState={{ selected: draft.style === s }} style={pill(draft.style === s)}>
                <Text style={{ fontFamily: s === 'typewriter' ? (Platform.OS === 'web' ? 'monospace' : 'Courier') : s === 'classic' ? F.bodyBold : F.display, fontSize: 13, color: draft.style === s ? '#000' : '#fff' }}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {/* colours, or Instagram's mention / location chips */}
          {colors ? <View style={{ paddingBottom: 6 }}><ColorRow value={draft.color} onChange={(c) => onChange({ ...draft, color: c })} /></View> : null}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, paddingBottom: insets.bottom + 10 }}>
            <Pressable onPress={onMention} style={[pill(false), { flexDirection: 'row', gap: 6 }]}><AtSign size={15} color="#fff" /><Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: '#fff' }}>{t('منشن')}</Text></Pressable>
            <Pressable onPress={onPlace} style={[pill(false), { flexDirection: 'row', gap: 6 }]}><MapPin size={15} color="#fff" /><Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: '#fff' }}>{t('الموقع')}</Text></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
