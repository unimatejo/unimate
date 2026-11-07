import { Pin } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { T, Tap } from '@/components/ui';
import { messagePreview } from '@/lib/chatPreview';
import { t } from '@/lib/i18n';
import { C } from '@/lib/theme';
import type { Message } from '@/lib/types';

/**
 * The chat's pinned messages under the header, newest first, like WhatsApp: one at a time, tap to go to it and
 * show the next one. The small bars on the side say how many there are and which one is shown.
 */
export function PinnedBar({ pins, names, onOpen }: { pins: Message[]; names: Record<string, string>; onOpen: (m: Message) => void }) {
  const [i, setI] = useState(0);
  if (!pins.length) return null;
  const at = i % pins.length;
  const m = pins[at];
  const who = m.sender_id ? names[m.sender_id] : null;
  return (
    <Animated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(120)} style={{ borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: C.bg }}>
      <Tap haptic={false} scale={0.99} onPress={() => { onOpen(m); setI(at + 1); }}
        accessibilityLabel={t('رسالة مثبّتة {0} من {1}', [at + 1, pins.length])}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingHorizontal: 14, paddingVertical: 8 }}>
        {pins.length > 1 && (
          <View style={{ gap: 2, alignSelf: 'stretch', justifyContent: 'center' }}>
            {pins.map((p, j) => <View key={p.id} style={{ width: 3, flex: 1, maxHeight: 12, borderRadius: 2, backgroundColor: j === at ? C.primary : C.line }} />)}
          </View>
        )}
        <Pin size={16} color={C.primary} style={{ transform: [{ rotate: '45deg' }] }} />
        <View style={{ flex: 1 }}>
          <T v="tiny" color={C.primaryDark} numberOfLines={1}>{who ? t('مثبّتة · {0}', [who]) : t('مثبّتة')}</T>
          <T v="small" numberOfLines={1}>{messagePreview(m) ?? ''}</T>
        </View>
      </Tap>
    </Animated.View>
  );
}
