import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import type { MediaMeta } from '@/lib/cropper';

const fill = { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } as const;

/** Where the media goes inside a frame of W×H, from the crop editor's rect (fractions of the frame). */
function place(meta: MediaMeta | null | undefined, W: number, H: number) {
  const r = meta?.rect;
  if (!r || !W || !H) return null;
  // the editor's frame, cover-fitted into this box (a 9:16 story on a taller phone is cut a little, never stretched)
  const A = meta?.aspect;
  let vw = W, vh = H;
  if (A && A > 0) { if (W / H > A) { vw = W; vh = W / A; } else { vh = H; vw = H * A; } }
  const ox = (W - vw) / 2, oy = (H - vh) / 2;
  return { position: 'absolute' as const, left: ox + r.l * vw, top: oy + r.t * vh, width: r.w * vw, height: r.h * vh };
}

/** A video that respects the crop editor's trim (start → end) and calls onEnd once it reaches the end. */
export function TrimmedVideo({ uri, meta, loop = true, muted = true, autoPlay = true, onEnd, onReady, style, fit = 'cover' }: {
  uri: string; meta?: MediaMeta | null; loop?: boolean; muted?: boolean; autoPlay?: boolean; onEnd?: () => void; onReady?: () => void;
  style?: StyleProp<ViewStyle>; fit?: 'cover' | 'fill' | 'contain';
}) {
  const trim = meta?.trim;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop && !trim;
    p.muted = muted;
    p.timeUpdateEventInterval = trim ? 0.1 : 0;
    if (trim) p.currentTime = trim.start;
    if (autoPlay) p.play();
  });
  useEffect(() => { player.muted = muted; }, [player, muted]);
  useEffect(() => {
    const subs = [
      player.addListener('statusChange', ({ status }) => {
        // some players ignore a start time set before the video loaded
        if (status === 'readyToPlay' && trim && player.currentTime < trim.start - 0.2) player.currentTime = trim.start;
        if (status === 'readyToPlay' || status === 'error') onReady?.();
      }),
      player.addListener('playToEnd', () => {
        if (trim && loop) { player.currentTime = trim.start; player.play(); return; }
        onEnd?.();
      }),
    ];
    if (trim) subs.push(player.addListener('timeUpdate', ({ currentTime }) => {
      if (currentTime < trim.end) return;
      if (loop) { player.currentTime = trim.start; return; }
      player.pause();
      onEnd?.();
    }));
    return () => subs.forEach((s) => s.remove());
  }, [player, trim, loop, onEnd, onReady]);
  return <VideoView player={player} style={style ?? fill} contentFit={fit} nativeControls={false} />;
}

/**
 * A photo or video drawn the way it was framed in the crop editor: a video placed by its rect, a story photo
 * smaller than the screen over a blurred copy of itself. Without meta it simply fills the frame (cover).
 */
export function FramedMedia({ uri, kind, meta, style, video, onImageLoad }: {
  uri: string; kind: 'image' | 'video' | string; meta?: MediaMeta | null; style?: StyleProp<ViewStyle>; onImageLoad?: () => void;
  video?: { loop?: boolean; muted?: boolean; onEnd?: () => void; onReady?: () => void; autoPlay?: boolean };
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const at = place(meta, size.w, size.h);
  return (
    <View style={[fill, { overflow: 'hidden', direction: 'ltr' }, style]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {kind === 'video' ? (
        <>
          {meta?.rect && !at ? null : (
            <TrimmedVideo uri={uri} meta={meta} style={at ?? fill} fit={at ? 'fill' : 'cover'} {...video} />
          )}
        </>
      ) : (
        <>
          {meta?.fit === 'blur' && <Image source={{ uri }} style={fill} contentFit="cover" blurRadius={40} />}
          {meta?.fit === 'blur' && <View style={[fill, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />}
          {at ? <Image source={{ uri }} style={at} contentFit="fill" transition={120} onLoad={onImageLoad} onError={onImageLoad} />
            : <Image source={{ uri }} style={fill} contentFit="cover" transition={120} onLoad={onImageLoad} onError={onImageLoad} />}
        </>
      )}
    </View>
  );
}
