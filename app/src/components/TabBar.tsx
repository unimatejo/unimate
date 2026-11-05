import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { CalendarDays, House, MessageCircle, User, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAuth } from '@/lib/auth';
import { C, F, isDark } from '@/lib/theme';
import { useUnreadMessages } from '@/lib/unread';
import { usePresenceTracker } from '@/lib/presence';
import { t } from '@/lib/i18n';

const ICONS: Record<string, typeof House> = { index: House, schedule: CalendarDays, community: Users, inbox: MessageCircle, profile: User };
const LABELS: Record<string, string> = { index: t('الرئيسية'), schedule: t('الجدول'), community: t('المجتمع'), inbox: t('الرسائل'), profile: t('حسابي') };
const COLORS: Record<string, [string, string]> = {
  index: ['#6E95FF', '#2E5BFF'], schedule: ['#FFB86B', '#FF6B2C'], community: ['#FF8FB1', '#E0306B'], inbox: ['#5EE3A1', '#0E9F6E'], profile: ['#B794FF', '#7C3AED'],
};

function TabItem({ name, on, onPress, badge = 0 }: { name: string; on: boolean; onPress: () => void; badge?: number }) {
  const v = useSharedValue(on ? 1 : 0);
  useEffect(() => {
    v.value = withTiming(on ? 1 : 0, { duration: 200 }); // quiet pill fade, no jump
  }, [on, v]);
  const pill = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: interpolate(v.value, [0, 1], [0.92, 1]) }] }));
  const icon = useAnimatedStyle(() => ({}));
  const label = useAnimatedStyle(() => ({ opacity: v.value, maxWidth: interpolate(v.value, [0, 1], [0, 90]), marginStart: interpolate(v.value, [0, 1], [0, 7]) }));
  const Icon = ICONS[name] ?? House;
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={LABELS[name]}
      style={{ height: 50, minWidth: 50, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: on ? 14 : 0 }}>
      <Animated.View style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, borderRadius: 18, overflow: 'hidden', backgroundColor: C.inverse }, pill]} />
      <Animated.View style={icon}><Icon size={23} color={on ? C.onInverse : C.muted} strokeWidth={on ? 2.4 : 2} /></Animated.View>
      {badge > 0 && (
        <View style={{ position: 'absolute', top: 4, right: on ? 4 : 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: C.primary, borderWidth: 2, borderColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Animated.Text style={{ fontFamily: F.bodyBold, fontSize: 10, color: C.onPrimary }}>{badge > 9 ? '9+' : badge}</Animated.Text>
        </View>
      )}
      <Animated.Text numberOfLines={1} style={[{ fontFamily: F.bodyBold, fontSize: 13, color: C.onInverse, overflow: 'hidden' }, label]}>{LABELS[name]}</Animated.Text>
    </Pressable>
  );
}

/** Floating glass tab bar; the active tab gets a solid pill that fades in. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function TabBar({ state, emitter, navigateToTab, navigation }: any) {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const unread = useUnreadMessages(profile?.id);
  usePresenceTracker(profile?.id, profile?.show_activity !== false);
  // get out of the way while typing (search, comments, chat)
  const [kb, setKb] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKb(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKb(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  if (kb) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingBottom: Math.max(insets.bottom - 6, 10) }}>
      <View style={{ borderRadius: 26, overflow: 'hidden', borderWidth: 1, borderColor: isDark ? C.line : 'rgba(255,255,255,0.7)', shadowColor: isDark ? '#000' : '#1B2250', shadowOpacity: isDark ? 0.6 : 0.16, shadowRadius: 22, shadowOffset: { width: 0, height: 10 }, elevation: 12, backgroundColor: Platform.OS === 'android' ? C.glass : 'transparent' }}>
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
