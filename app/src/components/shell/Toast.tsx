import { CheckCircle2, CircleAlert } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/components/ui';
import { C } from '@/lib/theme';
import { subscribeToasts, type ToastItem } from '@/lib/toast';

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const insets = useSafeAreaInsets();
  useEffect(() => subscribeToasts(setItems), []);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, gap: 8, alignItems: 'center' }}>
      {items.map((it) => (
        <Animated.View key={it.id} entering={FadeInUp.duration(240)} exiting={FadeOutUp}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: it.kind === 'error' ? C.red : C.inverse, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }}>
          {it.kind === 'error' ? <CircleAlert size={18} color="#fff" /> : <CheckCircle2 size={18} color={C.onInverse} />}
          <T v="bold" style={{ fontSize: 14, flexShrink: 1 }} color={it.kind === 'error' ? '#fff' : C.onInverse}>{it.text}</T>
        </Animated.View>
      ))}
    </View>
  );
}
