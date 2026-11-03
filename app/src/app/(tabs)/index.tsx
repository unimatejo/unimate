import { router } from 'expo-router';
import { Bell, BookOpen, CalendarDays, MapPin, Navigation, Repeat, Search, ShoppingBag } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import Animated, { Easing, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { AdBanner } from '@/components/AdBanner';
import { Avatar, Card, IconButton, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { placeLine, useSchedule } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { clock, greeting } from '@/lib/util';

function Glow({ color, size, style, dur }: { color: string; size: number; style: object; dur: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true); }, [t, dur]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 24 }, { translateY: t.value * 18 }, { scale: 1 + t.value * 0.12 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.55 }, style, a]} />;
}

function Pulse() {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: 1600 }), -1, false); }, [t]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.6 * (1 - t.value), transform: [{ scale: 1 + t.value * 1.6 }] }));
  return (
    <View style={{ width: 10, height: 10 }}>
      <Animated.View style={[{ position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: C.green }, ring]} />
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: C.green }} />
    </View>
  );
}

const QUICK = [
  { label: 'وين قاعتي', icon: MapPin, bg: '#E3F8F1', fg: '#0B8A64', to: '/(tabs)/map' },
  { label: 'تبديل شعب', icon: Repeat, bg: C.primarySoft, fg: C.primary, to: '/swap' },
  { label: 'ملخصات', icon: BookOpen, bg: '#EFE8FF', fg: '#6A3BE0', to: '/section/summaries' },
  { label: 'السوق', icon: ShoppingBag, bg: '#FFE9EE', fg: '#C7254A', to: '/section/market' },
] as const;

export default function Home() {
  const { profile, university } = useAuth();
  const { meetings, next, reload, loading } = useSchedule(profile?.id);
  const [unread, setUnread] = useState(0);
  const today = new Date().getDay();
  const todays = meetings.filter((m) => m.weekday === today);

  useEffect(() => {
    if (!profile) return;
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', (profile?.id ?? '')).is('read_at', null)
      .then(({ count }) => setUnread(count ?? 0));
  }, [profile]);

  const nm = next?.m;
  const mins = next?.mins ?? 0;
  const countdown = mins < 60 ? `${mins}` : mins < 1440 ? `${Math.floor(mins / 60)}` : `${Math.floor(mins / 1440)}`;
  const unit = mins < 60 ? 'دقيقة' : mins < 1440 ? 'ساعة' : 'يوم';

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 30 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} />}>
        <Row gap={12}>
          <View accessibilityLabel={`شعار ${university?.name_ar ?? 'الجامعة'}`} style={{ width: 48, height: 48, borderRadius: 24, padding: 3, backgroundColor: university?.brand_color ?? C.primary }}>
            <View style={{ flex: 1, borderRadius: 21, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }}>
              <T v="tiny" color={university?.brand_color ?? C.primary} style={{ textAlign: 'center', fontFamily: F.title }}>{university?.name_ar?.replace('الجامعة ', '').replace('جامعة ', '').slice(0, 6)}</T>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <T v="tiny" color={university?.brand_color ?? C.primary}>{university?.name_ar}</T>
            <T v="h2" style={{ fontFamily: F.display, fontSize: 22 }}>{greeting()}، {profile?.full_name?.split(' ')[0]}</T>
          </View>
          <IconButton label="بحث" onPress={() => router.push('/search')}><Search size={21} color={C.ink} /></IconButton>
          <IconButton label="الإشعارات" badge={unread} onPress={() => router.push('/notifications')}><Bell size={21} color={C.ink} /></IconButton>
        </Row>

        <Animated.View entering={FadeInDown.duration(500)}>
          <View style={{ borderRadius: 30, backgroundColor: C.ink, padding: 20, overflow: 'hidden', gap: 14 }}>
            <Glow color={C.primary} size={260} style={{ top: -120, left: -90 }} dur={8000} />
            <Glow color={C.pink} size={200} style={{ bottom: -100, left: 40 }} dur={10000} />
            {nm ? (
              <>
                <Row gap={8}><Pulse /><T v="small" color="#C9D1F0">محاضرتك الجاية بعد</T></Row>
                <Row gap={8} style={{ alignItems: 'baseline' }}>
                  <T style={{ fontFamily: F.display, fontSize: 60, lineHeight: 72 }} color={C.white}>{countdown}</T>
                  <T v="h3" color={C.white}>{unit}</T>
                </Row>
                <View style={{ gap: 2 }}>
                  <T v="h2" color={C.white}>{nm.course_name}</T>
                  <T v="small" color="#C9D1F0">{placeLine(nm)} · {clock(nm.starts_at)}</T>
                </View>
                <Row gap={8}>
                  <Tap onPress={() => router.push({ pathname: '/(tabs)/map', params: { building: nm.building_id ?? '' } })}
                    style={{ flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Navigation size={18} color={C.ink} /><T v="bold">وديني عالقاعة</T>
                  </Tap>
                  <Tap onPress={() => router.push('/(tabs)/schedule')} accessibilityLabel="جدول اليوم"
                    style={{ width: 48, minHeight: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                    <CalendarDays size={20} color={C.white} />
                  </Tap>
                </Row>
              </>
            ) : (
              <View style={{ gap: 8 }}>
                <T v="h2" color={C.white}>جدولك بيطلع هون</T>
                <T v="small" color="#C9D1F0">أول ما تنضاف موادك من حسابك الجامعي، بتشوف محاضرتك الجاية مع العد التنازلي والقاعة.</T>
                <Tap onPress={() => router.push('/(tabs)/schedule')} style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: C.white, justifyContent: 'center' }}>
                  <T v="bold">افتح الجدول</T>
                </Tap>
              </View>
            )}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(80).duration(500)} style={{ flexDirection: 'row', gap: 10 }}>
          {QUICK.map((q) => (
            <Tap key={q.label} onPress={() => router.push(q.to as never)} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
              <View style={{ width: 62, height: 62, borderRadius: 22, backgroundColor: q.bg, alignItems: 'center', justifyContent: 'center' }}>
                <q.icon size={24} color={q.fg} />
              </View>
              <T v="tiny" style={{ textAlign: 'center' }}>{q.label}</T>
            </Tap>
          ))}
        </Animated.View>

        <AdBanner placement="home_banner" />

        <Animated.View entering={FadeInDown.delay(160).duration(500)}>
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <T v="h3">اليوم</T>
              <Tap onPress={() => router.push('/(tabs)/schedule')}><T v="small" color={C.primary}>الجدول كامل</T></Tap>
            </Row>
            {todays.length === 0 ? <T v="small" color={C.muted}>ما عندك محاضرات اليوم.</T> : todays.map((m) => (
              <Row key={m.id} gap={12} style={{ minHeight: 54 }}>
                <View style={{ width: 4, height: 34, borderRadius: 2, backgroundColor: m.kind === 'lab' ? C.green : m.kind === 'online' ? C.violet : C.primary }} />
                <View style={{ flex: 1 }}>
                  <T v="bold">{m.course_name}</T>
                  <T v="tiny" color={C.muted}>{placeLine(m)}</T>
                </View>
                <T v="h3" color={C.ink2}>{clock(m.starts_at)}</T>
              </Row>
            ))}
          </Card>
        </Animated.View>

        <Tap onPress={() => router.push('/study')} style={{ borderRadius: 22, backgroundColor: C.violet, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar id="study" name="د" size={44} />
          <View style={{ flex: 1 }}>
            <T v="bold" color={C.white}>شريك دراسة</T>
            <T v="small" color="#E9E2FF">زملاء بموادك بدهم يدرسوا هالأسبوع</T>
          </View>
        </Tap>
      </ScrollView>
    </Screen>
  );
}
