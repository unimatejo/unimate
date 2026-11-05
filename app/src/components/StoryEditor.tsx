import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import {
  AtSign, Brush, ChevronDown, ChevronLeft, ChevronUp, Download, MessageCircleOff, Palette, Scissors, Smile, Star, Trash2, Type, Wand2, X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Image as RNImage, Platform, Pressable, ScrollView, Share, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useRotationGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, FadeOut, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TrimmedVideo } from './FramedMedia';
import { MediaCropper } from './MediaCropper';
import { DrawTool } from './story/DrawTool';
import { BACKGROUNDS, FILTERS, FilterLayer } from './story/filters';
import { DrawLayer, StickerBody } from './story/StickerBody';
import { StickerTray, type NewSticker } from './story/StickerTray';
import { TextTool, type TextDraft } from './story/TextTool';
import { Avatar } from './ui';
import { useAuth } from '@/lib/auth';
import type { MediaMeta } from '@/lib/cropper';
import { newId, type Overlay, type Stroke } from '@/lib/storyOverlay';
import { toast } from '@/lib/toast';
import { F } from '@/lib/theme';
import { isAR, LOCALE, t } from '@/lib/i18n';
import type { Picked } from '@/lib/upload';

const fill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const;
const glass = { backgroundColor: 'rgba(0,0,0,0.32)' } as const;
const CALM = { duration: 200 } as const;

/** Toolbar side: right in English, left in Arabic (like Instagram); the close button sits opposite. */
const toolSide = (n: number) => (Platform.OS === 'web' ? (isAR ? { left: n } : { right: n }) : { end: n });
/** icon on the outer edge, its name inward. Web is laid out left-to-right here; native flips row/flex-start by itself in Arabic. */
const WEB = Platform.OS === 'web';
const TOOL_ROW = WEB && isAR ? 'row' as const : 'row-reverse' as const;
const TOOL_ALIGN = WEB && isAR ? 'flex-start' as const : 'flex-end' as const;
const LTR = WEB ? ({ direction: 'ltr' } as object) : {};
const closeSide = (n: number) => (Platform.OS === 'web' ? (isAR ? { right: n } : { left: n }) : { start: n });

/** One movable thing on the story: drag with one finger, pinch to resize, twist to rotate, tap to edit. */
function Movable({ o, W, H, trashY, onTap, onChange, onDrag, onNear }: {
  o: Overlay; W: number; H: number; trashY: number; onTap: () => void; onChange: (o: Overlay) => void; onDrag: (dragging: boolean, x: number, y: number) => void; onNear: (near: boolean) => void;
}) {
  const near = useSharedValue(false);
  const x = useSharedValue(o.x * W), y = useSharedValue(o.y * H), sc = useSharedValue(o.scale), rot = useSharedValue(o.rotation);
  const w = useSharedValue(0), h = useSharedValue(0);
  useEffect(() => { x.value = o.x * W; y.value = o.y * H; sc.value = o.scale; rot.value = o.rotation; }, [o.x, o.y, o.scale, o.rotation, W, H, x, y, sc, rot]);
  const commit = (nx: number, ny: number, ns: number, nr: number) => onChange({ ...o, x: Math.min(1, Math.max(0, nx / W)), y: Math.min(1, Math.max(0, ny / H)), scale: ns, rotation: nr });

  const pan = usePanGesture({
    onActivate: () => { 'worklet'; runOnJS(onDrag)(true, x.value, y.value); },
    onUpdate: (e) => {
      'worklet';
      x.value += e.changeX; y.value += e.changeY;
      const n = y.value > trashY - 50 && Math.abs(x.value - W / 2) < 70;
      if (n !== near.value) { near.value = n; runOnJS(onNear)(n); }
    },
    onDeactivate: () => { 'worklet'; runOnJS(onDrag)(false, x.value, y.value); runOnJS(commit)(x.value, y.value, sc.value, rot.value); },
  });
  const pinch = usePinchGesture({
    onUpdate: (e) => { 'worklet'; sc.value = Math.min(8, Math.max(0.3, sc.value * e.scaleChange)); },
    onDeactivate: () => { 'worklet'; runOnJS(commit)(x.value, y.value, sc.value, rot.value); },
  });
  const rotate = useRotationGesture({
    onUpdate: (e) => { 'worklet'; rot.value += e.rotationChange; },
    onDeactivate: () => { 'worklet'; runOnJS(commit)(x.value, y.value, sc.value, rot.value); },
  });
  const tap = useTapGesture({ onDeactivate: (e) => { 'worklet'; if (!e.canceled) runOnJS(onTap)(); } });
  const gesture = useSimultaneousGestures(pan, pinch, rotate, tap);

  const style = useAnimatedStyle(() => ({
    opacity: w.value ? 1 : 0,
    transform: [{ translateX: x.value - w.value / 2 }, { translateY: y.value - h.value / 2 }, { scale: sc.value }, { rotate: `${rot.value}rad` }],
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[{ position: 'absolute', left: 0, top: 0 }, style]} onLayout={(e) => { w.value = e.nativeEvent.layout.width; h.value = e.nativeEvent.layout.height; }}>
        <View pointerEvents="none"><StickerBody o={o} width={W} /></View>
      </Animated.View>
    </GestureDetector>
  );
}

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
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [trim, setTrim] = useState(false);

  // the media's own shape (from the picker, or measured)
  const [A, setA] = useState<number>(m.width && m.height ? m.width / m.height : 0);
  useEffect(() => {
    if (A || m.kind !== 'image') { if (!A) setA(9 / 16); return; }
    RNImage.getSize(m.uri, (w, h) => setA(w && h ? w / h : 9 / 16), () => setA(9 / 16));
  }, [m.uri, m.kind, A]);
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

  const mpan = usePanGesture({ onUpdate: (e) => { 'worklet'; tx.value += e.changeX; ty.value += e.changeY; } });
  const mpinch = usePinchGesture({ onUpdate: (e) => { 'worklet'; sc.value = Math.min(6, Math.max(0.25, sc.value * e.scaleChange)); } });
  const mrot = useRotationGesture({ onUpdate: (e) => { 'worklet'; rot.value += e.rotationChange; } });
  const cycleBg = () => setBg((b) => { const n = b + 1; return n >= BACKGROUNDS.length ? (m.kind === 'image' ? -1 : 0) : n; });
  const mtap = useTapGesture({ onDeactivate: (e) => { 'worklet'; if (!e.canceled) runOnJS(cycleBg)(); } });
  const mediaGesture = useSimultaneousGestures(mpan, mpinch, mrot, mtap);
  const mstyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: sc.value }, { rotate: `${rot.value}rad` }] }));

  const trashY = H - 64;
  const nearTrash = (x: number, y: number) => y > trashY - 50 && Math.abs(x - W / 2) < 70;
  function onDrag(id: string, d: boolean, x: number, y: number) {
    setDragging(d);
    if (d) { setOverTrash(false); return; }
    if (nearTrash(x, y)) setItems((list) => list.filter((it) => it.id !== id));
    setOverTrash(false);
  }

  function saveDraft() {
    if (!draft) return;
    const text = draft.text.trim();
    if (!text) { if (draft.id) setItems((l) => l.filter((it) => it.id !== draft.id)); setDraft(null); return; }
    const look = { text, color: draft.color, bg: draft.bg, style: draft.style, align: draft.align, size: draft.size };
    if (draft.id) setItems((l) => l.map((it) => (it.id === draft.id ? { ...it, ...look } : it)));
    else setItems((l) => [...l, { id: newId(), kind: 'text', x: 0.5, y: 0.42, scale: 1, rotation: 0, font: 'display', ...look }]);
    setDraft(null);
  }

  function addSticker(s: NewSticker) {
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
    };
    const draw: Overlay[] = strokes.length ? [{ id: 'draw', kind: 'draw', text: '', x: 0.5, y: 0.5, size: 0.08, scale: 1, rotation: 0, color: '#FFFFFF', bg: 'none', font: 'display', data: { strokes } }] : [];
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
  const busyUI = dragging || drawing;

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
                ? <TrimmedVideo uri={m.uri} meta={m.meta} fit="cover" style={fill} />
                : <Image source={{ uri: m.uri }} style={fill} contentFit="cover" />}
            </Animated.View>
          </View>
        </GestureDetector>
        <FilterLayer id={filter} />

        {drawing
          ? <DrawTool W={W} H={H} strokes={strokes} onChange={setStrokes} onDone={() => setDrawing(false)} />
          : <DrawLayer strokes={strokes} width={W} height={H} />}

        {!drawing && items.map((o) => (
          <Movable key={o.id} o={o} W={W} H={H} trashY={trashY} onNear={setOverTrash}
            onTap={() => tapItem(o)}
            onChange={(n) => setItems((l) => l.map((it) => (it.id === n.id ? n : it)))}
            onDrag={(d, x, y) => onDrag(o.id, d, x, y)} />
        ))}

        {/* close */}
        {!busyUI && (
          <Pressable onPress={close} accessibilityLabel={t('إغلاق')} style={[{ position: 'absolute', top: 10, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' }, glass, closeSide(10)]}>
            <X size={22} color="#fff" />
          </Pressable>
        )}

        {/* the tools, down the side; the chevron shows their names and the extra tools */}
        {!busyUI && (
          <Animated.View entering={FadeIn.duration(180)} style={[{ position: 'absolute', top: 10, gap: 10, alignItems: TOOL_ALIGN }, LTR, toolSide(10)]}>
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
          <Animated.View entering={FadeIn.duration(180)} style={{ position: 'absolute', bottom: 54, left: 0, right: 0 }}>
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
          <View style={{ position: 'absolute', bottom: 10, left: 12, right: 12 }}>
            <TextInput value={caption} onChangeText={(v) => setCaption(v.slice(0, 200))} placeholder={t('أضف وصف…')} placeholderTextColor="rgba(255,255,255,0.75)" keyboardAppearance="dark"
              style={{ minHeight: 36, color: '#fff', fontFamily: F.bodyMd, fontSize: 14, textAlign: isAR ? 'right' : 'left', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 4, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as object : {}) }} />
          </View>
        )}

        {/* delete zone while dragging */}
        {dragging && (
          <Animated.View entering={FadeIn.duration(150)} pointerEvents="none" style={[{ position: 'absolute', top: trashY - 26, left: W / 2 - 26, width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' }, glass, overTrash && { backgroundColor: '#E0306B', transform: [{ scale: 1.15 }] }]}>
            <Trash2 size={22} color="#fff" />
          </Animated.View>
        )}
      </View>

      {/* share: your story / close friends / go on */}
      <View style={{ position: 'absolute', bottom: insets.bottom + 8, left: 12, right: 12, height: 52, flexDirection: 'row', alignItems: 'center', gap: 8, opacity: busyUI ? 0 : 1 }} pointerEvents={busyUI ? 'none' : 'auto'}>
        <Pressable onPress={() => { const r = result(); (onShare ? onShare(r.media, r.overlays, 'friends') : onDone(r.media, r.overlays)); }} disabled={sharing} accessibilityLabel={t('شارك بقصتك')}
          style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#262626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#FF6B4A', padding: 1.5 }}><Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={21} /></View>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#fff' }}>{t('قصتك')}</Text>
        </Pressable>
        <Pressable onPress={() => { const r = result(); (onShare ? onShare(r.media, r.overlays, 'close_friends') : onDone(r.media, r.overlays)); }} disabled={sharing} accessibilityLabel={t('شارك مع المقربين')}
          style={({ pressed }) => ({ flex: 1, height: 46, borderRadius: 23, backgroundColor: '#262626', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pressed ? 0.8 : 1 })}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' }}><Star size={14} color="#fff" fill="#fff" /></View>
          <Text style={{ fontFamily: F.bodyBold, fontSize: 14, color: '#fff' }}>{t('المقرّبين')}</Text>
        </Pressable>
        <Pressable onPress={() => { const r = result(); onDone(r.media, r.overlays); }} disabled={sharing} accessibilityLabel={t('التالي')}
          style={({ pressed }) => ({ width: 46, height: 46, borderRadius: 23, backgroundColor: '#FF6B4A', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
          {sharing ? <ActivityIndicator color="#0E1430" /> : <ChevronLeft size={24} color="#0E1430" strokeWidth={2.6} style={isAR ? undefined : { transform: [{ scaleX: -1 }] }} />}
        </Pressable>
      </View>

      <TextTool draft={draft} width={W} onChange={setDraft} onDone={saveDraft}
        onMention={() => { saveDraft(); setTray('mention'); }} onPlace={() => { saveDraft(); setTray('place'); }} />
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

export const storyTimeText = () => new Date().toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });
