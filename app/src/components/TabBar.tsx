import * as Haptics from 'expo-haptics';
import { CalendarDays, House, Map, User, Users } from 'lucide-react-native';
import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, F } from '@/lib/theme';

const ICONS: Record<string, typeof House> = { index: House, schedule: CalendarDays, community: Users, map: Map, profile: User };
const LABELS: Record<string, string> = { index: 'الرئيسية', schedule: 'الجدول', community: 'المجتمع', map: 'الخريطة', profile: 'حسابي' };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TabBar({ state, emitter, navigateToTab, navigation }: any) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12), backgroundColor: 'rgba(255,255,255,0.97)', borderTopWidth: 1, borderTopColor: C.line }}>
      {state.routes.map((route: { key: string; name: string }, i: number) => {
        const on = state.index === i;
        const Icon = ICONS[route.name] ?? House;
        return (
          <View key={route.key}>
            <Pressable
              accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={LABELS[route.name]}
              onPress={() => {
                Haptics.selectionAsync();
                // expo-router 58 hands the tab bar `emitter` + `navigateToTab`; older versions used `navigation`.
                const ev = (emitter ?? navigation)?.emit?.({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (on || ev?.defaultPrevented) return;
                if (navigateToTab) navigateToTab(route.key);
                else if (navigation?.navigate) navigation.navigate(route.name);
                else router.navigate(`/(tabs)${route.name === 'index' ? '' : '/' + route.name}` as never);
              }}
              style={{ height: 48, minWidth: 48, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: on ? 16 : 0, backgroundColor: on ? C.primary : 'transparent',
                ...(on ? { shadowColor: C.primary, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 } : null) }}
            >
              <Icon size={23} color={on ? C.white : C.muted} strokeWidth={on ? 2.2 : 1.9} />
              {on && <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: C.white }}>{LABELS[route.name]}</Text>}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}
