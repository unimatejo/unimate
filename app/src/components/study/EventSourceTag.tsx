import { BadgeCheck, User, Users } from 'lucide-react-native';
import { View } from 'react-native';

import { T } from '@/components/ui';
import { eventSource } from '@/lib/sections';
import { C, F } from '@/lib/theme';

const LOOK = {
  official: { bg: C.greenSoft, fg: C.greenInk, icon: BadgeCheck },
  crowd: { bg: C.orangeSoft, fg: C.orangeInk, icon: Users },
  mine: { bg: C.soft, fg: C.muted, icon: User },
} as const;

/** The small tag on an exam / deadline that says how sure it is: official, from classmates (not official), or yours. */
export function EventSourceTag({ e }: { e: Parameters<typeof eventSource>[0] }) {
  const { trust, label } = eventSource(e);
  const l = LOOK[trust];
  const Icon = l.icon;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', backgroundColor: l.bg, borderRadius: 999, paddingHorizontal: 8, height: 22 }}>
      <Icon size={12} color={l.fg} />
      <T v="tiny" color={l.fg} style={{ fontFamily: F.bodyBold, fontSize: 11 }}>{label}</T>
    </View>
  );
}
