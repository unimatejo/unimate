import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect } from 'expo-router';
import { ExternalLink, Navigation, Phone, Store } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useSharedValue } from 'react-native-reanimated';

import { Row, T, Tap } from '@/components/ui';
import { CTA_DEFAULT, adAction, liveAds, openAdvertiser, trackAd, type Ad } from '@/lib/ads';
import { isAR, t } from '@/lib/i18n';
import { C, F, shadow } from '@/lib/theme';

const EVERY = 5500;

/** Home's sponsored banners: the best package first, one at a time, sliding on by itself or with a swipe. */
export function HomeAds() {
  const [ads, setAds] = useState<Ad[]>([]);
  const [i, setI] = useState(0);
  const seen = useRef(new Set<string>());
  const dx = useSharedValue(0);

  useEffect(() => {
    let live = true;
    liveAds('home_banner').then((a) => {
      if (!live) return;
      setAds(a);
      a.slice(1).forEach((x) => { if (x.image_url) Image.prefetch(x.image_url).catch(() => {}); });
    });
    return () => { live = false; };
  }, []);

  // one view per banner actually shown (the server keeps one a day per student)
  const ad = ads[i % Math.max(ads.length, 1)];
  useEffect(() => {
    if (ad && !seen.current.has(ad.campaign_id)) { seen.current.add(ad.campaign_id); trackAd(ad.campaign_id, 'impression'); }
  }, [ad]);

  const step = useCallback((d: number) => setI((x) => (ads.length ? (x + d + ads.length) % ads.length : 0)), [ads.length]);

  // slides only while Home is on screen (no work in the background on weak phones)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const restart = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = ads.length > 1 ? setInterval(() => step(1), EVERY) : null;
  }, [ads.length, step]);
  useFocusEffect(useCallback(() => {
    restart();
    return () => { if (timer.current) clearInterval(timer.current); timer.current = null; };
  }, [restart]));

  const swipe = useCallback((dir: number) => { step(dir); restart(); }, [step, restart]);
  const pan = usePanGesture({
    activeOffsetX: [-14, 14],
    failOffsetY: [-12, 12],
    onUpdate: (e) => { 'worklet'; dx.value = e.translationX; },
    onDeactivate: () => {
      'worklet';
      // right to left is "next" in Arabic
      if (Math.abs(dx.value) > 40) runOnJS(swipe)(dx.value > 0 ? 1 : -1);
      dx.value = 0;
    },
  });

  if (!ad) return null;
  return (
    <View style={{ gap: 8 }}>
      <GestureDetector gesture={pan}>
        <Animated.View key={ad.campaign_id} entering={FadeIn.duration(320)}>
          <AdSlide ad={ad} onOpen={() => openAdvertiser(ad)} onAction={() => adAction(ad)} />
        </Animated.View>
      </GestureDetector>
      {ads.length > 1 && (
        <Row gap={6} style={{ justifyContent: 'center' }}>
          {ads.map((x, k) => (
            <Tap key={x.campaign_id} haptic={false} onPress={() => { setI(k); restart(); }} accessibilityLabel={t('إعلان {0} من {1}', [k + 1, ads.length])}
              style={{ paddingVertical: 6, paddingHorizontal: 2 }}>
              <View style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? C.ink : C.line }} />
            </Tap>
          ))}
        </Row>
      )}
    </View>
  );
}

/**
 * One sponsored banner, the way it looks on Home (the admin panel shows the same card as a preview). A photo fills it,
 * or the advertiser's logo on a deep gradient; «ممول» is always on it. The button opens the advertiser's site, walks to
 * them on the campus map or calls them, with the owner's own words on it. A banner designed with its writing on the
 * picture (`show_text` off) shows only the picture, «ممول» and the button.
 */
export function AdSlide({ ad, onOpen, onAction }: { ad: Ad; onOpen?: () => void; onAction?: () => void }) {
  const text = ad.show_text || !ad.image_url;
  const Icon = ad.cta_kind === 'map' ? Navigation : ad.cta_kind === 'call' ? Phone : ExternalLink;
  return (
    <Tap scale={0.98} onPress={onOpen} accessibilityLabel={t('إعلان ممول: {0}', [text ? ad.advertiser_name : `${ad.advertiser_name} · ${ad.title}`])}
      style={[{ borderRadius: 26, overflow: 'hidden', aspectRatio: 2, backgroundColor: '#1B1F3B' }, shadow]}>
      {ad.image_url
        ? (
          <>
            <Image source={{ uri: ad.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={250} cachePolicy="memory-disk" />
            {/* a studio look: the corner behind the name and «ممول» is shaded, the light falls on the rest */}
            <LinearGradient colors={['rgba(8,10,28,0.6)', 'rgba(8,10,28,0)']} start={{ x: isAR ? 1 : 0, y: 0 }} end={{ x: 0.5, y: 0.55 }} style={StyleSheet.absoluteFill} />
          </>
        )
        : (
          <LinearGradient colors={['#2A1E5C', '#3D6BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, { alignItems: 'flex-end', justifyContent: 'center', paddingHorizontal: 22 }]}>
            {/* no photo: the advertiser's logo (or a shop sign) stands in, large, on the far side */}
            <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 34 }}>
              {ad.logo_url
                ? <Image source={{ uri: ad.logo_url }} style={{ width: 80, height: 80, borderRadius: 40 }} />
                : <Store size={42} color="rgba(255,255,255,0.9)" strokeWidth={1.6} />}
            </View>
          </LinearGradient>
        )}
      <LinearGradient colors={text ? ['rgba(8,10,28,0.05)', 'rgba(8,10,28,0.25)', 'rgba(8,10,28,0.88)'] : ['rgba(8,10,28,0)', 'rgba(8,10,28,0)', 'rgba(8,10,28,0.35)']} locations={[0, 0.45, 1]}
        style={{ flex: 1, padding: 14, justifyContent: 'space-between' }}>
        <Row gap={8}>
          {text && ad.logo_url ? <Image source={{ uri: ad.logo_url }} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: '#FFFFFF' }} /> : null}
          {text ? <T v="bold" color="#FFFFFF" numberOfLines={1} style={{ flexShrink: 1, fontSize: 13 }}>{ad.advertiser_name}</T> : <View style={{ flex: 1 }} />}
          <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: text ? 'rgba(255,255,255,0.22)' : 'rgba(8,10,28,0.45)' }}>
            <T v="tiny" color="#FFFFFF">{t('ممول')}</T>
          </View>
        </Row>
        <Row gap={10} style={{ alignItems: 'flex-end' }}>
          <View style={{ flex: 1, gap: 4 }}>
            {text && ad.offer ? (
              <View style={{ alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 9, backgroundColor: '#FACC15' }}>
                <T v="tiny" color="#1A1300" style={{ fontFamily: F.title }} numberOfLines={1}>{ad.offer}</T>
              </View>
            ) : null}
            {text ? <T v="h3" color="#FFFFFF" numberOfLines={2} style={{ fontFamily: F.display, fontSize: 19, lineHeight: 26 }}>{ad.title}</T> : null}
            {text && ad.body ? <T v="tiny" color="rgba(255,255,255,0.85)" numberOfLines={1}>{ad.body}</T> : null}
          </View>
          {ad.cta_kind ? (
            <Tap onPress={onAction} accessibilityRole={ad.cta_kind === 'link' ? 'link' : 'button'} accessibilityLabel={ad.cta_label || CTA_DEFAULT[ad.cta_kind]}
              style={{ minHeight: 42, paddingHorizontal: 14, borderRadius: 14, backgroundColor: '#FFFFFF', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T v="bold" color="#0E1430" style={{ fontSize: 14 }}>{ad.cta_label || CTA_DEFAULT[ad.cta_kind]}</T>
              <Icon size={15} color="#0E1430" />
            </Tap>
          ) : null}
        </Row>
      </LinearGradient>
    </Tap>
  );
}
