import { FramedMedia } from '@/components/media/FramedMedia';
import { Play, Volume2, VolumeX , Heart } from 'lucide-react-native';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';

import { Tap } from '@/components/ui';
import type { MediaMeta } from '@/lib/cropper';
import { mediaUrl, supabase } from '@/lib/supabase';
import { useOnScreen, useReelSound } from '@/lib/videoFocus';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

function Player({ uri, meta, postId, onDoubleTap }: { uri: string; meta?: MediaMeta | null; postId?: string; onDoubleTap?: () => void }) {
  const [muted, setMuted] = useReelSound();
  const onScreen = useOnScreen(postId);
  const focused = useIsFocused();
  const live = onScreen && focused;
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
    timer.current = setTimeout(() => setMuted(!muted), 290);
  }
  return (
    <Tap haptic={false} scale={0.995} throttle={0} onPress={press} accessibilityLabel={muted ? t('شغّل الصوت') : t('اكتم الصوت')}
      style={{ marginHorizontal: 10, aspectRatio: 9 / 14, maxHeight: 520, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      {/* framed and trimmed the way it was set in the crop editor */}
      <FramedMedia uri={uri} kind="video" meta={meta} video={{ loop: true, muted: muted || !live, paused: !live }} />
      <Animated.View style={burstStyle} pointerEvents="none"><Heart size={90} color="#fff" fill="#fff" /></Animated.View>
      <View style={{ position: 'absolute', bottom: 12, left: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
        {muted ? <VolumeX size={17} color="#fff" /> : <Volume2 size={17} color="#fff" />}
      </View>
    </Tap>
  );
}

// framing / trim of each reel (from the crop editor), looked up once per video
const metaCache = new Map<string, MediaMeta | null>();

/** A reel inside a post: plays on a loop while on screen, tap for sound (remembered for every reel), double tap likes. */
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
  if (!uri || meta === undefined) return (
    <View style={{ marginHorizontal: 10, aspectRatio: 9 / 14, maxHeight: 520, borderRadius: 22, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Play size={36} color={C.muted} />
    </View>
  );
  return <Player uri={uri} meta={meta} postId={postId} onDoubleTap={onDoubleTap} />;
}
