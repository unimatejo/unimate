import { Image } from 'expo-image';
import { useIsFocused } from 'expo-router';
import { Heart, Play, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { FramedMedia } from '@/components/media/FramedMedia';
import { Tap } from '@/components/ui';
import type { MediaMeta } from '@/lib/cropper';
import { mediaUrl, photoWidth, supabase } from '@/lib/supabase';
import { useOnScreen, useVideoSound } from '@/lib/videoFocus';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

function Player({ uri, cover, meta, postId, onDoubleTap }: { uri: string; cover: string | null; meta?: MediaMeta | null; postId?: string; onDoubleTap?: () => void }) {
  const [muted, setMuted] = useVideoSound();
  const onScreen = useOnScreen(postId);
  const focused = useIsFocused();
  // like Instagram: it plays by itself while it's on screen (without sound until sound is turned on once);
  // a tap stops it and another tap plays it again
  const [stopped, setStopped] = useState(false);
  const live = onScreen && focused && !stopped;
  const last = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const burst = useSharedValue(0);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 0.6 + burst.value * 0.6 }] }));
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  function press() {
    const now = Date.now();
    if (now - last.current < 280) {
      if (timer.current) clearTimeout(timer.current);
      last.current = 0;
      burst.value = withSequence(withTiming(1, { duration: 140 }), withTiming(1, { duration: 350 }), withTiming(0, { duration: 220 }));
      onDoubleTap?.();
      return;
    }
    last.current = now;
    timer.current = setTimeout(() => setStopped((x) => !x), 290);
  }
  return (
    <Tap haptic={false} scale={0.995} throttle={0} onPress={press} accessibilityLabel={stopped ? t('شغّل الفيديو') : t('أوقف الفيديو')}
      style={{ marginHorizontal: 10, aspectRatio: 9 / 14, maxHeight: 520, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      {/* framed and trimmed the way it was set in the crop editor; only the cover for a post scrolled past */}
      {onScreen || !cover
        ? <FramedMedia uri={uri} kind="video" meta={meta} video={{ loop: true, muted: muted || !live, paused: !live }} />
        : <Image source={{ uri: cover }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} />}
      {stopped && (
        <View pointerEvents="none" style={{ position: 'absolute', width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Play size={30} color="#fff" fill="#fff" />
        </View>
      )}
      <Animated.View style={burstStyle} pointerEvents="none"><Heart size={90} color="#fff" fill="#fff" /></Animated.View>
      <Tap haptic={false} onPress={() => setMuted(!muted)} accessibilityLabel={muted ? t('شغّل الصوت') : t('اكتم الصوت')} hitSlop={10}
        style={{ position: 'absolute', bottom: 12, left: 12, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center' }}>
        {muted ? <VolumeX size={17} color="#fff" /> : <Volume2 size={17} color="#fff" />}
      </Tap>
    </Tap>
  );
}

// framing / trim of each video (from the crop editor), looked up once per video
const metaCache = new Map<string, MediaMeta | null>();

/** A video inside a post: plays on a loop by itself while on screen; a tap stops or plays it, the corner button turns sound on or off (remembered for every video), a double tap likes. */
export function PostVideo({ path, meta: given, postId, onDoubleTap }: { path: string; meta?: unknown; postId?: string; onDoubleTap?: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  // the feed brings the framing along with the post; older callers look it up once
  const [meta, setMeta] = useState<MediaMeta | null | undefined>(given !== undefined ? (given as MediaMeta | null) : metaCache.get(path));
  useEffect(() => { mediaUrl('posts', path).then(setUri); }, [path]);
  useEffect(() => {
    if (given !== undefined) return;
    if (metaCache.has(path)) { setMeta(metaCache.get(path)); return; }
    supabase.from('post_media').select('meta').eq('url', path).limit(1).maybeSingle()
      .then(({ data }) => { const m = (data?.meta ?? null) as MediaMeta | null; metaCache.set(path, m); setMeta(m); }, () => setMeta(null));
  }, [path, given]);
  // the post's own framing wins as it changes (a new cover chosen after posting shows at once)
  const m = given !== undefined ? (given as MediaMeta | null) : meta;
  const coverPath = m?.cover ?? null;
  const [cover, setCover] = useState<string | null>(null);
  useEffect(() => { if (coverPath) mediaUrl('posts', coverPath, photoWidth(400)).then(setCover); }, [coverPath]);
  if (!uri || m === undefined) return (
    <View style={{ marginHorizontal: 10, aspectRatio: 9 / 14, maxHeight: 520, borderRadius: 22, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Play size={36} color={C.muted} />
    </View>
  );
  return <Player uri={uri} cover={cover} meta={m} postId={postId} onDoubleTap={onDoubleTap} />;
}
