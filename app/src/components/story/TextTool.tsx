import { useEffect, useRef } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ColorRow } from './ColorRow';

import { StyledText } from './StickerBody';
import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';
import type { Overlay, TextStyle } from '@/lib/storyOverlay';

export type TextDraft = { id?: string; text: string; color: string; bg: Overlay['bg']; style: TextStyle; align: NonNullable<Overlay['align']>; size: number };


/** the text grows softly into place (no bounce) */
const grow = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.86 }] },
    animations: { opacity: withTiming(1, { duration: 180 }), transform: [{ scale: withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }) }] },
  };
};

/** Instagram's text screen: dimmed story, keyboard up, looks on top, colours under, size slider on the side. */
/**
 * Writing on a story, kept simple: the story dims, the keyboard comes up, you type, pick a colour, tap «تم».
 * Drag the text on the story afterwards to move it, pinch to resize, tap it to change it.
 */
export function TextTool({ draft, width, onChange, onDone }: {
  draft: TextDraft | null; width: number; onChange: (d: TextDraft) => void; onDone: () => void;
}) {
  const insets = useSafeAreaInsets();
  const input = useRef<{ focus: () => void } | null>(null);
  const open = !!draft;
  // the modal takes focus when it opens (web), so put the caret in the text right after
  useEffect(() => { if (!open) return; const h = setTimeout(() => input.current?.focus(), 80); return () => clearTimeout(h); }, [open]);
  if (!draft) return null;
  const preview: Overlay = { id: 'p', kind: 'text', text: draft.text || ' ', x: 0.5, y: 0.5, size: draft.size, scale: 1, rotation: 0, color: draft.color, bg: draft.bg, font: 'display', style: draft.style, align: 'center' };

  return (
    <Modal visible transparent animationType="none" onRequestClose={onDone} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View entering={FadeIn.duration(200)} pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.62)' }} />
        <View style={{ flex: 1, paddingTop: insets.top + 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12 }}>
            <Pressable onPress={onDone} accessibilityRole="button" style={{ minHeight: 44, paddingHorizontal: 16, justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 17, color: '#fff' }}>{t('تم')}</Text>
            </Pressable>
          </View>

          {/* the text, live in its look */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
            <Animated.View entering={grow}>
              <View pointerEvents="none" style={{ opacity: draft.text ? 1 : 0 }}><StyledText o={preview} fs={draft.size * width} width={width} /></View>
              {/* the real input sits on top, transparent, so the caret is where the text is */}
              <TextInput ref={input as never} autoFocus multiline value={draft.text} onChangeText={(v) => onChange({ ...draft, text: v.slice(0, 220) })} placeholder={t('اكتب…')} placeholderTextColor="rgba(255,255,255,0.65)" keyboardAppearance="dark"
                style={{ position: draft.text ? 'absolute' : 'relative', top: 0, left: 0, right: 0, bottom: 0, minWidth: 140, textAlign: 'center', fontFamily: F.display, fontSize: draft.size * width, color: 'transparent', ...(Platform.OS === 'web' ? { outlineStyle: 'none', caretColor: '#fff' } as object : {}) }}
                selectionColor="#FFFFFF" />
            </Animated.View>
          </View>

          {/* colours */}
          <View style={{ paddingBottom: insets.bottom + 10 }}><ColorRow value={draft.color} onChange={(c) => onChange({ ...draft, color: c })} /></View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
