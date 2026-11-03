import * as Haptics from 'expo-haptics';
import { CalendarDays, House, Map, User, Users } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/lib/theme';

const ICONS: Record<string, typeof House> = { index: House, schedule: CalendarDays, community: Users, map: Map, profile: User };
const LABELS: Record<string, string> = { index: 'الرئيسية', schedule: 'الجدول', community: 'المجتمع', map: 'الخريطة', profile: 'حسابي' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TabBar({ state, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: C.line }}>
      {state.routes.map((route: { key: string; name: string }, i: number) => {
        const on = state.index === i;
        const Icon = ICONS[route.name] ?? House;
        return (
          <Animated.View key={route.key} layout={LinearTransition.springify().damping(16)}>
            <Pressable
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={LABELS[route.name]}
              onPress={() => {
                Haptics.selectionAsync();
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!on && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={{ height: 48, minWidth: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: on ? 16 : 0, backgroundColor: on ? C.primary : 'transparent',
                ...(on ? { shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : null) }}
            >
              <Icon size={23} color={on ? C.white : C.muted} strokeWidth={on ? 2.2 : 1.9} />
              {on && <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: C.white }}>{LABELS[route.name]}</Text>}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}
