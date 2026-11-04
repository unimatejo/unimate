import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useVideoPlayer, VideoView } from 'expo-video';
import { AtSign, Check, Clock, Crop, FlipHorizontal2, MapPin, Minus, Plus, RotateCw, Smile, Trash2, Type, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture, usePinchGesture, useRotationGesture, useSimultaneousGestures, useTapGesture } from 'react-native-gesture-handler';
import Animated, { FadeIn, runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OverlayBody } from './StoryOverlays';
import { T, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { EMOJIS, newId, TEXT_COLORS, type Overlay } from '@/lib/storyOverlay';
import { supabase } from '@/lib/supabase';
import { F } from '@/lib/theme';
import { LOCALE, nm, t } from '@/lib/i18n';
import type { Picked } from '@/lib/upload';

const glass = { backgroundColor: 'rgba(14,20,48,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' } as const;

function ToolButton({ label, onPress, children, active }: { label: string; onPress: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <Tap onPress={onPress} scale={0.88} accessibilityLabel={label}
      style={[{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }, glass, active && { backgroundColor: '#FFFFFF' }]}>
      {children}
    </Tap>
  );
}

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
    onUpdate: (e) => { 'worklet'; sc.value = Math.min(6, Math.max(0.3, sc.value * e.scaleChange)); },
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
        <OverlayBody o={o} width={W} />
      </Animated.View>
    </GestureDetector>
  );
}

function StoryVideoPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  return <VideoView player={player} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" nativeControls={false} />;
}

type Draft = { id?: string; text: string; color: string; bg: Overlay['bg']; font: Overlay['font']; size: number };

/**
 * Full-screen story editor, like Instagram: text, stickers, mentions, time and place, crop / rotate / flip for photos.
 * Everything placed is kept as data (overlays) and drawn crisp by the viewer.
 */
export function StoryEditor({ media, initial, onCancel, onDone }: {
  media: Picked; initial?: Overlay[]; onCancel: () => void; onDone: (media: Picked, overlays: Overlay[]) => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { university } = useAuth();
  const [m, setM] = useState(media);
  const [items, setItems] = useState<Overlay[]>(initial ?? []);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stickers, setStickers] = useState(false);
  const [crop, setCrop] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [overTrash, setOverTrash] = useState(false);
  const [mention, setMention] = useState('');
  const [mentionErr, setMentionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trashY = H - insets.bottom - 70;
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
    if (draft.id) setItems((l) => l.map((it) => (it.id === draft.id ? { ...it, text, color: draft.color, bg: draft.bg, font: draft.font, size: draft.size } : it)));
    else setItems((l) => [...l, { id: newId(), kind: 'text', text, x: 0.5, y: 0.4, size: draft.size, scale: 1, rotation: 0, color: draft.color, bg: draft.bg, font: draft.font }]);
    setDraft(null);
  }

  function addSticker(kind: Overlay['kind'], text: string, extra: Partial<Overlay> = {}) {
    setItems((l) => [...l, { id: newId(), kind, text, x: 0.5, y: 0.5, size: kind === 'emoji' ? 0.09 : 0.055, scale: 1, rotation: 0, color: '#FFFFFF', bg: 'none', font: 'display', ...extra }]);
    setStickers(false); setMention(''); setMentionErr(null);
  }

  async function addMention() {
    const u = mention.trim().replace(/^@/, '').toLowerCase();
    if (!u) return;
    const { data } = await supabase.from('profiles').select('id, username').ilike('username', u).maybeSingle();
    if (!data) { setMentionErr(t('ما لقينا حد بهاليوزر')); return; }
    addSticker('mention', data.username ?? u, { userId: data.id });
  }

  async function edit(op: 'rotate' | 'flip' | number) {
    if (m.kind !== 'image' || busy) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(m.uri);
      const iw = m.width ?? 1080, ih = m.height ?? 1920;
      if (op === 'rotate') ctx.rotate(90);
      else if (op === 'flip') ctx.flip('horizontal' as never);
      else {
        // crop to an aspect ratio (width / height), centered
        const target = op; const cur = iw / ih;
        const cw = cur > target ? Math.round(ih * target) : iw;
        const ch = cur > target ? ih : Math.round(iw / target);
        ctx.crop({ originX: Math.round((iw - cw) / 2), originY: Math.round((ih - ch) / 2), width: cw, height: ch });
      }
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
      setM({ ...m, uri: out.uri, width: out.width, height: out.height, mime: 'image/jpeg' });
    } catch { /* keep the photo as it was */ } finally { setBusy(false); }
  }

  const timeText = new Date().toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' });

  return (
    // a Modal is its own window, so gestures need their own root inside it
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      {m.kind === 'video' ? <StoryVideoPreview uri={m.uri} /> : (
        // same framing as the story viewer, so what you place is where people see it
        <Image source={{ uri: m.uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={120} />
      )}

      {items.map((o) => (
        <Movable key={o.id} o={o} W={W} H={H}
          onTap={() => { if (o.kind === 'text') setDraft({ id: o.id, text: o.text, color: o.color, bg: o.bg, font: o.font, size: o.size }); }}
          onChange={(n) => setItems((l) => l.map((it) => (it.id === n.id ? n : it)))}
          trashY={trashY} onNear={setOverTrash}
          onDrag={(d, x, y) => onDrag(o.id, d, x, y)} />
      ))}

      {/* top tools */}
      {!dragging && (
        <View style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <ToolButton label={t('إلغاء')} onPress={onCancel}><X size={22} color="#fff" /></ToolButton>
          <View style={{ flex: 1 }} />
          <ToolButton label={t('اكتب')} onPress={() => setDraft({ text: '', color: '#FFFFFF', bg: 'none', font: 'display', size: 0.08 })}><Type size={22} color="#fff" /></ToolButton>
          <ToolButton label={t('ملصقات')} onPress={() => setStickers(true)}><Smile size={22} color="#fff" /></ToolButton>
          {m.kind === 'image' && <ToolButton label={t('قص وتدوير')} active={crop} onPress={() => setCrop((c) => !c)}><Crop size={21} color={crop ? '#0E1430' : '#fff'} /></ToolButton>}
        </View>
      )}

      {crop && !dragging && m.kind === 'image' && (
        <Animated.View entering={FadeIn} style={[{ position: 'absolute', top: insets.top + 66, alignSelf: 'center', flexDirection: 'row', gap: 6, padding: 6, borderRadius: 22 }, glass]}>
          {([[t('أصلي'), 0], ['9:16', 9 / 16], ['4:5', 4 / 5], ['1:1', 1]] as [string, number][]).map(([l, r]) => (
            <Tap key={l} onPress={() => r && edit(r)} disabled={!r || busy} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}>
              <T v="tiny" color="#fff">{l}</T>
            </Tap>
          ))}
          <Tap onPress={() => edit('rotate')} disabled={busy} accessibilityLabel={t('تدوير')} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}><RotateCw size={18} color="#fff" /></Tap>
          <Tap onPress={() => edit('flip')} disabled={busy} accessibilityLabel={t('اقلب')} style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' }}><FlipHorizontal2 size={18} color="#fff" /></Tap>
        </Animated.View>
      )}

      {/* delete zone while dragging */}
      {dragging && (
        <Animated.View entering={FadeIn} pointerEvents="none" style={[{ position: 'absolute', top: trashY - 28, left: W / 2 - 28, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' }, glass, overTrash && { backgroundColor: '#E0306B', transform: [{ scale: 1.2 }] }]}>
          <Trash2 size={24} color="#fff" />
        </Animated.View>
      )}

      {/* bottom: done */}
      {!dragging && (
        <View style={{ position: 'absolute', bottom: insets.bottom + 14, left: 16, right: 16, flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Tap onPress={() => onDone(m, items)} scale={0.94} accessibilityLabel={t('التالي')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 50, paddingHorizontal: 22, borderRadius: 25, backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 14, shadowOffset: { width: 0, height: 6 } }}>
            <T v="bold" color="#0E1430">{t('التالي')}</T><Check size={20} color="#0E1430" />
          </Tap>
        </View>
      )}

      {/* text editor */}
      <Modal visible={!!draft} transparent animationType="fade" onRequestClose={saveDraft}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          {draft && (
            <View style={{ flex: 1, paddingTop: insets.top + 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
                <ToolButton label={t('الخلفية')} onPress={() => setDraft({ ...draft, bg: draft.bg === 'none' ? 'solid' : draft.bg === 'solid' ? 'soft' : 'none' })}>
                  <Text style={{ fontFamily: F.title, fontSize: 16, color: '#fff' }}>{draft.bg === 'none' ? 'A' : draft.bg === 'solid' ? '▣' : '◪'}</Text>
                </ToolButton>
                <ToolButton label={t('الخط')} onPress={() => setDraft({ ...draft, font: draft.font === 'display' ? 'body' : draft.font === 'body' ? 'mono' : 'display' })}>
                  <Text style={{ fontFamily: draft.font === 'mono' ? 'Courier' : draft.font === 'body' ? F.bodyBold : F.display, fontSize: 16, color: '#fff' }}>Aa</Text>
                </ToolButton>
                <ToolButton label={t('أصغر')} onPress={() => setDraft({ ...draft, size: Math.max(0.04, draft.size - 0.01) })}><Minus size={18} color="#fff" /></ToolButton>
                <ToolButton label={t('أكبر')} onPress={() => setDraft({ ...draft, size: Math.min(0.16, draft.size + 0.01) })}><Plus size={18} color="#fff" /></ToolButton>
                <View style={{ flex: 1 }} />
                <Tap onPress={saveDraft} style={{ minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><T v="bold" color="#0E1430">{t('تم')}</T></Tap>
              </View>
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 }}>
                <View style={{ backgroundColor: draft.bg === 'solid' ? draft.color : draft.bg === 'soft' ? 'rgba(0,0,0,0.45)' : 'transparent', borderRadius: 12, paddingHorizontal: draft.bg === 'none' ? 0 : 12 }}>
                  <TextInput autoFocus multiline value={draft.text} onChangeText={(v) => setDraft({ ...draft, text: v.slice(0, 200) })} placeholder={t('اكتب…')} placeholderTextColor="rgba(255,255,255,0.6)" keyboardAppearance="dark"
                    style={{ minWidth: 120, maxWidth: W * 0.9, textAlign: 'center', fontFamily: draft.font === 'mono' ? 'Courier' : draft.font === 'body' ? F.bodyBold : F.display, fontSize: draft.size * W, color: draft.bg === 'solid' ? (draft.color === '#FFFFFF' || draft.color === '#FFB547' || draft.color === '#5EE3A1' ? '#0E1430' : '#FFFFFF') : draft.color }} />
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 14 }}>
                {TEXT_COLORS.map((c) => (
                  <Pressable key={c} onPress={() => setDraft({ ...draft, color: c })} accessibilityLabel={c}
                    style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: draft.color === c ? 3 : 2, borderColor: '#fff' }} />
                ))}
              </ScrollView>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* stickers */}
      <Modal visible={stickers} transparent animationType="slide" onRequestClose={() => setStickers(false)}>
        <Pressable style={{ flex: 1 }} onPress={() => setStickers(false)} accessibilityLabel={t('إغلاق')} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={{ backgroundColor: 'rgba(20,24,40,0.96)', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 16, paddingBottom: insets.bottom + 16, gap: 14 }}>
            <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Tap onPress={() => addSticker('time', timeText)} style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 14, backgroundColor: '#fff' }}>
                <Clock size={18} color="#FF4F7B" /><T v="bold" color="#0E1430">{timeText}</T>
              </Tap>
              <Tap onPress={() => addSticker('place', nm(university) ?? t('الجامعة'))} style={{ flex: 1.4, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 44, borderRadius: 14, backgroundColor: '#fff' }}>
                <MapPin size={18} color="#FF4F7B" /><T v="bold" color="#0E1430" numberOfLines={1}>{nm(university) ?? t('الجامعة')}</T>
              </Tap>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12 }}>
                <AtSign size={18} color="#C9B6FF" />
                <TextInput value={mention} onChangeText={(v) => { setMention(v); setMentionErr(null); }} onSubmitEditing={addMention} placeholder={t('منشن: اكتب اليوزر')} placeholderTextColor="rgba(255,255,255,0.5)"
                  autoCapitalize="none" autoCorrect={false} keyboardAppearance="dark" style={{ flex: 1, color: '#fff', fontFamily: F.body, fontSize: 15, writingDirection: 'ltr', textAlign: 'left' }} />
              </View>
              <Tap onPress={addMention} disabled={!mention.trim()} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: mention.trim() ? '#7C3AED' : 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}><T v="bold" color="#fff">{t('ضيف')}</T></Tap>
            </View>
            {mentionErr && <T v="tiny" color="#FF8FB1">{mentionErr}</T>}
            <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6 }}>
              {EMOJIS.map((e) => (
                <Pressable key={e} onPress={() => addSticker('emoji', e)} accessibilityLabel={e} style={{ width: 52, height: 52, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 34 }}>{e}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </GestureHandlerRootView>
  );
}
