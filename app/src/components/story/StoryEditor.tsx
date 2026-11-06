import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AtSign, Brush, ChevronDown, ChevronLeft, ChevronUp, Download, MessageCircleOff, Palette, Scissors, Smile, Star, Trash2, Type, Wand2, X, Volume2, VolumeX,
} from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image as RNImage, Platform, Pressable, ScrollView, Share, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useRotationGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { measureVideo, TrimmedVideo } from '@/components/media/FramedMedia';
import { MediaCropper } from '@/components/media/MediaCropper';
import { DrawTool } from '@/components/story/DrawTool';
import { BACKGROUNDS, FILTERS, FilterLayer } from '@/components/story/filters';
import { DrawLayer, StickerBody } from '@/components/story/StickerBody';
import { StickerTray, type NewSticker } from '@/components/story/StickerTray';
import { TextTool, type TextDraft } from '@/components/story/TextTool';
import { Avatar } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import type { MediaMeta } from '@/lib/cropper';
import { newId, type Overlay, type Stroke } from '@/lib/storyOverlay';
import { toast } from '@/lib/toast';
import { F } from '@/lib/theme';
import { isAR, t } from '@/lib/i18n';
import type { Picked } from '@/lib/upload';

const fill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const;
const glass = { backgroundColor: 'rgba(0,0,0,0.32)' } as const;

/** Toolbar side: right in English, left in Arabic (like Instagram); the close button sits opposite. */
const toolSide = (n: number) => (Platform.OS === 'web' ? (isAR ? { left: n } : { right: n }) : { end: n });
/** icon on the outer edge, its name inward. Web is laid out left-to-right here; native flips row/flex-start by itself in Arabic. */
const WEB = Platform.OS === 'web';
const TOOL_ROW = WEB && isAR ? 'row' as const : 'row-reverse' as const;
const TOOL_ALIGN = WEB && isAR ? 'flex-start' as const : 'flex-end' as const;
const LTR = WEB ? ({ direction: 'ltr' } as object) : {};
const closeSide = (n: number) => (Platform.OS === 'web' ? (isAR ? { right: n } : { left: n }) : { start: n });

type DragFx = {
  /** 1 while something is being dragged (the tools fade out, the trash fades in) */
  on: SharedValue<number>;
  /** the finger is over the trash */
  overT: SharedValue<number>;
  /** the centre guides (vertical / horizontal) */
  gV: SharedValue<number>; gH: SharedValue<number>;
  /** the highest layer so far: the touched item goes on top without reordering views mid-gesture */
  top: SharedValue<number>;
};
const SNAP = 9;
const buzz = (strong?: boolean) => { if (Platform.OS !== 'web') Haptics.impactAsync(strong ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {}); };

/**
 * One movable thing on the story: drag with one finger, pinch to resize, twist to rotate, tap to edit.
 * Everything runs on the UI thread with shared values; React only hears about it once, when the fingers lift.
 */
const Movable = memo(function Movable({ o, W, H, trashY, fx, hidden, onTap, onChange, onDelete }: {
  o: Overlay; W: number; H: number; trashY: number; fx: DragFx; hidden: boolean;
  onTap: (id: string) => void; onChange: (id: string, x: number, y: number, scale: number, rotation: number) => void; onDelete: (id: string) => void;
}) {
  const x = useSharedValue(o.x * W), y = useSharedValue(o.y * H), sc = useSharedValue(o.scale), rot = useSharedValue(o.rotation);
  // the unsnapped position under the finger, so snapping never fights the drag
  const rx = useSharedValue(o.x * W), ry = useSharedValue(o.y * H);
  const w = useSharedValue(0), h = useSharedValue(0);
  const fingers = useSharedValue(0), over = useSharedValue(0), lift = useSharedValue(0), z = useSharedValue(0), shrink = useSharedValue(1);
  useEffect(() => { x.value = o.x * W; y.value = o.y * H; rx.value = x.value; ry.value = y.value; sc.value = o.scale; rot.value = o.rotation; }, [o.x, o.y, o.scale, o.rotation, W, H, x, y, rx, ry, sc, rot]);

  const start = () => {
    'worklet';
    if (fingers.value === 0) { rx.value = x.value; ry.value = y.value; fx.top.value += 1; z.value = fx.top.value; }
    fingers.value += 1;
  };
  const end = () => {
    'worklet';
    fingers.value = Math.max(0, fingers.value - 1);
    if (fingers.value > 0) return;
    const del = over.value === 1;
    fx.on.value = withTiming(0, { duration: 180 }); fx.overT.value = 0; fx.gV.value = 0; fx.gH.value = 0;
    lift.value = withTiming(0, { duration: 160 });
    if (del) { over.value = 0; runOnJS(onDelete)(o.id); return; }
    shrink.value = 1;
    runOnJS(onChange)(o.id, x.value / W, y.value / H, sc.value, rot.value);
  };

  const pan = usePanGesture({
    onActivate: () => { 'worklet'; start(); fx.on.value = withTiming(1, { duration: 160 }); lift.value = withTiming(1, { duration: 140 }); },
    onUpdate: (e) => {
      'worklet';
      rx.value += e.changeX; ry.value += e.changeY;
      // snap to the centre lines, with one light tap when it locks
      const sv = Math.abs(rx.value - W / 2) < SNAP, sh = Math.abs(ry.value - H / 2) < SNAP;
      if (sv && !fx.gV.value) runOnJS(buzz)(false);
      if (sh && !fx.gH.value) runOnJS(buzz)(false);
      fx.gV.value = sv && !over.value ? 1 : 0; fx.gH.value = sh && !over.value ? 1 : 0;
      x.value = sv ? W / 2 : rx.value; y.value = sh ? H / 2 : ry.value;
      // over the trash: the finger decides (like Instagram), not the sticker's centre
      const n = ry.value > trashY - 70 && Math.abs(rx.value - W / 2) < 80 ? 1 : 0;
      if (n !== over.value) { over.value = n; fx.overT.value = n; shrink.value = withTiming(n ? 0.4 : 1, { duration: 160 }); if (n) runOnJS(buzz)(true); }
    },
    onDeactivate: () => { 'worklet'; end(); },
  });
  const pinch = usePinchGesture({
    onActivate: () => { 'worklet'; start(); },
    onUpdate: (e) => { 'worklet'; sc.value = Math.min(8, Math.max(0.3, sc.value * e.scaleChange)); },
    onDeactivate: () => { 'worklet'; end(); },
  });
  const rotate = useRotationGesture({
    onActivate: () => { 'worklet'; start(); },
    onUpdate: (e) => {
      'worklet';
      rot.value += e.rotationChange;
      // straight again within ~3°
      const k = Math.round(rot.value / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(rot.value - k) < 0.05) rot.value = k;
    },
    onDeactivate: () => { 'worklet'; end(); },
  });
  const tap = useTapGesture({ maxDistance: 10, onDeactivate: (e) => { 'worklet'; if (!e.canceled) runOnJS(onTap)(o.id); } });
  const gesture = useSimultaneousGestures(pan, pinch, rotate, tap);

  const style = useAnimatedStyle(() => {
    return {
      zIndex: z.value,
      opacity: w.value ? withTiming(over.value ? 0.55 : 1, { duration: 140 }) : 0,
      transform: [{ translateX: x.value - w.value / 2 }, { translateY: y.value - h.value / 2 }, { scale: sc.value * shrink.value * (1 + lift.value * 0.03) }, { rotate: `${rot.value}rad` }],
    };
  });
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, hidden && { display: 'none' }, style]} onLayout={(e) => { w.value = e.nativeEvent.layout.width; h.value = e.nativeEvent.layout.height; }}>
        <View pointerEvents="none"><StickerBody o={o} width={W} /></View>
      </Animated.View>
    </GestureDetector>
  );
});

function Tool({ label, show, onPress, children, active }: { label: string; show: boolean; onPress: () => void; children: ReactNode; active?: boolean }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: TOOL_ROW, alignItems: 'center', gap: 8, opacity: pressed ? 0.7 : 1 })}>
      <View style={[{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, active ? { backgroundColor: '#FFFFFF' } : glass]}>{children}</View>
      {show ? <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: '#FFFFFF', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4 }}>{label}</Text> : null}
    </Pressable>
  );
}

/**
 * Instagram's story editor: move, pinch and turn the photo or video anywhere on the frame, a gradient or blurred background,
 * text in six looks, stickers (place, mention, question, poll, emoji slider, countdown, hashtag, link, time, UniMate stickers),
 * drawing, colour filters, caption, and share to your story or close friends. Everything is saved as data, so the viewer
 * draws it exactly the same.
 */
export function StoryEditor({ media, initial, onCancel, onDone, onShare, sharing }: {
  media: Picked; initial?: Overlay[]; onCancel: () => void; onDone: (media: Picked, overlays: Overlay[]) => void;
  /** share straight from the editor: "قصتك" (friends) or "المقربين" (close friends) */
  onShare?: (media: Picked, overlays: Overlay[], audience: 'friends' | 'close_friends') => void; sharing?: boolean;
}) {
  const { width: SW, height: SH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  // a 9:16 frame as big as the screen allows, with the share bar under it
  const BAR = 64;
  const top = insets.top + 4;
  const availH = SH - top - insets.bottom - BAR - 10;
  const H = Math.min(availH, (SW * 16) / 9), W = (H * 9) / 16;
  const left = (SW - W) / 2;

  const [m, setM] = useState<Picked>(media);
  const [items, setItems] = useState<Overlay[]>(() => (initial ?? []).filter((o) => o.kind !== 'draw'));
  const [strokes, setStrokes] = useState<Stroke[]>(() => (initial ?? []).filter((o) => o.kind === 'draw').flatMap((o) => o.data?.strokes ?? []));
  const [draft, setDraft] = useState<TextDraft | null>(null);
  const [tray, setTray] = useState<false | 'all' | 'mention' | 'place'>(false);
  const [drawing, setDrawing] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filter, setFilter] = useState<string>(media.meta?.filter ?? 'none');
  const [bg, setBg] = useState<number>(() => {
    const i = BACKGROUNDS.findIndex((b) => media.meta?.bg && b[0] === media.meta.bg[0] && b[1] === media.meta.bg[1]);
    return i >= 0 ? i : media.kind === 'image' ? -1 : 0; // -1 = blurred copy of the photo
  });
  const [expanded, setExpanded] = useState(false);
  const [noReplies, setNoReplies] = useState(!!media.meta?.noReplies);
  const [caption, setCaption] = useState(media.meta?.caption ?? '');
  const [flash, setFlash] = useState<{ name: string; k: number } | null>(null);
  const [trim, setTrim] = useState(false);
  // like Instagram: the video's own sound is on, one tap turns it off (saved with the story)
  const [soundOff, setSoundOff] = useState(!!media.meta?.muted);
  const [soundBlocked, setSoundBlocked] = useState(false);

  // the media's own shape (from the picker, or measured)
  // a video's shape is measured from the file itself (the picker's numbers can be swapped for phone videos), so a wide
  // video is never zoomed in to fill a tall frame
  const [A, setA] = useState<number>(m.kind === 'image' && m.width && m.height ? m.width / m.height : 0);
  useEffect(() => {
    if (A) return;
    if (m.kind === 'image') { RNImage.getSize(m.uri, (w, h) => setA(w && h ? w / h : 9 / 16), () => setA(9 / 16)); return; }
    if (Platform.OS === 'web') { measureVideo(m.uri).then((r) => setA(r ? r.w / r.h : m.width && m.height ? m.width / m.height : 9 / 16)); return; }
    // phones: the player reports it (onSize below); the picker's shape until then
    if (m.width && m.height) setA(m.width / m.height);
  }, [m.uri, m.kind, A, m.width, m.height]);
  const onVideoSize = useCallback((w: number, h: number) => setA(w / h), []);
  const ratio = A || 9 / 16;
  // starting size: taller photos fill the frame, wider ones fit the width (like Instagram)
  const base = useMemo(() => (ratio <= (W / H) * 1.06 ? { w: Math.max(W, H * ratio), h: Math.max(W, H * ratio) / ratio } : { w: W, h: W / ratio }), [ratio, W, H]);

  // free move / pinch / turn of the media
  const tx = useSharedValue(0), ty = useSharedValue(0), sc = useSharedValue(1), rot = useSharedValue(0);
  useEffect(() => {
    const r = media.meta?.rect;
    if (r && media.meta?.aspect) {
      sc.value = (r.w * W) / base.w; tx.value = (r.l + r.w / 2) * W - W / 2; ty.value = (r.t + r.h / 2) * H - H / 2; rot.value = media.meta.rot ?? 0;
    }
    // only once the shape is known
  }, [base.w]); // eslint-disable-line react-hooks/exhaustive-deps

  // one finger sideways swipes through the filters (like Instagram); one finger up/down, or two fingers, move / pinch / turn the photo.
  const mode = useSharedValue(0); // 0 deciding · 1 moving · 2 swiping filters
  const acc = useSharedValue(0), accY = useSharedValue(0);
  const mpan = usePanGesture({
    onActivate: () => { 'worklet'; mode.value = 0; acc.value = 0; accY.value = 0; },
    onUpdate: (e) => {
      'worklet';
      if (mode.value === 0) {
        acc.value += e.changeX; accY.value += e.changeY;
        if (Math.abs(acc.value) + Math.abs(accY.value) < 12) return;
        const swipe = (e.numberOfPointers ?? 1) <= 1 && Math.abs(acc.value) > Math.abs(accY.value) * 1.5;
        mode.value = swipe ? 2 : 1;
        if (mode.value === 1) { tx.value += acc.value; ty.value += accY.value; }
        return;
      }
      if (mode.value === 2) { acc.value += e.changeX; return; }
      tx.value += e.changeX; ty.value += e.changeY;
    },
    onDeactivate: () => { 'worklet'; if (mode.value === 2 && Math.abs(acc.value) > 40) runOnJS(stepFilter)(acc.value < 0 ? 1 : -1); mode.value = 0; },
  });
  const mpinch = usePinchGesture({ onUpdate: (e) => { 'worklet'; sc.value = Math.min(6, Math.max(0.25, sc.value * e.scaleChange)); } });
  const mrot = useRotationGesture({ onUpdate: (e) => { 'worklet'; rot.value += e.rotationChange; } });
  function stepFilter(d: number) {
    setFilter((cur) => {
      const i = FILTERS.findIndex((f) => f.id === cur);
      const n = FILTERS[(i + (isAR ? -d : d) + FILTERS.length) % FILTERS.length];
      setFlash((f) => ({ name: n.name, k: (f?.k ?? 0) + 1 }));
      return n.id;
    });
  }
  useEffect(() => { if (!flash) return; const h = setTimeout(() => setFlash(null), 900); return () => clearTimeout(h); }, [flash]);
  const cycleBg = () => setBg((b) => { const n = b + 1; return n >= BACKGROUNDS.length ? (m.kind === 'image' ? -1 : 0) : n; });
  const mtap = useTapGesture({ maxDistance: 10, onDeactivate: (e) => { 'worklet'; if (!e.canceled) runOnJS(cycleBg)(); } });
  const mediaGesture = useSimultaneousGestures(mpan, mpinch, mrot, mtap);
  const mstyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }, { rotate: `${rot.value}rad` }] }));

  const trashY = H - 64;
  const fx: DragFx = { on: useSharedValue(0), overT: useSharedValue(0), gV: useSharedValue(0), gH: useSharedValue(0), top: useSharedValue(0) };
  const itemsRef = useRef(items); itemsRef.current = items;
  const onItemChange = useCallback((id: string, x: number, y: number, scale: number, rotation: number) => {
    // the moved item also goes last, so the saved order matches what's on top
    setItems((l) => { const o = l.find((it) => it.id === id); return o ? [...l.filter((it) => it.id !== id), { ...o, x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)), scale, rotation }] : l; });
  }, []);
  const onDelete = useCallback((id: string) => setItems((l) => l.filter((it) => it.id !== id)), []);
  const onTapItem = useCallback((id: string) => { const o = itemsRef.current.find((it) => it.id === id); if (o) tapItem(o); }, []);  

  // the tools fade out while dragging; the trash and the centre guides fade in
  const uiStyle = useAnimatedStyle(() => ({ opacity: 1 - fx.on.value }));
  const trashStyle = useAnimatedStyle(() => ({
    opacity: fx.on.value,
    backgroundColor: fx.overT.value ? '#E0306B' : 'rgba(0,0,0,0.32)',
    transform: [{ scale: withTiming(fx.overT.value ? 1.25 : 0.85 + fx.on.value * 0.15, { duration: 150 }) }],
  }));
  const gVStyle = useAnimatedStyle(() => ({ opacity: withTiming(fx.gV.value * fx.on.value, { duration: 90 }) }));
  const gHStyle = useAnimatedStyle(() => ({ opacity: withTiming(fx.gH.value * fx.on.value, { duration: 90 }) }));
  const MAX_ITEMS = 29; // the story keeps up to 30 things (one is the drawing)
  const full = () => { if (itemsRef.current.length >= MAX_ITEMS) { toast(t('وصلت للحد، احذف شي قبل ما تضيف')); return true; } return false; };

  function saveDraft() {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) { if (draft.id) setItems((l) => l.filter((it) => it.id !== draft.id)); setDraft(null); return; }
    const look = { text, color: draft.color, bg: draft.bg, style: draft.style, align: draft.align, size: draft.size };
    if (draft.id) setItems((l) => l.map((it) => (it.id === draft.id ? { ...it, ...look } : it)));
    else if (!full()) setItems((l) => [...l, { id: newId(), kind: 'text', x: 0.5, y: 0.42, scale: 1, rotation: 0, font: 'display', ...look }]);
    setDraft(null);
  }

  function addSticker(s: NewSticker) {
    if (full()) { setTray(false); return; }
    buzz();
    setItems((l) => [...l, { id: newId(), kind: s.kind, text: s.text, x: 0.5, y: [0.62, 0.3, 0.75, 0.2, 0.45][l.filter((o) => o.kind !== 'draw').length % 5], size: 0.055, scale: 1, rotation: 0, color: '#FFFFFF', bg: 'none', font: 'display', ...s.extra }]);
    setTray(false);
  }

  function tapItem(o: Overlay) {
    if (o.kind === 'text') setDraft({ id: o.id, text: o.text, color: o.color, bg: o.bg, style: o.style ?? 'classic', align: o.align ?? 'center', size: o.size });
    else if (o.kind === 'time') {
      const next = { pill: 'digital', digital: 'mono', mono: 'pill' } as const;
      setItems((l) => l.map((it) => (it.id === o.id ? { ...it, data: { ...it.data, clock: next[it.data?.clock ?? 'pill'] } } : it)));
    }
  }

  /** the framing, background, filter and caption, saved with the story */
  function result(): { media: Picked; overlays: Overlay[] } {
    const w = base.w * sc.value, h = base.h * sc.value;
    const cx = W / 2 + tx.value, cy = H / 2 + ty.value;
    const meta: MediaMeta = {
      rect: { l: (cx - w / 2) / W, t: (cy - h / 2) / H, w: w / W, h: h / H },
      aspect: W / H,
      ...(Math.abs(rot.value) > 0.001 ? { rot: rot.value } : {}),
      ...(m.meta?.trim ? { trim: m.meta.trim } : {}),
      ...(bg < 0 ? { fit: 'blur' as const } : { bg: BACKGROUNDS[bg] }),
      ...(filter !== 'none' ? { filter } : {}),
      ...(caption.trim() ? { caption: caption.trim().slice(0, 200) } : {}),
      ...(noReplies ? { noReplies: true } : {}),
      ...(m.kind === 'video' && soundOff ? { muted: true } : {}),
    };
    const draw: Overlay[] = strokes.length ? [{ id: 'draw', kind: 'draw', text: '', x: 0.5, y: 0.5, size: 0.08, scale: 1, rotation: 0, color: '#FFFFFF', bg: 'none', font: 'display', data: { strokes: strokes.map((st) => ({ ...st, pts: st.pts.map((n) => Math.round(n * 1000) / 1000) })) } }] : [];
    return { media: { ...m, meta, aspect: W / H }, overlays: [...items, ...draw] };
  }

  const changed = items.length > 0 || strokes.length > 0 || filter !== 'none' || caption.trim().length > 0;
  function close() {
    if (!changed) { onCancel(); return; }
    Alert.alert(t('تتجاهل التعديلات؟'), t('إذا طلعت هلأ بتروح التعديلات على هالستوري.'), [
      { text: t('كمّل تعديل'), style: 'cancel' },
      { text: t('تجاهل'), style: 'destructive', onPress: onCancel },
    ]);
  }

  async function save() {
    try {
      if (Platform.OS === 'web') {
        const a = document.createElement('a'); a.href = m.uri; a.download = `unimate-story.${m.kind === 'video' ? 'mp4' : 'jpg'}`; document.body.appendChild(a); a.click(); a.remove();
      } else await Share.share({ url: m.uri });
      toast(t('انحفظت'));
    } catch { /* cancelled */ }
  }

  const bgView = bg < 0 && m.kind === 'image'
    ? (<><Image source={{ uri: m.uri }} style={fill} contentFit="cover" blurRadius={40} /><View style={[fill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} /></>)
    : <LinearGradient colors={BACKGROUNDS[Math.max(0, bg)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fill} />;
  const busyUI = drawing;

  return (
    // a Modal is its own window, so gestures need their own root inside it
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ position: 'absolute', top, left, width: W, height: H, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' }}>
        {bgView}
        {/* the media: drag, pinch and turn it anywhere; tap the background to change its colour */}
        <GestureDetector gesture={mediaGesture}>
          <View style={[fill, { direction: 'ltr' }]}>
            <Animated.View style={[{ position: 'absolute', left: W / 2 - base.w / 2, top: H / 2 - base.h / 2, width: base.w, height: base.h }, mstyle]}>
              {m.kind === 'video'
                ? <TrimmedVideo uri={m.uri} meta={m.meta} fit="cover" style={fill} muted={soundOff || soundBlocked} onSoundBlocked={() => setSoundBlocked(true)} onSize={Platform.OS === 'web' ? undefined : onVideoSize} />
                : <Image source={{ uri: m.uri }} style={fill} contentFit="cover" />}
              {/* a clear sheet over the picture, so the browser never starts dragging the <img> itself */}
              <View style={fill} />
            </Animated.View>
          </View>
        </GestureDetector>
        <FilterLayer id={filter} />

        {drawing
          ? <DrawTool W={W} H={H} strokes={strokes} onChange={setStrokes} onDone={() => setDrawing(false)} />
          : <DrawLayer strokes={strokes} width={W} height={H} />}

        {/* centre guides */}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: W / 2 - 0.75, width: 1.5, backgroundColor: '#00C2FF' }, gVStyle]} />
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 0, right: 0, top: H / 2 - 0.75, height: 1.5, backgroundColor: '#00C2FF' }, gHStyle]} />

        {!drawing && items.map((o) => (
          <Movable key={o.id} o={o} W={W} H={H} trashY={trashY} fx={fx} hidden={draft?.id === o.id}
            onTap={onTapItem} onChange={onItemChange} onDelete={onDelete} />
        ))}

        {/* the filter's name, flashed while swiping */}
        {flash && (
          <Animated.View key={flash.k} entering={FadeIn.duration(150)} exiting={FadeOut.duration(250)} pointerEvents="none" style={{ position: 'absolute', top: H * 0.4, left: 0, right: 0, alignItems: 'center' }}>
            <Text style={{ fontFamily: F.display, fontSize: 30, color: '#fff', textShadowColor: 'rgba(0,0,0,0.45)', textShadowRadius: 10 }}>{flash.name}</Text>
          </Animated.View>
        )}

        {/* close */}
        {!busyUI && (
          <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, height: 64 }, uiStyle]} pointerEvents="box-none">
          <Pressable onPress={close} accessibilityLabel={t('إغلاق')} style={[{ position: 'absolute', top: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, glass, closeSide(10)]}>
            <X size={22} color="#fff" />
          </Pressable>
          </Animated.View>
        )}

        {/* the tools, down the side; the chevron shows their names and the extra tools */}
        {!busyUI && (
          <Animated.View style={[{ position: 'absolute', top: 10, gap: 10, alignItems: TOOL_ALIGN }, LTR, toolSide(10), uiStyle]}>
            {m.kind === 'video' && (
              <Tool label={soundOff ? t('الصوت مطفي') : t('الصوت شغّال')} show={expanded} active={soundOff}
                onPress={() => { if (soundBlocked) { setSoundBlocked(false); setSoundOff(false); return; } setSoundOff((v) => !v); }}>
                {soundOff || soundBlocked ? <VolumeX size={20} color={soundOff ? '#000' : '#fff'} /> : <Volume2 size={20} color="#fff" />}
              </Tool>
            )}
            <Tool label={t('نص')} show={expanded} onPress={() => setDraft({ text: '', color: '#FFFFFF', bg: 'none', style: 'classic', align: 'center', size: 0.075 })}>
              <Type size={20} color="#fff" />
            </Tool>
            <Tool label={t('ملصقات')} show={expanded} onPress={() => setTray('all')}><Smile size={20} color="#fff" /></Tool>
            <Tool label={t('رسم')} show={expanded} onPress={() => { setDrawing(true); setFiltersOpen(false); }}><Brush size={20} color="#fff" /></Tool>
            <Tool label={t('فلاتر')} show={expanded} active={filtersOpen} onPress={() => setFiltersOpen((f) => !f)}><Wand2 size={20} color={filtersOpen ? '#000' : '#fff'} /></Tool>
            {expanded && (
              <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={{ gap: 10, alignItems: TOOL_ALIGN }}>
                <Tool label={t('منشن')} show onPress={() => setTray('mention')}><AtSign size={20} color="#fff" /></Tool>
                <Tool label={t('الخلفية')} show onPress={cycleBg}><Palette size={20} color="#fff" /></Tool>
                {m.kind === 'video' && <Tool label={t('قص الفيديو')} show onPress={() => setTrim(true)}><Scissors size={20} color="#fff" /></Tool>}
                <Tool label={t('حفظ')} show onPress={save}><Download size={20} color="#fff" /></Tool>
                <Tool label={noReplies ? t('الردود موقفة') : t('إيقاف الردود')} show active={noReplies} onPress={() => setNoReplies((v) => !v)}>
                  <MessageCircleOff size={20} color={noReplies ? '#000' : '#fff'} />
                </Tool>
              </Animated.View>
            )}
            <Pressable onPress={() => setExpanded((e) => !e)} accessibilityLabel={expanded ? t('أقل') : t('المزيد')}
              style={[{ width: 40, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, glass]}>
              {expanded ? <ChevronUp size={20} color="#fff" /> : <ChevronDown size={20} color="#fff" />}
            </Pressable>
          </Animated.View>
        )}

        {/* filters along the bottom */}
        {filtersOpen && !busyUI && (
          <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={[{ position: 'absolute', bottom: 54, left: 0, right: 0 }, uiStyle]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
              {FILTERS.map((f) => (
                <Pressable key={f.id} onPress={() => setFilter(f.id)} accessibilityState={{ selected: filter === f.id }} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 54, height: 72, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: filter === f.id ? '#FFFFFF' : 'transparent' }}>
                    {m.kind === 'image' ? <Image source={{ uri: m.uri }} style={fill} contentFit="cover" /> : <View style={[fill, { backgroundColor: '#333' }]} />}
                    <FilterLayer id={f.id} />
                  </View>
                  <Text style={{ fontFamily: F.bodyBold, fontSize: 11, color: '#fff', textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 3 }}>{f.name}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </Animated.View>
        )}

        {/* caption, at the bottom of the frame */}
        {!busyUI && (
          <Animated.View style={[{ position: 'absolute', bottom: 10, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }, uiStyle]}>
            <TextInput value={caption} multiline maxLength={200} onChangeText={(v) => setCaption(v.slice(0, 200))} placeholder={t('أضف وصف…')} placeholderTextColor="rgba(255,255,255,0.75)" keyboardAppearance="dark"
              style={{ flex: 1, minHeight: 36, maxHeight: 84, color: '#fff', fontFamily: F.bodyMd, fontSize: 14, textAlign: isAR ? 'right' : 'left', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
            {caption.length > 150 ? <Text style={{ fontFamily: F.bodyBold, fontSize: 12, color: caption.length >= 200 ? '#FF6B6B' : 'rgba(255,255,255,0.8)', writingDirection: 'ltr' }}>{caption.length}/200</Text> : null}
          </Animated.View>
        )}

        {/* delete zone, shown while dragging */}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: trashY - 26, left: W / 2 - 26, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' }, trashStyle]}>
          <Trash2 size={22} color="#fff" />
        </Animated.View>
      </View>

      {sharing && (
        <View pointerEvents="none" style={{ position: 'absolute', bottom: insets.bottom + 72, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, height: 38, borderRadius: 19, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <ActivityIndicator color="#fff" size="small" />
          <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: '#fff' }}>{media.kind === 'video' ? t('عم نجهّز الفيديو وننشره…') : t('عم ننشر…')}</Text>
        </View>
      )}
      {/* share: your story / close friends / go on */}
      <Animated.View style={[{ position: 'absolute', bottom: insets.bottom + 8, left: 12, right: 12, height: 52, flexDirection: 'row', alignItems: 'center', gap: 8 }, uiStyle, busyUI && { display: 'none' }]} pointerEvents={busyUI ? 'none' : 'auto'}>
        <Pressable onPress={() => { const r = result(); if (onShare) onShare(r.media, r.overlays, 'friends'); else onDone(r.media, r.overlays); }} disabled={sharing} accessibilityLabel={t('شارك بقصتك')}
          style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#262626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#FF6B4A', padding: 1.5 }}><Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={21} /></View>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#fff' }}>{t('قصتك')}</Text>
        </Pressable>
        <Pressable onPress={() => { const r = result(); if (onShare) onShare(r.media, r.overlays, 'close_friends'); else onDone(r.media, r.overlays); }} disabled={sharing} accessibilityLabel={t('شارك مع المقربين')}
          style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#262626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' }}><Star size={14} color="#fff" fill="#fff" /></View>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#fff' }}>{t('المقرّبين')}</Text>
        </Pressable>
        <Pressable onPress={() => { const r = result(); onDone(r.media, r.overlays); }} disabled={sharing} accessibilityLabel={t('التالي')}
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF6B4A', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          {sharing ? <ActivityIndicator color="#0E1430" /> : <ChevronLeft size={24} color="#0E1430" strokeWidth={2.6} style={isAR ? undefined : { transform: [{ scaleX: -1 }] }} />}
        </Pressable>
      </Animated.View>

      <TextTool draft={draft} width={W} onChange={setDraft} onDone={saveDraft} />
      <StickerTray open={!!tray} start={tray === 'mention' ? 'mention' : tray === 'place' ? 'place' : undefined} onClose={() => setTray(false)} onPick={addSticker} />

      {/* videos: choose the part to play (the framing stays the free one above) */}
      {trim && (
        <View style={fill}>
          <MediaCropper src={m} opts={{ mode: 'story', maxSec: 15 }} onCancel={() => setTrim(false)}
            onDone={(r) => { setM((cur) => ({ ...cur, meta: { ...cur.meta, trim: r.media.meta?.trim } })); setTrim(false); }} />
        </View>
      )}
    </GestureHandlerRootView>
  );
}

