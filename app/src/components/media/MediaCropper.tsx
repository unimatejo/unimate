import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useVideoPlayer, VideoView } from 'expo-video';
import { FlipHorizontal2, RotateCw, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image as RNImage, Modal, Platform, ScrollView, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useSimultaneousGestures } from 'react-native-gesture-handler';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { measureVideo } from '@/components/media/FramedMedia';
import { useVideoThumbs, type Thumb } from '@/components/media/videoThumbs';
import { T, Tap } from '@/components/ui';
import { finishCropper, subscribeCropper, type CropMode, type CropOpts, type CropResult, type MediaMeta } from '@/lib/cropper';
import { reportError } from '@/lib/errors';
import { C, F, R } from '@/lib/theme';
import { t } from '@/lib/i18n';
import type { Picked } from '@/lib/upload';

const EASE = { duration: 220, easing: Easing.out(Easing.cubic) };
const PAD = 18;          // space around the frame inside the stage
const MIN_FRAME = 72;    // smallest free-crop frame
const HANDLE = 44;       // touch size of a free-crop corner
const INK = '#F5F6FA', MUTED = 'rgba(245,246,250,0.6)', BG = '#05070F';

type Preset = { key: string; label: string; ratio: number | 'original' | 'free' };
const PRESETS: Preset[] = [
  { key: 'original', label: t('أصلي'), ratio: 'original' },
  { key: 'square', label: t('مربع 1:1'), ratio: 1 },
  { key: 'portrait', label: t('عمودي 4:5'), ratio: 4 / 5 },
  { key: 'landscape', label: t('عرضي 16:9'), ratio: 16 / 9 },
  { key: 'free', label: t('حر'), ratio: 'free' },
];

/** The frame for an aspect ratio, as big as fits in the stage, centred. */
function fitFrame(ratio: number, W: number, H: number) {
  const mw = Math.max(40, W - PAD * 2), mh = Math.max(40, H - PAD * 2);
  let fw = mw, fh = mw / ratio;
  if (fh > mh) { fh = mh; fw = mh * ratio; }
  return { x: (W - fw) / 2, y: (H - fh) / 2, w: fw, h: fh };
}

type Frame = { fx: SharedValue<number>; fy: SharedValue<number>; fw: SharedValue<number>; fh: SharedValue<number> };

/** One free-crop corner: drag to resize the frame (kept inside the stage, never smaller than MIN_FRAME). */
function Corner({ corner, f, W, H, onMove, onEnd }: { corner: 'tl' | 'tr' | 'bl' | 'br'; f: Frame; W: number; H: number; onMove: () => void; onEnd: () => void }) {
  const left = corner === 'tl' || corner === 'bl', top = corner === 'tl' || corner === 'tr';
  const pan = usePanGesture({
    onActivate: () => { 'worklet'; runOnJS(onMove)(); },
    onUpdate: (e) => {
      'worklet';
      if (left) {
        const nx = Math.min(Math.max(PAD / 2, f.fx.value + e.changeX), f.fx.value + f.fw.value - MIN_FRAME);
        f.fw.value += f.fx.value - nx; f.fx.value = nx;
      } else f.fw.value = Math.min(Math.max(MIN_FRAME, f.fw.value + e.changeX), W - PAD / 2 - f.fx.value);
      if (top) {
        const ny = Math.min(Math.max(PAD / 2, f.fy.value + e.changeY), f.fy.value + f.fh.value - MIN_FRAME);
        f.fh.value += f.fy.value - ny; f.fy.value = ny;
      } else f.fh.value = Math.min(Math.max(MIN_FRAME, f.fh.value + e.changeY), H - PAD / 2 - f.fy.value);
    },
    onDeactivate: () => { 'worklet'; runOnJS(onEnd)(); },
  });
  const st = useAnimatedStyle(() => ({
    left: (left ? f.fx.value : f.fx.value + f.fw.value) - HANDLE / 2,
    top: (top ? f.fy.value : f.fy.value + f.fh.value) - HANDLE / 2,
  }));
  const arm = { position: 'absolute' as const, backgroundColor: '#fff', borderRadius: 2 };
  return (
    <GestureDetector gesture={pan}>
      <Animated.View accessibilityLabel={t('زاوية القص')} style={[{ position: 'absolute', width: HANDLE, height: HANDLE }, st]}>
        <View style={[arm, { width: 22, height: 4, [top ? 'top' : 'bottom']: HANDLE / 2 - 2, [left ? 'left' : 'right']: HANDLE / 2 - 2 }]} />
        <View style={[arm, { width: 4, height: 22, [top ? 'top' : 'bottom']: HANDLE / 2 - 2, [left ? 'left' : 'right']: HANDLE / 2 - 2 }]} />
      </Animated.View>
    </GestureDetector>
  );
}

/** Trim a video: drag the two ends of the strip; the kept part can't be longer than maxSec. */
function TrimBar({ duration, maxSec, start, end, onChange, onSeek, onScrub, thumbs }: {
  duration: number; maxSec: number; start: number; end: number; onChange: (s: number, e: number) => void; onSeek: (s: number) => void;
  /** while a handle moves: show that exact frame */
  onScrub: (s: number) => void; thumbs: Thumb[];
}) {
  const [w, setW] = useState(0);
  const px = (s: number) => (w ? (s / duration) * w : 0);
  const a = useSharedValue(0), b = useSharedValue(0);
  useEffect(() => { a.value = px(start); b.value = px(end); }, [w, start, end, duration]); // eslint-disable-line react-hooks/exhaustive-deps
  const minPx = w ? Math.max(12, (1 / duration) * w) : 12, maxPx = w ? (Math.min(maxSec, duration) / duration) * w : 0;
  const commit = (sa: number, sb: number, seek: number) => { if (!w) return; onChange((sa / w) * duration, (sb / w) * duration); onSeek((seek / w) * duration); };
  const last = useRef(0);
  const scrub = (x: number) => { const now = Date.now(); if (!w || now - last.current < 70) return; last.current = now; onScrub((x / w) * duration); };
  const left = usePanGesture({
    onUpdate: (e) => { 'worklet'; a.value = Math.min(Math.max(0, a.value + e.changeX, b.value - maxPx), b.value - minPx); runOnJS(scrub)(a.value); },
    onDeactivate: () => { 'worklet'; runOnJS(commit)(a.value, b.value, a.value); },
  });
  const right = usePanGesture({
    onUpdate: (e) => { 'worklet'; b.value = Math.max(Math.min(w, b.value + e.changeX, a.value + maxPx), a.value + minPx); runOnJS(scrub)(b.value); },
    onDeactivate: () => { 'worklet'; runOnJS(commit)(a.value, b.value, a.value); },
  });
  // like Instagram: drag the kept part itself to slide the same length along the video
  const slide = usePanGesture({
    onUpdate: (e) => { 'worklet'; const len = b.value - a.value; const na = Math.min(Math.max(0, a.value + e.changeX), w - len); a.value = na; b.value = na + len; runOnJS(scrub)(na); },
    onDeactivate: () => { 'worklet'; runOnJS(commit)(a.value, b.value, a.value); },
  });
  const kept = useAnimatedStyle(() => ({ left: a.value, width: Math.max(0, b.value - a.value) }));
  const ha = useAnimatedStyle(() => ({ left: a.value - 14 }));
  const hb = useAnimatedStyle(() => ({ left: b.value - 14 }));
  const secs = Math.max(0, end - start);
  return (
    <View style={{ gap: 8, paddingHorizontal: 24 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="tiny" color={MUTED}>{duration > maxSec + 0.5 ? t('حرّك الإطار واختار أحلى {0} ثانية', [maxSec]) : t('اسحب الأطراف لتقص الفيديو')}</T>
        <T v="tiny" color={INK} style={{ fontFamily: F.bodyBold }}>{t('{0} ث', [secs.toFixed(1)])}</T>
      </View>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: 52, justifyContent: 'center', direction: 'ltr' }}>
        {/* the video's frames under the handles, so you can see where you're cutting */}
        <View style={{ height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden', flexDirection: 'row' }}>
          {thumbs.map((th, i) => <Image key={i} source={th as never} style={{ flex: 1, height: 40 }} contentFit="cover" />)}
        </View>
        <GestureDetector gesture={slide}>
          <Animated.View accessibilityLabel={t('الجزء المختار')} style={[{ position: 'absolute', top: 6, height: 40, borderRadius: 12, borderWidth: 3, borderColor: C.primary, backgroundColor: 'rgba(255,122,89,0.18)' }, kept]} />
        </GestureDetector>
        <GestureDetector gesture={left}>
          <Animated.View accessibilityLabel={t('بداية الفيديو')} style={[{ position: 'absolute', top: 0, width: 28, height: 52, alignItems: 'center', justifyContent: 'center' }, ha]}>
            <View style={{ width: 8, height: 30, borderRadius: 4, backgroundColor: C.primary }} />
          </Animated.View>
        </GestureDetector>
        <GestureDetector gesture={right}>
          <Animated.View accessibilityLabel={t('نهاية الفيديو')} style={[{ position: 'absolute', top: 0, width: 28, height: 52, alignItems: 'center', justifyContent: 'center' }, hb]}>
            <View style={{ width: 8, height: 30, borderRadius: 4, backgroundColor: C.primary }} />
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

/**
 * Instagram-style crop editor. Photos: pinch / drag under the frame, pick a shape (or drag the corners freely),
 * rotate and flip; the result is really cropped. Stories: a fixed 9:16 screen — zoom out to show the whole photo
 * over a blurred copy. Videos: frame them the same way and trim start / end (saved as framing, not re-encoded).
 */
export function MediaCropper({ src, opts, onDone, onCancel }: { src: Picked; opts: CropOpts; onDone: (r: CropResult) => void; onCancel: () => void }) {
  const mode: CropMode = opts.mode;
  const isVideo = src.kind === 'video';
  const story = mode === 'story';
  const locked = story ? 9 / 16 : mode === 'avatar' ? 1 : opts.aspect ?? null;
  const [cur, setCur] = useState<Picked>(src.orig && src.kind === 'image' ? { ...src, uri: src.orig.uri, width: src.orig.width, height: src.orig.height } : src);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(cur.width && cur.height ? { w: cur.width, h: cur.height } : null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  // editing again: start with the shape chosen last time (a preset, or the free frame's ratio)
  const freeRatio = useRef<number | null>(null);
  const [preset, setPreset] = useState<Preset['key']>(() => {
    if (locked) return 'locked';
    const a = src.aspect;
    if (!a) return 'original';
    const hit = PRESETS.find((p) => typeof p.ratio === 'number' && Math.abs(p.ratio - a) < 0.01);
    if (hit) return hit.key;
    freeRatio.current = a;
    return 'free';
  });
  const [busy, setBusy] = useState(false);
  const [base, setBase] = useState(1);   // display size of the media at scale 1 (= covering the first frame)

  // ---------- video: player, size, duration, trim ----------
  const player = useVideoPlayer(isVideo ? cur.uri : null, (p) => { p.loop = true; p.muted = true; p.timeUpdateEventInterval = 0.1; p.play(); });
  const maxSec = opts.maxSec ?? 15;
  const [duration, setDuration] = useState(isVideo && cur.duration ? cur.duration / 1000 : 0);
  const [trim, setTrim] = useState<{ start: number; end: number }>(() => src.meta?.trim ?? { start: 0, end: Math.min(maxSec, cur.duration ? cur.duration / 1000 : maxSec) });
  const trimRef = useRef(trim);
  const scrubbing = useRef(false);
  trimRef.current = trim;
  useEffect(() => {
    if (!isVideo) return;
    const subs = [
      player.addListener('sourceLoad', ({ duration: d, availableVideoTracks }) => {
        if (d && Number.isFinite(d)) { setDuration(d); setTrim((tr) => (tr.end > d || tr.end === 0 ? { start: tr.start, end: Math.min(d, tr.start + maxSec) } : tr)); }
        const s = availableVideoTracks?.[0]?.size;
        if (s?.width && s?.height) setDims((cd) => cd ?? { w: s.width, h: s.height });
      }),
      player.addListener('videoTrackChange', ({ videoTrack }) => { const s = videoTrack?.size; if (s?.width && s?.height) setDims((cd) => cd ?? { w: s.width, h: s.height }); }),
      player.addListener('timeUpdate', ({ currentTime }) => { const tr = trimRef.current; if (scrubbing.current) return; if (currentTime >= tr.end - 0.05 || currentTime < tr.start - 0.3) player.currentTime = tr.start; }),
    ];
    // duration: some players never send sourceLoad — read it once the video is ready
    const poll = setInterval(() => {
      const dd = player.duration;
      if (dd && Number.isFinite(dd) && dd > 0) {
        setDuration((cd) => cd || dd);
        setTrim((tr) => (tr.end > dd || tr.end === 0 ? { start: tr.start, end: Math.min(dd, tr.start + maxSec) } : tr));
        clearInterval(poll);
      }
    }, 400);
    setTimeout(() => clearInterval(poll), 15000);
    // no size from the picker or the player (some browsers): assume a phone video
    const fb = setTimeout(() => setDims((cd) => cd ?? { w: 1080, h: 1920 }), 2500);
    return () => { subs.forEach((s) => s.remove()); clearTimeout(fb); clearInterval(poll); };
  }, [player, isVideo, maxSec]);

  // browsers never report a video's size through the player: read it from the file (fast, metadata only)
  useEffect(() => {
    if (!isVideo || Platform.OS !== 'web') return;
    measureVideo(cur.uri).then((r) => { if (r) setDims((cd) => cd ?? r); });
  }, [cur.uri, isVideo]);
  // a browser only shows a video's picture once it plays, and the player can't start a <video> that isn't on screen yet
  const shown = isVideo && !!dims && stage.w > 0;
  useEffect(() => {
    if (!shown) return;
    player.currentTime = trimRef.current.start;
    player.play();
  }, [shown, player]);
  const thumbs = useVideoThumbs(isVideo ? cur.uri : null, duration, player);
  // dragging a handle: freeze on that frame; letting go plays the kept part again
  const scrub = useCallback((sec: number) => { scrubbing.current = true; player.pause(); player.currentTime = sec; }, [player]);

  // photos without a known size (rare): ask the image
  useEffect(() => {
    if (dims || isVideo) return;
    RNImage.getSize(cur.uri, (w, h) => setDims({ w, h }), () => setDims({ w: 1080, h: 1080 }));
  }, [cur.uri, dims, isVideo]);

  // ---------- geometry (shared values: frame in stage px, media scale k = screen px per media px, centre offset) ----------
  const fx = useSharedValue(0), fy = useSharedValue(0), fw = useSharedValue(0), fh = useSharedValue(0);
  const k = useSharedValue(1), tx = useSharedValue(0), ty = useSharedValue(0);
  const iw = useSharedValue(1), ih = useSharedValue(1), SW = useSharedValue(0), SH = useSharedValue(0);
  const grid = useSharedValue(0);
  const frame: Frame = { fx, fy, fw, fh };

  const ratioFor = useCallback((key: string) => {
    if (locked) return locked;
    if (!dims) return 1;
    const own = dims.w / dims.h;
    if (key === 'free' && freeRatio.current) return freeRatio.current;
    if (key === 'original' || key === 'free') return mode === 'post' ? Math.min(1.91, Math.max(0.8, own)) : own;
    return PRESETS.find((p) => p.key === key)?.ratio as number;
  }, [locked, dims, mode]);

  /** keep the frame covered (or, in stories, the media inside the screen when zoomed out) — calm, no bounce */
  const clamp = useCallback((animate = true) => {
    'worklet';
    const kCover = Math.max(fw.value / iw.value, fh.value / ih.value);
    const kContain = Math.min(fw.value / iw.value, fh.value / ih.value);
    const kmin = story ? Math.min(kCover, kContain * 0.999) : kCover;
    const nk = Math.min(Math.max(k.value, kmin), kCover * 8);
    const dw = iw.value * nk, dh = ih.value * nk;
    const cx = SW.value / 2, cy = SH.value / 2;
    const ix = cx + tx.value - dw / 2, iy = cy + ty.value - dh / 2;
    const loX = Math.min(fx.value, fx.value + fw.value - dw), hiX = Math.max(fx.value, fx.value + fw.value - dw);
    const loY = Math.min(fy.value, fy.value + fh.value - dh), hiY = Math.max(fy.value, fy.value + fh.value - dh);
    const ntx = Math.min(Math.max(ix, loX), hiX) - cx + dw / 2;
    const nty = Math.min(Math.max(iy, loY), hiY) - cy + dh / 2;
    if (animate) { k.value = withTiming(nk, EASE); tx.value = withTiming(ntx, EASE); ty.value = withTiming(nty, EASE); }
    else { k.value = nk; tx.value = ntx; ty.value = nty; }
  }, [story]); // eslint-disable-line react-hooks/exhaustive-deps

  /** put the frame for a shape and make the media cover it (centred) */
  const layout = useCallback((key: string, animate: boolean) => {
    if (!dims || !stage.w) return;
    const fr = fitFrame(ratioFor(key), stage.w, stage.h);
    const set = (v: SharedValue<number>, n: number) => { v.value = animate ? withTiming(n, EASE) : n; };
    set(fx, fr.x); set(fy, fr.y); set(fw, fr.w); set(fh, fr.h);
    const kc = Math.max(fr.w / dims.w, fr.h / dims.h);
    if (!animate) { setBase(kc); k.value = kc; tx.value = (fr.x + fr.w / 2) - stage.w / 2; ty.value = (fr.y + fr.h / 2) - stage.h / 2; }
    else {
      // keep the current zoom if it still covers, else zoom to cover; re-centre on the new frame
      const nk = Math.max(k.value, kc);
      k.value = withTiming(nk, EASE); tx.value = withTiming((fr.x + fr.w / 2) - stage.w / 2, EASE); ty.value = withTiming((fr.y + fr.h / 2) - stage.h / 2, EASE);
    }
  }, [dims, stage, ratioFor]); // eslint-disable-line react-hooks/exhaustive-deps

  // first layout (and after rotate / a new size)
  const placedFor = useRef('');
  useEffect(() => {
    if (!dims || !stage.w) return;
    iw.value = dims.w; ih.value = dims.h; SW.value = stage.w; SH.value = stage.h;
    const sig = `${cur.uri}|${dims.w}x${dims.h}|${stage.w}x${stage.h}`;
    if (placedFor.current === sig) return;
    placedFor.current = sig;
    layout(preset === 'locked' ? 'original' : preset, false);
    // editing an earlier video framing again: restore it
    const r = src.meta?.rect;
    if (isVideo && r && placedFor.current.startsWith(src.uri)) {
      const kk = (r.w * fw.value) / dims.w;
      const ix = fx.value + r.l * fw.value, iy = fy.value + r.t * fh.value;
      k.value = kk; tx.value = ix + (dims.w * kk) / 2 - stage.w / 2; ty.value = iy + (dims.h * kk) / 2 - stage.h / 2;
    }
  }, [dims, stage, cur.uri]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- gestures on the media ----------
  const showGrid = () => { 'worklet'; grid.value = withTiming(1, { duration: 120 }); };
  const hideGrid = () => { 'worklet'; grid.value = withTiming(0, { duration: 260 }); };
  const pan = usePanGesture({
    onActivate: () => { 'worklet'; showGrid(); },
    onUpdate: (e) => { 'worklet'; tx.value += e.changeX; ty.value += e.changeY; },
    onDeactivate: () => { 'worklet'; hideGrid(); clamp(); },
  });
  const pinch = usePinchGesture({
    onActivate: () => { 'worklet'; showGrid(); },
    onUpdate: (e) => {
      'worklet';
      const kCover = Math.max(fw.value / iw.value, fh.value / ih.value);
      const nk = Math.min(Math.max(k.value * e.scaleChange, kCover * (story ? 0.25 : 0.6)), kCover * 10);
      const f = nk / k.value;
      // zoom around the fingers
      tx.value -= (e.focalX - (SW.value / 2 + tx.value)) * (f - 1);
      ty.value -= (e.focalY - (SH.value / 2 + ty.value)) * (f - 1);
      k.value = nk;
    },
    onDeactivate: () => { 'worklet'; hideGrid(); clamp(); },
  });
  const gesture = useSimultaneousGestures(pan, pinch);

  const media = useAnimatedStyle(() => ({
    transform: [{ translateX: SW.value / 2 + tx.value - ((dims?.w ?? 1) * base) / 2 }, { translateY: SH.value / 2 + ty.value - ((dims?.h ?? 1) * base) / 2 }, { scale: k.value / base }],
  }));
  const dimTop = useAnimatedStyle(() => ({ left: 0, top: 0, width: SW.value, height: Math.max(0, fy.value) }));
  const dimBottom = useAnimatedStyle(() => ({ left: 0, top: fy.value + fh.value, width: SW.value, height: Math.max(0, SH.value - fy.value - fh.value) }));
  const dimLeft = useAnimatedStyle(() => ({ left: 0, top: fy.value, width: Math.max(0, fx.value), height: fh.value }));
  const dimRight = useAnimatedStyle(() => ({ left: fx.value + fw.value, top: fy.value, width: Math.max(0, SW.value - fx.value - fw.value), height: fh.value }));
  const border = useAnimatedStyle(() => ({ left: fx.value, top: fy.value, width: fw.value, height: fh.value }));
  const gridSt = useAnimatedStyle(() => ({ left: fx.value, top: fy.value, width: fw.value, height: fh.value, opacity: grid.value }));

  function pick(key: string) {
    if (key === preset) return;
    freeRatio.current = null;
    Haptics.selectionAsync().catch(() => {});
    setPreset(key);
    layout(key, true);
  }

  // rotate / flip really change the photo (like the old story editor), then the frame is laid out again
  async function transform(op: 'rotate' | 'flip') {
    if (busy || isVideo || !dims) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(cur.uri);
      if (op === 'rotate') ctx.rotate(90); else ctx.flip('horizontal' as never);
      const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.95, format: SaveFormat.JPEG });
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      setCur({ ...cur, uri: out.uri, width: out.width, height: out.height, mime: 'image/jpeg' });
      setDims({ w: out.width, h: out.height });
    } catch (e) { reportError(e); } finally { setBusy(false); }
  }

  async function done() {
    if (busy || !dims || !stage.w) return;
    setBusy(true);
    try {
      const K = k.value, X = fx.value, Y = fy.value, FW = fw.value, FH = fh.value;
      const dw = dims.w * K, dh = dims.h * K;
      const ix = stage.w / 2 + tx.value - dw / 2, iy = stage.h / 2 + ty.value - dh / 2;
      const aspect = FW / FH;
      const orig = src.orig ?? (src.kind === 'image' ? { uri: src.uri, width: src.width, height: src.height } : undefined);
      if (isVideo) {
        const meta: MediaMeta = { rect: { l: (ix - X) / FW, t: (iy - Y) / FH, w: dw / FW, h: dh / FH }, aspect };
        const d = duration || (cur.duration ? cur.duration / 1000 : 0);
        if (d && (trim.start > 0.05 || trim.end < d - 0.05)) meta.trim = { start: Math.max(0, trim.start), end: Math.min(d, trim.end) };
        onDone({ media: { ...cur, meta, aspect }, aspect });
        return;
      }
      // the part of the photo inside the frame, in photo pixels
      const x0 = Math.max(0, (X - ix) / K), y0 = Math.max(0, (Y - iy) / K);
      const x1 = Math.min(dims.w, (X + FW - ix) / K), y1 = Math.min(dims.h, (Y + FH - iy) / K);
      const cw = Math.max(1, Math.round(x1 - x0)), ch = Math.max(1, Math.round(y1 - y0));
      const covers = dw >= FW - 1 && dh >= FH - 1 && ix <= X + 1 && iy <= Y + 1 && ix + dw >= X + FW - 1 && iy + dh >= Y + FH - 1;
      const ctx = ImageManipulator.manipulate(cur.uri);
      ctx.crop({ originX: Math.round(x0), originY: Math.round(y0), width: Math.min(cw, dims.w - Math.round(x0)), height: Math.min(ch, dims.h - Math.round(y0)) });
      const maxLong = mode === 'chat' ? 1600 : story ? 1920 : mode === 'avatar' ? 720 : 1440;
      if (Math.max(cw, ch) > maxLong) ctx.resize(cw >= ch ? { width: maxLong } : { height: maxLong });
      const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      let meta: MediaMeta | undefined;
      // a story photo zoomed out: shown where you left it, over a blurred copy
      if (story && !covers) meta = { fit: 'blur', aspect, rect: { l: (ix + x0 * K - X) / FW, t: (iy + y0 * K - Y) / FH, w: (cw * K) / FW, h: (ch * K) / FH } };
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onDone({ media: { ...cur, uri: out.uri, mime: 'image/jpeg', kind: 'image', width: out.width, height: out.height, meta, aspect, orig }, aspect });
    } catch (e) {
      reportError(e);
      setBusy(false);
    }
  }

  const presets = useMemo(() => (locked ? [] : PRESETS), [locked]);
  const title = isVideo ? t('عدّل الفيديو') : story ? t('عدّل الستوري') : t('قص الصورة');
  const doneLabel = mode === 'chat' ? t('ابعت') : t('تم');
  const free = preset === 'free';
  const d = duration || (cur.duration ? cur.duration / 1000 : 0);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: BG }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 56 }}>
          <Tap onPress={onCancel} accessibilityLabel={t('إلغاء')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={INK} /></Tap>
          <T v="bold" color={INK} style={{ fontSize: 16 }}>{title}</T>
          <Tap onPress={done} disabled={busy || !dims} accessibilityLabel={doneLabel}
            style={{ minWidth: 64, height: 38, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: busy || !dims ? 0.6 : 1 }}>
            {busy ? <ActivityIndicator color={C.onPrimary} /> : <T v="bold" color={C.onPrimary}>{doneLabel}</T>}
          </Tap>
        </View>

        {/* the stage is laid out left-to-right on purpose: all the maths below is in screen pixels */}
        <View style={{ flex: 1, direction: 'ltr' }} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {story && <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.5 }}>{!isVideo && <Image source={{ uri: cur.uri }} style={{ flex: 1 }} contentFit="cover" blurRadius={40} />}</View>}
          <GestureDetector gesture={gesture}>
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, overflow: 'hidden' }}>
              {dims && stage.w > 0 && (
                // the photo itself never takes the touch (a browser would start dragging the image file)
                <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, top: 0, width: dims.w * base, height: dims.h * base }, media]}>
                  {isVideo ? <VideoView player={player} style={{ width: '100%', height: '100%' }} contentFit="fill" nativeControls={false} playsInline />
                    : <Image source={{ uri: cur.uri }} style={{ flex: 1 }} contentFit="fill" />}
                </Animated.View>
              )}
              {(!dims || !stage.w) && <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={INK} /></View>}
              {/* dim outside the frame, frame border, rule-of-thirds grid while moving */}
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(5,7,15,0.66)' }, dimTop]} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(5,7,15,0.66)' }, dimBottom]} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(5,7,15,0.66)' }, dimLeft]} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', backgroundColor: 'rgba(5,7,15,0.66)' }, dimRight]} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.9)', borderRadius: mode === 'avatar' ? 9999 : story ? 18 : 2 }, border]} />
              <Animated.View pointerEvents="none" style={[{ position: 'absolute' }, gridSt]}>
                {[1, 2].map((i) => <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${(i * 100) / 3}%`, width: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />)}
                {[1, 2].map((i) => <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: `${(i * 100) / 3}%`, height: 1, backgroundColor: 'rgba(255,255,255,0.55)' }} />)}
              </Animated.View>
            </View>
          </GestureDetector>
          {free && stage.w > 0 && (['tl', 'tr', 'bl', 'br'] as const).map((c) => (
            <Corner key={c} corner={c} f={frame} W={stage.w} H={stage.h} onMove={() => { grid.value = withTiming(1, { duration: 120 }); }}
              onEnd={() => { grid.value = withTiming(0, { duration: 260 }); clamp(); Haptics.selectionAsync().catch(() => {}); }} />
          ))}
        </View>

        <View style={{ paddingTop: 12, paddingBottom: 16, gap: 14 }}>
          {isVideo && d > 0 && (
            <TrimBar duration={d} maxSec={maxSec} start={trim.start} end={Math.min(trim.end || d, d)}
              onChange={(s, e) => setTrim({ start: s, end: e })} onSeek={(s) => { scrubbing.current = false; player.currentTime = s; player.play(); }} onScrub={scrub} thumbs={thumbs} />
          )}
          {story && <T v="tiny" color={MUTED} style={{ textAlign: 'center' }}>{t('حرّك وكبّر بإصبعين. صغّرها لتبيّن كاملة فوق خلفية مموّهة.')}</T>}
          {!story && !isVideo && locked && mode === 'post' && <T v="tiny" color={MUTED} style={{ textAlign: 'center' }}>{t('كل صور المنشور بنفس الشكل. حرّك الصورة لتختار شو يبيّن.')}</T>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
            {presets.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
                {presets.map((p) => {
                  const on = p.key === preset;
                  return (
                    <Tap key={p.key} haptic={false} onPress={() => pick(p.key)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ minHeight: 40, paddingHorizontal: 16, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? INK : 'rgba(255,255,255,0.1)' }}>
                      <T v="bold" color={on ? BG : INK} style={{ fontSize: 13 }}>{p.label}</T>
                    </Tap>
                  );
                })}
              </ScrollView>
            )}
            {presets.length === 0 && <View style={{ flex: 1 }} />}
            {!isVideo && (
              <>
                <Tap onPress={() => transform('rotate')} disabled={busy} accessibilityLabel={t('تدوير')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}><RotateCw size={19} color={INK} /></Tap>
                <Tap onPress={() => transform('flip')} disabled={busy} accessibilityLabel={t('اقلب')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}><FlipHorizontal2 size={19} color={INK} /></Tap>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

/** Shows the crop editor whenever openCropper() is called: one at the root, and one in each screen opened as a sheet. */
export function MediaCropperHost() {
  const [req, setReq] = useState<{ src: Picked; opts: CropOpts } | null>(null);
  useEffect(() => subscribeCropper((r) => setReq(r ? { src: r.src, opts: r.opts } : null)), []);
  return (
    <Modal visible={!!req} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent onRequestClose={() => finishCropper(null)}>
      {req && <MediaCropper key={req.src.uri} src={req.src} opts={req.opts} onDone={(r) => finishCropper(r)} onCancel={() => finishCropper(null)} />}
    </Modal>
  );
}

