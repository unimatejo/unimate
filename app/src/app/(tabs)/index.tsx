import { router, useFocusEffect } from 'expo-router';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { LinearGradient } from 'expo-linear-gradient';
import { Bell, CalendarDays, Navigation, Search, Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Linking, ScrollView, View, Platform } from 'react-native';
import Animated, { FadeIn, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { HomeAds } from '@/components/feed/HomeAds';
import { GlyphTile, Wiggle } from '@/components/ui/Glyph';
import { Card, IconButton, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { placeLine, roomRoute, useSchedule } from '@/lib/schedule';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { clock, greeting, isWebUrl } from '@/lib/util';
import { nm, t } from '@/lib/i18n';
import { useScreenTimer } from '@/lib/perf';
import { DEFAULT_QUICK, QUICK } from '@/components/home/quick';
import { featureOn, TONES, useAppContent } from '@/lib/appContent';

function Glow({ color, size, style, dur }: { color: string; size: number; style: object; dur: number }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.inOut(Easing.sin) }), -1, true); }, [t, dur]);
  const a = useAnimatedStyle(() => ({ transform: [{ translateX: t.value * 24 }, { translateY: t.value * 18 }, { scale: 1 + t.value * 0.12 }] }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.55 }, Platform.OS === 'web' ? ({ filter: `blur(${Math.round(size / 5)}px)`, opacity: 0.45 } as object) : null, style, a]} />;
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


/** Home: greeting, sponsored banners, the next class, quick links, the owner's banner and notice. */
export default function Home() {
  const { profile, university } = useAuth();
  const { meetings, next, reload, loading, now } = useSchedule(profile?.id);
  useScreenTimer('home', !loading);
  const [unread, setUnread] = useState(0);
  const today = now.getDay();
  // what the owner set in the admin panel (texts, banner, quick links, features)
  const content = useAppContent();
  const quick = (content.home?.quick?.length
    ? content.home.quick.map((k) => QUICK.find((q) => q.key === k)).filter((q): q is (typeof QUICK)[number] => !!q)
    : [...DEFAULT_QUICK]).filter((q) => !('feature' in q) || featureOn(content, q.feature));
  const first = profile?.full_name?.split(' ')[0] ?? '';
  const hello = content.home?.greeting?.trim() ? content.home.greeting.replace('{name}', first) : `${greeting(now)}${t('،')} ${first}`;
  const banner = content.home?.banner?.on && content.home.banner.title ? content.home.banner : null;
  const notice = content.notice?.on && content.notice.text ? content.notice : null;
  const todays = meetings.filter((m) => m.weekday === today);

  // badge refreshes every time Home comes back into view (e.g. after reading notifications)
  useFocusEffect(useCallback(() => {
    if (!profile) return;
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', profile.id).neq('kind', 'admin_alert').is('read_at', null)
      .then(({ count }) => setUnread(count ?? 0), () => {});
  }, [profile]));

  const nxt = next?.m;
  const mins = next?.mins ?? 0;
  const countdown = mins < 60 ? `${mins}` : mins < 1440 ? `${Math.floor(mins / 60)}` : `${Math.floor(mins / 1440)}`;
  const unit = mins < 60 ? t('دقيقة') : mins < 1440 ? t('ساعة') : t('يوم');

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 18, gap: 18, paddingBottom: 130 }} refreshControl={<PullRefresh onRefresh={reload} />}>
        <Row gap={12}>
          <View accessibilityLabel={t('شعار {0}', [nm(university) ?? t('الجامعة')])} style={{ width: 48, height: 48, borderRadius: 24, padding: 3, backgroundColor: university?.brand_color ?? C.blue }}>
            <View style={{ flex: 1, borderRadius: 21, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
              <T v="tiny" color={university?.brand_color ?? C.blue} style={{ textAlign: 'center', fontFamily: F.title }}>{nm(university)?.replace(t('الجامعة '), '').replace(t('جامعة '), '').slice(0, 6)}</T>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <T v="tiny" color={university?.brand_color ?? C.blue}>{nm(university)}</T>
            <T v="h2" style={{ fontFamily: F.display, fontSize: 22 }}>{hello}</T>
          </View>
          <IconButton label={t('بحث')} onPress={() => router.push('/search')}><Search size={21} color={C.ink} /></IconButton>
          <IconButton label={t('الإشعارات')} badge={unread} onPress={() => router.push('/notifications')}><Wiggle trigger={unread}><Bell size={21} color={C.ink} /></Wiggle></IconButton>
        </Row>

        {notice && (
          <View accessibilityRole="alert" style={{ borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, backgroundColor: TONES[notice.tone ?? 'orange'][0] }}>
            <T v="bold" color="#FFFFFF">{notice.text}</T>
          </View>
        )}

        <HomeAds />

        <Animated.View entering={FadeIn.duration(220)}>
          <View style={{ borderRadius: 30, backgroundColor: '#101633', padding: 20, overflow: 'hidden', gap: 14 }}>
            <Glow color={C.blue} size={260} style={{ top: -120, left: -90 }} dur={8000} />
            <Glow color={C.pink} size={200} style={{ bottom: -100, left: 40 }} dur={10000} />
            {nxt ? (
              <>
                <Row gap={8}><Pulse /><T v="small" color="#C9D1F0">{t('محاضرتك الجاية بعد')}</T></Row>
                <Row gap={8} style={{ alignItems: 'baseline' }}>
                  <T style={{ fontFamily: F.display, fontSize: 60, lineHeight: 72 }} color={C.white}>{countdown}</T>
                  <T v="h3" color={C.white}>{unit}</T>
                </Row>
                <View style={{ gap: 2 }}>
                  <T v="h2" color={C.white}>{nxt.course_name}</T>
                  <T v="small" color="#C9D1F0">{placeLine(nxt)} · {clock(nxt.starts_at)}</T>
                </View>
                <Row gap={8}>
                  <Tap onPress={() => router.push(roomRoute(nxt))}
                    style={{ flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                    <Navigation size={18} color="#0E1430" /><T v="bold" color="#0E1430">{t('وديني عالقاعة')}</T>
                  </Tap>
                  <Tap onPress={() => router.push('/(tabs)/schedule')} accessibilityLabel={t('جدول اليوم')}
                    style={{ width: 48, minHeight: 48, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
                    <CalendarDays size={20} color={C.white} />
                  </Tap>
                </Row>
              </>
            ) : (
              <View style={{ gap: 8 }}>
                <T v="h2" color={C.white}>{t('جدولك بيطلع هون')}</T>
                <T v="small" color="#C9D1F0">{t('أول ما تنضاف موادك من حسابك الجامعي، بتشوف محاضرتك الجاية مع العد التنازلي والقاعة.')}</T>
                <Tap onPress={() => router.push('/(tabs)/schedule')} style={{ alignSelf: 'flex-start', marginTop: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
                  <T v="bold" color="#0E1430">{t('افتح الجدول')}</T>
                </Tap>
              </View>
            )}
          </View>
        </Animated.View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 }}>
          {quick.map((q, i) => (
            <Tap key={q.label} scale={0.88} onPress={() => router.push(q.to as never)} style={{ width: '25%', alignItems: 'center', gap: 8 }} accessibilityLabel={q.label}>
              <GlyphTile icon={q.icon} colors={q.g} size={58} pop delay={i * 50} live={i === 0} />
              <T v="tiny" style={{ textAlign: 'center' }}>{q.label}</T>
            </Tap>
          ))}
        </View>

        {banner && (
          <Tap disabled={!banner.link?.trim()} scale={0.98} style={{ borderRadius: 24, overflow: 'hidden' }}
            onPress={() => { const l = banner.link?.trim(); if (!l) return; if (l.startsWith('/')) router.push(l as never); else if (isWebUrl(l)) Linking.openURL(l).catch(() => {}); }}>
            <LinearGradient colors={TONES[banner.tone ?? 'blue']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 4 }}>
              <T v="h3" color="#FFFFFF">{banner.title}</T>
              {banner.body ? <T v="small" color="rgba(255,255,255,0.9)">{banner.body}</T> : null}
            </LinearGradient>
          </Tap>
        )}

        <Animated.View entering={FadeIn.delay(160).duration(220)}>
          <Card>
            <Row style={{ justifyContent: 'space-between', marginBottom: 6 }}>
              <T v="h3">{t('اليوم')}</T>
              <Tap onPress={() => router.push('/(tabs)/schedule')}><T v="small" color={C.blue}>{t('الجدول كامل')}</T></Tap>
            </Row>
            {todays.length === 0 ? <T v="small" color={C.muted}>{t('ما عندك محاضرات اليوم.')}</T> : todays.map((m) => (
              <Row key={m.id} gap={12} style={{ minHeight: 54 }}>
                <View style={{ width: 4, height: 34, borderRadius: 2, backgroundColor: m.kind === 'lab' ? C.green : m.kind === 'online' ? C.violet : m.kind === 'blended' ? C.sky : C.blue }} />
                <View style={{ flex: 1 }}>
                  <T v="bold">{m.course_name}</T>
                  <T v="tiny" color={C.muted}>{placeLine(m)}</T>
                </View>
                <T v="h3" color={C.ink2}>{clock(m.starts_at)}</T>
              </Row>
            ))}
          </Card>
        </Animated.View>

        <Tap onPress={() => router.push('/(tabs)/community')} scale={0.98} style={{ borderRadius: 24, overflow: 'hidden' }}>
          <LinearGradient colors={['#8B5CF6', '#EC4899']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <GlyphTile icon={Users} colors={['rgba(255,255,255,0.35)', 'rgba(255,255,255,0.15)']} size={48} live />
            <View style={{ flex: 1 }}>
              <T v="bold" color={C.white}>{t('مجتمع')} {nm(university)?.replace(t('الجامعة '), '').replace(t('جامعة '), '') ?? t('جامعتك')}</T>
              <T v="small" color="#FBE7FF">{t('منشورات، قصص وجروبات كليتك ودفعتك')}</T>
            </View>
          </LinearGradient>
        </Tap>
      </ScrollView>
    </Screen>
  );
}
