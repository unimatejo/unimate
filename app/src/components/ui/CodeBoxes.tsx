import { forwardRef, useImperativeHandle, useRef, type ComponentRef } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { C, F, isDark } from '@/lib/theme';
import { isAR, t } from '@/lib/i18n';

export type CodeBoxesHandle = { shake: () => void; focus: () => void };

/** Six boxes for a 6-digit code (from an email or an authenticator app); calls onComplete when all are typed. */
export const CodeBoxes = forwardRef<CodeBoxesHandle, { value: string; onChange: (v: string) => void; onComplete?: (v: string) => void; label?: string }>(
  function CodeBoxes({ value, onChange, onComplete, label }, ref) {
    const input = useRef<ComponentRef<typeof TextInput>>(null);
    const x = useSharedValue(0);
    const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
    useImperativeHandle(ref, () => ({
      shake: () => { x.value = withSequence(withTiming(10, { duration: 50 }), withTiming(-10, { duration: 50 }), withTiming(6, { duration: 50 }), withTiming(0, { duration: 50 })); },
      focus: () => input.current?.focus(),
    }));
    return (
      <>
        <Pressable onPress={() => input.current?.focus()}>
          <Animated.View style={[{ flexDirection: isAR ? 'row-reverse' : 'row', justifyContent: 'space-between' }, style]}>
            {Array.from({ length: 6 }).map((_, i) => {
              const filled = i < value.length; const focused = i === value.length;
              return (
                <View key={i} style={{ width: 48, height: 60, borderRadius: 16, backgroundColor: C.card, borderWidth: 2, borderColor: focused ? C.primary : filled ? C.ink : C.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>{value[i] ?? ''}</Text>
                </View>
              );
            })}
          </Animated.View>
        </Pressable>
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'}
          ref={input} value={value} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code"
          maxLength={6} onChangeText={(v) => { const c = v.replace(/\D/g, ''); onChange(c); if (c.length === 6) onComplete?.(c); }}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }} accessibilityLabel={label ?? t('رمز التحقق')}
        />
      </>
    );
  });
