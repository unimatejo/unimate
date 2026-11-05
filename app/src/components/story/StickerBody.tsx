import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Clock, Link2, MapPin } from 'lucide-react-native';
import { memo, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';
import type { Overlay, Stroke, TextStyle } from '@/lib/storyOverlay';

export const isLight = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return ((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114 > 170;
};
const MONO = Platform.OS === 'web' ? 'ui-monospace, Menlo, Consolas, monospace' : Platform.OS === 'ios' ? 'Courier' : 'monospace';

/** Answers to interactive stickers (from story_sticker_results) and what tapping does — only in the viewer. */
export type Live = {
  poll?: { counts: number[]; mine: number | null };
  slider?: { avg: number; count: number; mine: number | null };
  countdown?: { count: number; mine: boolean };
  question?: { count: number };
  author?: boolean;
  onPoll?: (i: number) => void;
  onAsk?: () => void;
  onSlide?: (v: number) => void;
  onRemind?: () => void;
  onAddYours?: () => void;
};

/** A text overlay in one of Instagram's looks. */
export function StyledText({ o, fs, width }: { o: Overlay; fs: number; width: number }) {
  const style: TextStyle = o.style ?? (o.font === 'mono' ? 'typewriter' : o.font === 'body' ? 'classic' : 'poster');
  const solid = o.bg === 'solid' || style === 'bubble', soft = o.bg === 'soft';
  const fg = solid ? (isLight(o.color) ? '#0E1430' : '#FFFFFF') : o.color;
  const align = o.align ?? 'center';
  const font = style === 'typewriter' ? MONO : style === 'classic' ? F.bodyBold : F.display;
  const size = style === 'poster' ? fs * 1.12 : fs;
  const glow = style === 'neon';
  return (
    <View style={{
      backgroundColor: solid ? o.color : soft ? 'rgba(0,0,0,0.5)' : 'transparent', borderRadius: style === 'bubble' ? size * 0.9 : size * 0.3,
      paddingHorizontal: solid || soft ? size * 0.5 : 0, paddingVertical: solid || soft ? size * 0.18 : 0, maxWidth: width * 0.92,
      transform: style === 'squeeze' ? [{ scaleX: 0.84 }] : undefined,
    }}>
      <Text style={{
        fontFamily: font, fontSize: size, lineHeight: size * (style === 'poster' ? 1.18 : 1.38), color: glow ? '#FFFFFF' : fg, textAlign: align,
        letterSpacing: style === 'squeeze' ? -0.6 : style === 'typewriter' ? 0.5 : 0,
        textShadowColor: glow ? o.color : solid || soft ? 'transparent' : 'rgba(0,0,0,0.35)', textShadowRadius: glow ? size * 0.55 : solid || soft ? 0 : 6,
        textShadowOffset: { width: 0, height: glow ? 0 : 1 },
      }}>{o.text}</Text>
    </View>
  );
}

function pct(counts: number[] | undefined, i: number) {
  const total = (counts ?? []).reduce((a, b) => a + b, 0);
  return total ? Math.round(((counts?.[i] ?? 0) / total) * 100) : 0;
}

function useNow(on: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!on) return; const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, [on]);
  return now;
}

/** How each sticker kind looks (no position). Same component in the editor and the viewer, so they match. */
export function StickerBody({ o, width, live }: { o: Overlay; width: number; live?: Live }) {
  const fs = Math.max(10, o.size * width);
  const card = width * 0.66;
  const now = useNow(o.kind === 'countdown');

  switch (o.kind) {
    case 'emoji':
      return <Text style={{ fontSize: fs * 1.6, lineHeight: fs * 1.9 }}>{o.text}</Text>;
    case 'sticker':
      return o.data?.img ? <Image source={{ uri: o.data.img }} style={{ width: fs * 4, height: fs * 4 }} contentFit="contain" autoplay /> : null;
    case 'photo': {
      // a photo from the gallery, as a white-framed cutout (like Instagram's photo sticker)
      const ar = o.data?.ar ?? 1, pw = width * 0.42;
      return o.data?.img ? (
        <View style={{ padding: pw * 0.035, backgroundColor: '#FFFFFF', borderRadius: pw * 0.08, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10 }}>
          <Image source={{ uri: o.data.img }} style={{ width: pw, height: pw / ar, borderRadius: pw * 0.06 }} contentFit="cover" />
        </View>
      ) : null;
    }
    case 'addyours':
      return (
        <View style={{ width: card * 0.92, borderRadius: 18, backgroundColor: '#FFFFFF', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}>
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, alignItems: 'center', gap: 4 }}>
            <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: '#FF6B4A' }}>{t('دورك')}</Text>
            <Text style={{ fontFamily: F.display, fontSize: fs * 0.95, color: '#0E1430', textAlign: 'center' }}>{o.text || t('شاركنا صورتك')}</Text>
          </View>
          <Pressable disabled={!live?.onAddYours} onPress={live?.onAddYours} accessibilityRole="button" accessibilityLabel={t('ضيف صورتك')}
            style={{ marginHorizontal: 10, marginBottom: 10, minHeight: 40, borderRadius: 12, backgroundColor: '#F2F3F7', flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <Camera size={16} color="#0E1430" />
            <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#0E1430' }}>{t('ضيف صورتك')}</Text>
          </Pressable>
        </View>
      );
    case 'mention':
      return (
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25 }}>
          <Text style={{ fontFamily: F.title, fontSize: fs, color: '#7C3AED', writingDirection: 'ltr' }}>@{o.text.replace(/^@/, '')}</Text>
        </View>
      );
    case 'hashtag':
      return (
        <View style={{ backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25 }}>
          <Text style={{ fontFamily: F.title, fontSize: fs, color: '#FF6B4A' }}>#{o.text.replace(/^#/, '')}</Text>
        </View>
      );
    case 'link':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs * 0.3, backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25, maxWidth: width * 0.8 }}>
          <Link2 size={fs} color="#2E5BFF" />
          <Text numberOfLines={1} style={{ fontFamily: F.title, fontSize: fs * 0.9, color: '#2E5BFF', writingDirection: o.data?.label ? undefined : 'ltr' }}>{o.data?.label || o.text.replace(/^https?:\/\//i, '')}</Text>
        </View>
      );
    case 'time': {
      const look = o.data?.clock ?? 'pill';
      if (look === 'digital') return <Text style={{ fontFamily: F.display, fontSize: fs * 2, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 8, writingDirection: 'ltr' }}>{o.text}</Text>;
      if (look === 'mono') return (
        <View style={{ backgroundColor: '#000000', borderRadius: fs * 0.35, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.2 }}>
          <Text style={{ fontFamily: MONO, fontSize: fs * 1.2, color: '#FFFFFF', writingDirection: 'ltr' }}>{o.text}</Text>
        </View>
      );
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs * 0.3, backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25 }}>
          <Clock size={fs} color="#FF3B5C" />
          <Text style={{ fontFamily: F.title, fontSize: fs, color: '#0E1430', writingDirection: 'ltr' }}>{o.text}</Text>
        </View>
      );
    }
    case 'place':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: fs * 0.3, backgroundColor: '#FFFFFF', borderRadius: fs * 0.5, paddingHorizontal: fs * 0.55, paddingVertical: fs * 0.25, maxWidth: width * 0.85 }}>
          <MapPin size={fs} color="#7C3AED" />
          <Text numberOfLines={1} style={{ fontFamily: F.title, fontSize: fs, color: '#7C3AED' }}>{o.text}</Text>
        </View>
      );
    case 'poll': {
      const opts = o.data?.options?.length ? o.data.options : [t('آه'), t('لا')];
      const voted = live?.poll?.mine != null || live?.author;
      return (
        <View style={{ width: card, gap: 8 }}>
          {o.text ? <Text style={{ fontFamily: F.display, fontSize: fs * 1.05, color: '#FFFFFF', textAlign: 'center', textShadowColor: 'rgba(0,0,0,0.4)', textShadowRadius: 6 }}>{o.text}</Text> : null}
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 18, padding: 8, gap: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}>
            {opts.map((op, i) => {
              const p = pct(live?.poll?.counts, i);
              const mine = live?.poll?.mine === i;
              return (
                <Pressable key={i} disabled={!live?.onPoll || voted} onPress={() => live?.onPoll?.(i)} accessibilityRole="button" accessibilityLabel={op}
                  style={{ minHeight: 44, borderRadius: 12, backgroundColor: '#F2F3F7', overflow: 'hidden', justifyContent: 'center', paddingHorizontal: 12 }}>
                  {voted ? <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, width: `${p}%`, backgroundColor: mine ? '#FFD1C4' : '#E3E6EF' }} /> : null}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: voted ? '#0E1430' : '#2E5BFF' }}>{op}</Text>
                    {voted ? <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#0E1430' }}>{p}%</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    case 'question':
      return (
        <View style={{ width: card, borderRadius: 20, overflow: 'hidden', backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}>
          <LinearGradient colors={['#FF6B4A', '#E0306B']} style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
            <Text style={{ fontFamily: F.display, fontSize: fs, color: '#FFFFFF', textAlign: 'center' }}>{o.text || t('اسألني سؤال')}</Text>
          </LinearGradient>
          <Pressable disabled={!live?.onAsk} onPress={live?.onAsk} accessibilityRole="button" accessibilityLabel={t('اكتب ردك')} style={{ margin: 10, minHeight: 44, borderRadius: 12, backgroundColor: '#F2F3F7', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: F.bodyMd, fontSize: 14, color: '#8A93AE' }}>{live?.author ? t('{0} رد', [String(live.question?.count ?? 0)]) : t('اكتب ردك…')}</Text>
          </Pressable>
        </View>
      );
    case 'slider':
      return <SliderBody o={o} fs={fs} card={card} live={live} />;
    case 'countdown': {
      const end = o.data?.endsAt ? new Date(o.data.endsAt).getTime() : now;
      const left = Math.max(0, end - now);
      const d = Math.floor(left / 86400000), h = Math.floor((left % 86400000) / 3600000), m = Math.floor((left % 3600000) / 60000), sec = Math.floor((left % 60000) / 1000);
      const box = (n: number, l: string) => (
        <View style={{ alignItems: 'center', gap: 2 }}>
          <View style={{ minWidth: 40, paddingVertical: 6, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: '#FFFFFF', writingDirection: 'ltr' }}>{String(n).padStart(2, '0')}</Text>
          </View>
          <Text style={{ fontFamily: F.bodyMd, fontSize: 10, color: 'rgba(255,255,255,0.85)' }}>{l}</Text>
        </View>
      );
      return (
        <View style={{ width: card, borderRadius: 20, overflow: 'hidden' }}>
          <LinearGradient colors={['#7C3AED', '#2E5BFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 14, gap: 10, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: fs * 0.95, color: '#FFFFFF', textAlign: 'center' }}>{o.text || t('عدّاد')}</Text>
            {left > 0 ? (
              <View style={{ flexDirection: 'row', gap: 8, direction: 'ltr' }}>{box(d, t('يوم'))}{box(h, t('ساعة'))}{box(m, t('دقيقة'))}{box(sec, t('ثانية'))}</View>
            ) : <Text style={{ fontFamily: F.bodyBold, fontSize: 16, color: '#FFFFFF' }}>{t('خلص الوقت 🎉')}</Text>}
            <Pressable disabled={!live?.onRemind || live?.author} onPress={live?.onRemind} accessibilityRole="button"
              style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: 18, backgroundColor: live?.countdown?.mine ? 'rgba(255,255,255,0.25)' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: live?.countdown?.mine ? '#FFFFFF' : '#2E5BFF' }}>
                {live?.author ? t('{0} طلبوا تذكير', [String(live.countdown?.count ?? 0)]) : live?.countdown?.mine ? t('رح نذكّرك ✓') : t('ذكّرني')}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>
      );
    }
    default:
      return <StyledText o={o} fs={fs} width={width} />;
  }
}

/** Emoji slider: drag the emoji; after answering, the average shows on the track. */
function SliderBody({ o, fs, card, live }: { o: Overlay; fs: number; card: number; live?: Live }) {
  const [v, setV] = useState<number | null>(live?.slider?.mine ?? null);
  const [trackW, setTrackW] = useState(0);
  useEffect(() => { if (live?.slider?.mine != null) setV(live.slider.mine); }, [live?.slider?.mine]);
  const answered = live?.slider?.mine != null || live?.author;
  const pos = v ?? 0.12;
  const pick = (x: number) => Math.min(1, Math.max(0, x / (trackW || 1)));
  return (
    <View style={{ width: card, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, gap: 12, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10 }}>
      {o.text ? <Text style={{ fontFamily: F.display, fontSize: fs * 0.95, color: '#0E1430', textAlign: 'center' }}>{o.text}</Text> : null}
      <View onLayout={(e) => setTrackW(e.nativeEvent.layout.width)} style={{ height: 36, justifyContent: 'center', direction: 'ltr' }}
        onStartShouldSetResponder={() => !!live?.onSlide && !answered} onMoveShouldSetResponder={() => !!live?.onSlide && !answered}
        onResponderGrant={(e) => setV(pick(e.nativeEvent.locationX))} onResponderMove={(e) => setV(pick(e.nativeEvent.locationX))}
        onResponderRelease={(e) => { const nv = pick(e.nativeEvent.locationX); setV(nv); live?.onSlide?.(nv); }}>
        <LinearGradient colors={['#E9ECF5', '#FF6B4A']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ height: 8, borderRadius: 4 }} />
        {answered && live?.slider ? <View style={{ position: 'absolute', left: `${live.slider.avg * 100}%`, width: 3, height: 22, marginLeft: -1.5, borderRadius: 2, backgroundColor: '#0E1430', opacity: 0.6 }} /> : null}
        <Text pointerEvents="none" style={{ position: 'absolute', left: `${pos * 100}%`, marginLeft: -16, fontSize: 30 }}>{o.data?.emoji ?? '😍'}</Text>
      </View>
      {answered && live?.slider ? <Text style={{ fontFamily: F.bodyMd, fontSize: 12, color: '#5D6886', textAlign: 'center' }}>{t('المعدّل من {0}', [String(live.slider.count)])}</Text> : null}
    </View>
  );
}

/** Freehand drawing over the whole frame. */
export const DrawLayer = memo(function DrawLayer({ strokes, width, height }: { strokes: Stroke[]; width: number; height: number }) {
  if (!strokes.length || !width) return null;
  return (
    <Svg pointerEvents="none" width={width} height={height} style={{ position: 'absolute', top: 0, left: 0 }}>
      {strokes.map((s, i) => {
        const d = strokePath(s.pts, width, height);
        const w = Math.max(1, s.w * width);
        if (s.mode === 'neon') return [
          <Path key={`${i}g`} d={d} stroke={s.color} strokeWidth={w * 2.6} strokeOpacity={0.35} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
          <Path key={`${i}c`} d={d} stroke="#FFFFFF" strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />,
        ];
        if (s.mode === 'marker') return <Path key={i} d={d} stroke={s.color} strokeWidth={w * 2.2} strokeOpacity={0.5} fill="none" strokeLinecap="square" strokeLinejoin="round" />;
        return <Path key={i} d={d} stroke={s.color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />;
      })}
    </Svg>
  );
});

/** Smooth path through the points (fractions) using midpoints, scaled to the frame. */
export function strokePath(pts: number[], W: number, H: number) {
  if (pts.length < 2) return '';
  const p = (k: number) => [pts[k] * W, pts[k + 1] * H];
  const [x0, y0] = p(0);
  if (pts.length < 6) return `M${x0} ${y0} L${x0 + 0.1} ${y0 + 0.1}`;
  let d = `M${x0} ${y0}`;
  for (let k = 2; k < pts.length - 2; k += 2) {
    const [x1, y1] = p(k), [x2, y2] = p(k + 2);
    d += ` Q${x1} ${y1} ${(x1 + x2) / 2} ${(y1 + y2) / 2}`;
  }
  const [xl, yl] = p(pts.length - 2);
  return `${d} L${xl} ${yl}`;
}
