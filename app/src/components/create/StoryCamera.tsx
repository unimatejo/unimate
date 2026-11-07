import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Camera, Images, RefreshCcw, Settings, X, Zap, ZapOff } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedProps, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { GalleryGrid } from './GalleryGrid';
import { T, Tap } from '@/components/ui';
import { assetToPicked, cameraModule, captureToPicked, latestAsset, mediaLibrary, type GalleryAsset } from '@/lib/nativeMedia';
import type { Picked } from '@/lib/upload';
import { C, R } from '@/lib/theme';
import { afterSheet } from '@/components/chat/ChatExtras';
import { t } from '@/lib/i18n';

const ACircle = Animated.createAnimatedComponent(Circle);
const SHUTTER = 78;
const RING = 2 * Math.PI * 40;

type Props = {
  maxSec: number;
  /** a photo / video was taken or chosen: go straight to the editor */
  onPicked: (m: Picked) => void;
  onClose: () => void;
  /** the gallery button when the phone's gallery can't be listed (web, older app builds) */
  onSystemPicker: () => void;
  /** post / story switcher under the shutter */
  footer?: ReactNode;
};

/** Instagram-style story camera: full screen, tap to shoot, hold to record, slide up while holding to zoom. */
// expo-camera is optional (missing on some builds): pick the permission hooks once, so hooks always run in the same order
const NO_PERM = (): [{ granted: boolean; canAskAgain: boolean } | null, () => Promise<unknown>] => [null, async () => null];
const useCameraPermissions = cameraModule()?.useCameraPermissions ?? NO_PERM;
const useMicrophonePermissions = cameraModule()?.useMicrophonePermissions ?? NO_PERM;

export function StoryCamera({ maxSec, onPicked, onClose, onSystemPicker, footer }: Props) {
  const Cam = cameraModule();
  const { width, height } = useWindowDimensions();
  const ref = useRef<import('expo-camera').CameraView | null>(null);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [flash, setFlash] = useState(false);
  const [mode, setMode] = useState<'picture' | 'video'>('picture');
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thumb, setThumb] = useState<GalleryAsset | null>(null);
  const [sheet, setSheet] = useState(false);
  const [pickBusy, setPickBusy] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0);
  const progress = useSharedValue(0);
  const press = useSharedValue(0);
  const startedAt = useRef(0);
  const canRecord = Platform.OS !== 'web';

  const [perm, requestPerm] = useCameraPermissions();
  const [mic, requestMic] = useMicrophonePermissions();

  useEffect(() => { if (perm && !perm.granted && perm.canAskAgain) requestPerm(); }, [perm?.granted]); // eslint-disable-line react-hooks/exhaustive-deps
  // the microphone is asked together with the camera, so the first video already has sound
  useEffect(() => { if (canRecord && perm?.granted && mic && !mic.granted && mic.canAskAgain) requestMic(); }, [perm?.granted, mic?.granted]); // eslint-disable-line react-hooks/exhaustive-deps
  // seconds recorded, for the red "recording" bar
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!recording) { setSecs(0); return; }
    const iv = setInterval(() => setSecs(Math.floor((Date.now() - startedAt.current) / 1000)), 250);
    return () => clearInterval(iv);
  }, [recording]);
  useEffect(() => { if (mediaLibrary()) latestAsset().then(setThumb); }, []);

  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: RING * (1 - progress.value) }));
  const shutterStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + press.value * 0.18 }] }));
  const innerStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 - press.value * 0.28 }], borderRadius: 30 - press.value * 18 }));

  async function shoot() {
    if (!ref.current || busy || recording || !ready) return;
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const p = await ref.current.takePictureAsync({ quality: 0.9, skipProcessing: Platform.OS === 'android' });
      if (p?.uri) onPicked(await captureToPicked({ uri: p.uri, width: p.width, height: p.height, kind: 'image' }));
    } catch { /* camera busy: try again */ } finally { setBusy(false); }
  }

  async function startRecord() {
    if (!canRecord || recording || busy || !Cam) return;
    if (!mic?.granted) await requestMic(); // if refused, it records without sound
    if (mode !== 'video') { setMode('video'); await new Promise((r) => setTimeout(r, 350)); }
    if (!ref.current) return;
    setRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    press.value = withTiming(1, { duration: 180 });
    progress.value = 0;
    progress.value = withTiming(1, { duration: maxSec * 1000, easing: Easing.linear });
    startedAt.current = Date.now();
    try {
      const v = await ref.current.recordAsync({ maxDuration: maxSec });
      const ms = Date.now() - startedAt.current;
      if (v?.uri && ms > 400) onPicked(await captureToPicked({ uri: v.uri, kind: 'video', durationMs: Math.min(ms, maxSec * 1000) }));
    } catch { /* recording failed */ }
    finally {
      setRecording(false);
      cancelAnimation(progress); progress.value = withTiming(0, { duration: 200 });
      press.value = withTiming(0, { duration: 180 });
      setMode('picture');
    }
  }
  function stopRecord() { if (recording) ref.current?.stopRecording(); }

  // hold the shutter to record; slide your finger up while holding to zoom in
  const tap = Gesture.Tap().maxDuration(260).onEnd((_e, ok) => { if (ok) runOnJS(shoot)(); });
  const hold = Gesture.LongPress().minDuration(260).maxDistance(4000).onStart(() => { runOnJS(startRecord)(); });
  const slide = Gesture.Pan().activateAfterLongPress(260)
    .onUpdate((e) => { runOnJS(setZoom)(Math.max(0, Math.min(1, -e.translationY / (height * 0.5)))); })
    .onFinalize(() => { runOnJS(stopRecord)(); runOnJS(setZoom)(0); });
  const shutter = Gesture.Simultaneous(Gesture.Exclusive(hold, tap), slide);

  async function pickAsset(a: GalleryAsset) {
    if (pickBusy) return;
    setPickBusy(a.id);
    try { const m = await assetToPicked(a); setSheet(false); afterSheet(() => onPicked(m)); } finally { setPickBusy(null); }
  }
  function openGallery() {
    Haptics.selectionAsync().catch(() => {});
    if (mediaLibrary()) setSheet(true); else onSystemPicker();
  }

  const top = (
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 6 }}>
      <Tap onPress={onClose} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={28} color="#fff" /></Tap>
      {Cam && perm?.granted && (
        <Tap onPress={() => setFlash((f) => !f)} accessibilityLabel={flash ? t('أطفئ الفلاش') : t('شغّل الفلاش')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          {flash ? <Zap size={24} color="#fff" fill="#fff" /> : <ZapOff size={24} color="#fff" />}
        </Tap>
      )}
    </View>
  );

  // no camera here (older app, or a browser without one): the gallery still works
  if (!Cam || (perm && !perm.granted)) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <SafeAreaView style={{ flex: 1 }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 28 }}>
            <View style={{ width: 76, height: 76, borderRadius: 38, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' }}><Camera size={32} color="#fff" /></View>
            <T v="h3" color="#fff" style={{ textAlign: 'center' }}>{Cam ? t('اسمح بالكاميرا') : t('قصة جديدة')}</T>
            <T v="small" color="rgba(255,255,255,0.7)" style={{ textAlign: 'center', maxWidth: 290 }}>
              {Cam ? t('لتتمكن من تصوير قصة من داخل يونيميت. يمكنك أيضًا الاختيار من صورك.') : t('اختر صورة أو فيديو من جهازك.')}
            </T>
            {Cam && perm && !perm.granted && (
              <Tap onPress={() => (perm.canAskAgain ? requestPerm() : Linking.openSettings())} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 20, borderRadius: R.pill, backgroundColor: '#fff' }}>
                <Settings size={16} color="#0E1430" /><T v="bold" color="#0E1430">{perm.canAskAgain ? t('اسمح بالكاميرا') : t('افتح الإعدادات')}</T>
              </Tap>
            )}
            <Tap onPress={openGallery} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 20, borderRadius: R.pill, backgroundColor: C.primary }}>
              <Images size={18} color={C.onPrimary} /><T v="bold" color={C.onPrimary}>{t('اختر من جهازك')}</T>
            </Tap>
          </View>
          {footer}
          {top}
        </SafeAreaView>
        <GallerySheet open={sheet} onClose={() => setSheet(false)} onPick={pickAsset} busyId={pickBusy} />
      </View>
    );
  }

  const CameraView = Cam.CameraView;
  const camH = Math.min(height, width * 16 / 9);
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
      <SafeAreaView style={{ flex: 1 }}>
        <View style={{ width, height: camH, borderRadius: 22, overflow: 'hidden', backgroundColor: '#111', alignSelf: 'center', flexShrink: 1 }}>
          {!perm ? <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#fff" /></View> : (
            <CameraView ref={ref} style={{ flex: 1 }} facing={facing} mode={mode} zoom={zoom} flash={flash ? 'on' : 'off'} enableTorch={flash && recording}
              mirror={facing === 'front'} mute={!mic?.granted} videoQuality="1080p" animateShutter={false}
              onCameraReady={() => setReady(true)} />
          )}
          {top}
          {/* recording: a red line across the top and a red pill with the time, like the phone's own camera */}
          {recording && <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, backgroundColor: '#FF3B30' }} />}
          {recording && (
            <View accessibilityLiveRegion="polite" accessibilityLabel={t('جارٍ التسجيل')} style={{ position: 'absolute', top: 14, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,59,48,0.92)' }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff' }} />
              <T v="bold" color="#fff" style={{ fontSize: 13 }}>{`0:${String(Math.min(secs, maxSec)).padStart(2, '0')} / 0:${String(maxSec).padStart(2, '0')}`}</T>
            </View>
          )}
          {/* bottom controls over the viewfinder */}
          <View style={{ position: 'absolute', bottom: 22, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 26 }}>
            <Tap onPress={openGallery} accessibilityLabel={t('الصور')} style={{ width: 44, height: 44, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#fff', backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' }}>
              {thumb ? <Image source={{ uri: thumb.uri }} style={{ width: 40, height: 40 }} contentFit="cover" /> : <Images size={20} color="#fff" />}
            </Tap>
            <GestureDetector gesture={shutter}>
              <Animated.View accessible accessibilityRole="button" accessibilityLabel={canRecord ? t('صوّر، أو اضغط مطوّلًا لتسجيل فيديو') : t('صوّر')}
                style={[{ width: SHUTTER + 14, height: SHUTTER + 14, alignItems: 'center', justifyContent: 'center' }, shutterStyle]}>
                <Svg width={SHUTTER + 14} height={SHUTTER + 14} style={{ position: 'absolute' }} viewBox="0 0 92 92">
                  <Circle cx={46} cy={46} r={40} stroke="rgba(255,255,255,0.9)" strokeWidth={5} fill="none" />
                  <ACircle cx={46} cy={46} r={40} stroke="#FF5A72" strokeWidth={5} fill="none" strokeDasharray={RING} animatedProps={ringProps} strokeLinecap="round" transform="rotate(-90 46 46)" />
                </Svg>
                <Animated.View style={[{ width: SHUTTER - 16, height: SHUTTER - 16, backgroundColor: recording ? '#FF5A72' : '#fff' }, innerStyle]} />
                {busy && <ActivityIndicator color="#0E1430" style={{ position: 'absolute' }} />}
              </Animated.View>
            </GestureDetector>
            <Tap onPress={() => { Haptics.selectionAsync().catch(() => {}); setFacing((f) => (f === 'back' ? 'front' : 'back')); }} accessibilityLabel={t('بدّل الكاميرا')}
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
              <RefreshCcw size={22} color="#fff" />
            </Tap>
          </View>
          {!recording && (
            <T v="tiny" color="rgba(255,255,255,0.75)" style={{ position: 'absolute', bottom: 2, alignSelf: 'center' }}>
              {canRecord ? t('اضغط لالتقاط صورة، واضغط مطولاً للفيديو') : t('اضغط لالتقاط صورة')}
            </T>
          )}
        </View>
        {footer}
      </SafeAreaView>
      <GallerySheet open={sheet} onClose={() => setSheet(false)} onPick={pickAsset} busyId={pickBusy} />
    </GestureHandlerRootView>
  );
}

/**
 * The photos sheet that slides up from the camera's gallery button (Instagram): drag the handle up for the full
 * screen, down to close. Three per row, newest first; a tap opens the photo or video full screen to frame it.
 */
function GallerySheet({ open, onClose, onPick, busyId }: { open: boolean; onClose: () => void; onPick: (a: GalleryAsset) => void; busyId: string | null }) {
  const { height } = useWindowDimensions();
  const low = height * 0.62, high = height * 0.94;
  const h = useSharedValue(low);
  const start = useSharedValue(low);
  useEffect(() => { if (open) h.value = low; }, [open, low, h]);
  const drag = Gesture.Pan()
    .onStart(() => { start.value = h.value; })
    .onUpdate((e) => { h.value = Math.max(low * 0.5, Math.min(high, start.value - e.translationY)); })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 900) { runOnJS(onClose)(); return; }
      h.value = withTiming(h.value > (low + high) / 2 || e.velocityY < -700 ? high : low, { duration: 220 });
    });
  const panel = useAnimatedStyle(() => ({ height: h.value }));
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} accessibilityLabel={t('إغلاق')} />
        <Animated.View style={[{ backgroundColor: '#0B0F22', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }, panel]}>
          <GestureDetector gesture={drag}>
            <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 10, gap: 8 }} accessibilityHint={t('اسحب لأعلى لملء الشاشة')}>
              <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' }} />
              <T v="bold" color="#fff">{t('أضف إلى القصة')}</T>
            </View>
          </GestureDetector>
          {open && <GalleryGrid kind="all" album={null} selected={[]} multi={false} cols={3} activeId={null} busyId={busyId} onPick={onPick} contentBottom={40} />}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}
