import type { LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';

import { SheetModal } from '@/components/chat/ChatExtras';
import { T, Tap } from '@/components/ui';
import { C, F } from '@/lib/theme';

export type StoryMenuItem = { key: string; icon: LucideIcon; label: string; onPress: () => void; danger?: boolean };

/**
 * The story's "⋯" sheet (Instagram's): one row per option; the screen decides which options there are.
 * `onClose` is dismissing it (the story plays on); picking a row calls `onPick` instead, and that option decides.
 */
export function StoryMenu({ open, items, onClose, onPick }: { open: boolean; items: StoryMenuItem[]; onClose: () => void; onPick: (it: StoryMenuItem) => void }) {
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 4 }}>
      <View style={{ borderRadius: 18, overflow: 'hidden', backgroundColor: C.soft }}>
        {items.map((it, i) => {
          const Icon = it.icon;
          return (
            <Tap key={it.key} haptic={false} scale={0.99} onPress={() => onPick(it)} accessibilityRole="button"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54, paddingHorizontal: 16, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
              <Icon size={21} color={it.danger ? C.red : C.ink} />
              <T v="bodyMd" color={it.danger ? C.red : C.ink} style={{ flex: 1, fontFamily: F.bodyMd }}>{it.label}</T>
            </Tap>
          );
        })}
      </View>
    </SheetModal>
  );
}
