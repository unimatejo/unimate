import * as Haptics from 'expo-haptics';
import { Heart, Send } from 'lucide-react-native';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { T, Tap } from '@/components/ui';
import { C, F } from '@/lib/theme';
import { isAR, t, ta } from '@/lib/i18n';

const QUICK_REACTIONS = ['😂', '😮', '😍', '😢', '👏', '🔥', '🎉', '💯'] as const;

export type ReplyBarHandle = { blur: () => void };

/**
 * Instagram's story reply bar: a see-through pill "أرسل رسالة…" with the heart and send icons beside it.
 * While typing a «إرسال» appears inside the pill; focusing shows a row of quick reactions above.
 */
export const StoryReplyBar = forwardRef<ReplyBarHandle, {
  liked: boolean; busy: boolean;
  onLike: () => void; onSend: (text: string) => Promise<boolean>; onReact: (emoji: string) => void;
  onFocusChange: (focused: boolean) => void;
}>(function StoryReplyBar({ liked, busy, onLike, onSend, onReact, onFocusChange }, ref) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  useImperativeHandle(ref, () => ({ blur: () => input.current?.blur() }));
  const has = text.trim().length > 0;

  async function send() {
    if (!has || busy) return;
    const ok = await onSend(text.trim());
    if (ok) { setText(''); input.current?.blur(); }
  }
  // on blur the reactions stay a moment, so a tap on one (which blurs the input first) still lands
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function focus(v: boolean) {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (v) { setFocused(true); onFocusChange(true); return; }
    hideTimer.current = setTimeout(() => { setFocused(false); onFocusChange(false); }, 180);
  }
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  return (
    <View style={{ gap: 14 }}>
      {focused && (
        <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(150)}
          style={{ flexDirection: 'row', justifyContent: 'center', gap: 2 }}>
          {QUICK_REACTIONS.map((e) => (
            <Pressable key={e} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); onReact(e); input.current?.blur(); }}
              accessibilityRole="button" accessibilityLabel={t('ابعت {0}', [e])}
              style={({ pressed }) => ({ width: 44, height: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 22, opacity: pressed ? 0.6 : 1 })}>
              <T style={{ fontSize: 31, lineHeight: 42 }}>{e}</T>
            </Pressable>
          ))}
        </Animated.View>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: focused ? 'rgba(5,8,24,0.45)' : 'rgba(255,255,255,0.06)', paddingStart: 16, paddingEnd: has ? 6 : 16 }}>
          <TextInput ref={input} value={text} onChangeText={setText} onSubmitEditing={send} onFocus={() => focus(true)} onBlur={() => focus(false)}
            placeholder={t('أرسل رسالة')} placeholderTextColor="rgba(255,255,255,0.8)" keyboardAppearance="dark" returnKeyType="send" maxLength={1000} multiline={false}
            accessibilityLabel={t('رد على الستوري')}
            style={{ flex: 1, minHeight: 46, fontFamily: F.body, fontSize: 15, color: '#FFFFFF', textAlign: ta, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) }} />
          {has && (
            <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(120)}>
              <Tap onPress={send} disabled={busy} accessibilityLabel={t('إرسال')} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 19, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.5 : 1 }}>
                <T v="bold" color="#FFFFFF">{t('إرسال')}</T>
              </Tap>
            </Animated.View>
          )}
        </View>
        {!has && (
          <>
            <Tap onPress={onLike} accessibilityLabel={liked ? t('إلغاء الإعجاب') : t('إعجاب')} style={{ width: 46, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Heart size={27} color={liked ? C.pink : '#FFFFFF'} fill={liked ? C.pink : 'none'} />
            </Tap>
            <Tap onPress={() => input.current?.focus()} accessibilityLabel={t('رد بالخاص')} style={{ width: 46, height: 48, alignItems: 'center', justifyContent: 'center' }}>
              <Send size={25} color="#FFFFFF" style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} />
            </Tap>
          </>
        )}
      </View>
    </View>
  );
});

/** A reaction emoji that floats up from the bar and fades, like Instagram's quick reactions. */
export function EmojiBurst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withTiming(1, { duration: 1100, easing: Easing.out(Easing.cubic) });
    const h = setTimeout(onDone, 1150);
    return () => clearTimeout(h);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const items = [0, 1, 2, 3, 4];
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 120, height: 420, alignItems: 'center' }}>
      {items.map((k) => <Floater key={k} k={k} p={p} emoji={emoji} />)}
    </View>
  );
}

function Floater({ k, p, emoji }: { k: number; p: { value: number }; emoji: string }) {
  const dx = (k - 2) * 46 + (k % 2 ? 10 : -10);
  const delay = k * 0.08;
  const a = useAnimatedStyle(() => {
    const v = Math.min(1, Math.max(0, (p.value - delay) / (1 - delay)));
    return { opacity: v < 0.75 ? Math.min(1, v * 4) : (1 - v) * 4, transform: [{ translateY: -v * (300 + k * 18) }, { translateX: dx * v }, { scale: 0.7 + v * 0.6 }] };
  });
  return <Animated.Text style={[{ position: 'absolute', bottom: 0, fontSize: 44 }, a]}>{emoji}</Animated.Text>;
}
