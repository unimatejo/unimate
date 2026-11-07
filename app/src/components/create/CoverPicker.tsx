import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Film, Images, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, View } from 'react-native';
import { GestureDetector, GestureHandlerRootView, usePanGesture } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useVideoThumbs } from '@/components/media/videoThumbs';
import { T, Tap } from '@/components/ui';
import { reportError } from '@/lib/errors';
import { t } from '@/lib/i18n';
import { C, R } from '@/lib/theme';
import { pickPhotos, type Picked } from '@/lib/upload';
import { frameAt, type Cover } from '@/lib/videoCover';

const INK = '#F5F6FA', MUTED = 'rgba(245,246,250,0.6)', BG = '#05070F';
const STRIP = 56, KNOB = 40;

/**
 * Choose a video's cover, like Instagram: slide along the video to the moment you want, or take a photo from the
 * gallery instead. Only the part of the video that will be posted (the trim) can be chosen.
 */
export function CoverPicker({ video, onDone, onCancel }: { video: Picked; onDone: (c: Cover) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const player = useVideoPlayer(video.uri, (p) => { p.muted = true; p.loop = false; });
  const full = (video.duration ?? 0) / 1000;
  const [duration, setDuration] = useState(full);
  const start = video.meta?.trim?.start ?? 0;
  const end = Math.min(video.meta?.trim?.end ?? duration, duration || Infinity);
  const span = Math.max(0.1, end - start);
  const [at, setAt] = useState(video.cover?.at ?? start);
  const [photo, setPhoto] = useState<Cover | null>(video.cover && video.cover.at == null ? video.cover : null);
  const [busy, setBusy] = useState(false);
  const aspect = video.meta?.aspect ?? (video.width && video.height ? video.width / video.height : 9 / 16);

  useEffect(() => {
    const s = player.addListener('sourceLoad', (e) => { if (!full && e.duration) setDuration(e.duration); });
    return () => s.remove();
  }, [player, full]);
  useEffect(() => { player.currentTime = at; }, [player]); // eslint-disable-line react-hooks/exhaustive-deps

  const thumbs = useVideoThumbs(video.uri, duration, player, 9);
  const [w, setW] = useState(0);
  const x = useSharedValue(0);
  const room = Math.max(1, w - KNOB);
  useEffect(() => { x.value = ((at - start) / span) * room; }, [w]); // eslint-disable-line react-hooks/exhaustive-deps

  const last = useRef(0);
  const seek = (px: number, settle: boolean) => {
    const now = Date.now();
    if (!settle && now - last.current < 60) return;
    last.current = now;
    const sec = start + (px / room) * span;
    player.currentTime = sec;
    if (settle) { setAt(sec); setPhoto(null); Haptics.selectionAsync().catch(() => {}); }
  };
  const pan = usePanGesture({
    onUpdate: (e) => { 'worklet'; x.value = Math.min(Math.max(0, x.value + e.changeX), room); runOnJS(seek)(x.value, false); },
    onDeactivate: () => { 'worklet'; runOnJS(seek)(x.value, true); },
  });
  const knob = useAnimatedStyle(() => ({ left: x.value }));

  async function fromGallery() {
    try {
      const [p] = await pickPhotos(1);
      if (p) setPhoto({ uri: p.uri, width: p.width, height: p.height });
    } catch (e) { reportError(e); }
  }

  async function done() {
    if (photo) { onDone(photo); return; }
    setBusy(true);
    try { onDone(await frameAt(video.uri, at, player)); }
    catch (e) { reportError(e); Alert.alert(t('ما زبط'), t('ما قدرنا ناخذ هالصورة من الفيديو، جرّب لحظة ثانية.')); }
    finally { setBusy(false); }
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: BG }}>
        <View style={{ flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom + 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, height: 56 }}>
            <Tap onPress={onCancel} accessibilityLabel={t('إلغاء')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={24} color={INK} /></Tap>
            <T v="bold" color={INK} style={{ fontSize: 16 }}>{t('صورة الغلاف')}</T>
            <Tap onPress={done} disabled={busy} accessibilityLabel={t('تم')}
              style={{ minWidth: 64, height: 38, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1 }}>
              {busy ? <ActivityIndicator color={C.onPrimary} /> : <T v="bold" color={C.onPrimary}>{t('تم')}</T>}
            </Tap>
          </View>

          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
            <View style={{ height: '100%', maxWidth: '100%', aspectRatio: aspect, borderRadius: 18, overflow: 'hidden', backgroundColor: '#000' }}>
              {photo ? <Image source={{ uri: photo.uri }} style={{ flex: 1 }} contentFit="cover" transition={120} />
                : <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} playsInline />}
            </View>
          </View>

          <View style={{ gap: 14, paddingHorizontal: 20 }}>
            <T v="tiny" color={MUTED} style={{ textAlign: 'center' }}>
              {photo ? t('هاي الصورة رح تبيّن على الفيديو قبل ما يشتغل') : t('حرّك المربع للّقطة اللي بتجذب اللي بيشوف صفحتك')}
            </T>
            <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height: STRIP + 8, justifyContent: 'center', direction: 'ltr', opacity: photo ? 0.45 : 1 }}>
              <View style={{ height: STRIP, borderRadius: 12, overflow: 'hidden', flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)' }}>
                {thumbs.map((th, i) => <Image key={i} source={th as never} style={{ flex: 1, height: STRIP }} contentFit="cover" />)}
              </View>
              <GestureDetector gesture={pan}>
                <Animated.View accessibilityLabel={t('اللقطة المختارة')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  style={[{ position: 'absolute', top: 0, width: KNOB, height: STRIP + 8, borderRadius: 10, borderWidth: 3, borderColor: INK, backgroundColor: 'rgba(255,255,255,0.12)' }, knob]} />
              </GestureDetector>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
              <Tap onPress={fromGallery} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                <Images size={18} color={INK} /><T v="bold" color={INK}>{t('من الاستوديو')}</T>
              </Tap>
              {photo && (
                <Tap onPress={() => setPhoto(null)} accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: 'rgba(255,255,255,0.12)' }}>
                  <Film size={18} color={INK} /><T v="bold" color={INK}>{t('لقطة من الفيديو')}</T>
                </Tap>
              )}
            </View>
          </View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
