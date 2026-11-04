import { useVideoPlayer, VideoView } from 'expo-video';
import { Play, Volume2, VolumeX } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Heart } from 'lucide-react-native';

import { Tap } from './ui';
import { mediaUrl } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

function Player({ uri, onDoubleTap }: { uri: string; onDoubleTap?: () => void }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; p.play(); });
  const [muted, setMuted] = useState(true);
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
    timer.current = setTimeout(() => { const m = !player.muted; player.muted = m; setMuted(m); }, 290);
  }
  return (
    <Tap haptic={false} scale={0.995} throttle={0} onPress={press} accessibilityLabel={muted ? t('شغّل الصوت') : t('اكتم الصوت')}
      style={{ marginHorizontal: 10, aspectRatio: 9 / 14, maxHeight: 520, borderRadius: 22, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
      <VideoView player={player} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" nativeControls={false} />
      <Animated.View style={burstStyle} pointerEvents="none"><Heart size={90} color="#fff" fill="#fff" /></Animated.View>
      <View style={{ position: 'absolute', bottom: 12, left: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
        {muted ? <VolumeX size={17} color="#fff" /> : <Volume2 size={17} color="#fff" />}
      </View>
    </Tap>
  );
}

/** A reel inside a post: plays muted on a loop, tap for sound, double tap likes. */
export function PostVideo({ path, onDoubleTap }: { path: string; onDoubleTap?: () => void }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { mediaUrl('posts', path).then(setUri); }, [path]);
  if (!uri) return (
    <View style={{ marginHorizontal: 10, aspectRatio: 9 / 14, maxHeight: 520, borderRadius: 22, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Play size={36} color={C.muted} />
    </View>
  );
  return <Player uri={uri} onDoubleTap={onDoubleTap} />;
}
