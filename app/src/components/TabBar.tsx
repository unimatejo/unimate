import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { CalendarDays, House, MessageCircle, User, Users } from 'lucide-react-native';
import { useEffect } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { C, F, isDark } from '@/lib/theme';
import { useUnreadMessages } from '@/lib/unread';
import { t } from '@/lib/i18n';

const ICONS: Record<string, typeof House> = { index: House, schedule: CalendarDays, community: Users, inbox: MessageCircle, profile: User };
const LABELS: Record<string, string> = { index: t('الرئيسية'), schedule: t('الجدول'), community: t('المجتمع'), inbox: t('الرسائل'), profile: t('حسابي') };
const COLORS: Record<string, [string, string]> = {
  index: ['#6E95FF', '#2E5BFF'], schedule: ['#FFB86B', '#FF6B2C'], community: ['#FF8FB1', '#E0306B'], inbox: ['#5EE3A1', '#0E9F6E'], profile: ['#B794FF', '#7C3AED'],
};

function TabItem({ name, on, onPress, badge = 0 }: { name: string; on: boolean; onPress: () => void; badge?: number }) {
  const v = useSharedValue(on ? 1 : 0);
  const jump = useSharedValue(0);
  useEffect(() => {
    v.value = withSpring(on ? 1 : 0, { damping: 15, stiffness: 190 });
    if (on) jump.value = withSequence(withTiming(1, { duration: 140 }), withSpring(0, { damping: 6, stiffness: 220 }));
  }, [on, v, jump]);
  const pill = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: interpolate(v.value, [0, 1], [0.5, 1]) }] }));
  const icon = useAnimatedStyle(() => ({ transform: [{ translateY: -jump.value * 7 }, { scale: 1 + jump.value * 0.2 }, { rotate: `${jump.value * -10}deg` }] }));
  const label = useAnimatedStyle(() => ({ opacity: v.value, maxWidth: interpolate(v.value, [0, 1], [0, 90]), marginStart: interpolate(v.value, [0, 1], [0, 7]) }));
  const Icon = ICONS[name] ?? House;
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={LABELS[name]}
      style={{ height: 50, minWidth: 50, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: on ? 14 : 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 18, overflow: 'hidden', shadowColor: COLORS[name][1], shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }, pill]}>
        <LinearGradient colors={COLORS[name]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 18 }} />
      </Animated.View>
      <Animated.View style={icon}><Icon size={23} color={on ? C.white : C.faint} strokeWidth={on ? 2.4 : 2} fill={on ? 'rgba(255,255,255,0.22)' : 'none'} /></Animated.View>
      {badge > 0 && (
        <View style={{ position: 'absolute', top: 4, right: on ? 4 : 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.pink, borderWidth: 2, borderColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text style={{ fontFamily: F.bodyBold, fontSize: 10, color: '#fff' }}>{badge > 9 ? '9+' : badge}</Animated.Text>
        </View>
      )}
      <Animated.Text numberOfLines={1} style={[{ fontFamily: F.bodyBold, fontSize: 13, color: C.white, overflow: 'hidden' }, label]}>{LABELS[name]}</Animated.Text>
    </Pressable>
  );
}

/** Floating glass tab bar; the active tab gets its own gradient color and the icon jumps. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TabBar({ state, emitter, navigateToTab, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const unread = useUnreadMessages(profile?.id);
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingBottom: Math.max(insets.bottom - 6, 10) }}>
      <View style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.7)', shadowColor: isDark ? '#000' : '#1B2250', shadowOpacity: isDark ? 0.6 : 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12, backgroundColor: Platform.OS === 'android' ? C.glass : 'transparent' }}>
        {Platform.OS === 'ios' && <BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} />}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 7, backgroundColor: C.glass }}>
          {state.routes.map((route: { key: string; name: string }, i: number) => {
            const on = state.index === i;
            return (
              <TabItem key={route.key} name={route.name} on={on} badge={route.name === 'inbox' ? unread : 0} onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                const ev = (emitter ?? navigation)?.emit?.({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (on || ev?.defaultPrevented) return;
                if (navigateToTab) navigateToTab(route.key);
                else if (navigation?.navigate) navigation.navigate(route.name);
                else router.navigate(`/(tabs)${route.name === 'index' ? '' : '/' + route.name}` as never);
              }} />
            );
          })}
        </View>
      </View>
    </View>
  );
}
