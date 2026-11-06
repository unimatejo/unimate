import { Image } from 'expo-image';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { View, type StyleProp, type ViewStyle, Platform } from 'react-native';

import { FilterLayer } from '@/components/story/filters';

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
export function TrimmedVideo({ uri, meta, loop = true, muted = true, autoPlay = true, paused = false, onEnd, onReady, onError, onSoundBlocked, onSize, style, fit = 'cover' }: {
  uri: string; meta?: MediaMeta | null; loop?: boolean; muted?: boolean; autoPlay?: boolean; paused?: boolean; onEnd?: () => void; onReady?: () => void; onError?: () => void;
  /** the browser refused to start it with sound (needs a tap): it plays muted meanwhile */
  onSoundBlocked?: () => void;
  /** the video's own width and height once known (phones) */
  onSize?: (w: number, h: number) => void;
  style?: StyleProp<ViewStyle>; fit?: 'cover' | 'fill' | 'contain';
}) {
  const trim = meta?.trim;
  const player = useVideoPlayer(uri, (p) => {
    p.loop = loop && !trim;
    p.muted = muted;
    p.timeUpdateEventInterval = trim ? 0.1 : 0;
    if (trim) p.currentTime = trim.start;
    if (autoPlay && !paused) p.play();
  });
  useEffect(() => { player.muted = muted; if (!muted && !paused && Platform.OS === 'web') player.play(); }, [player, muted]); // eslint-disable-line react-hooks/exhaustive-deps
  // phone browsers only start a video WITH sound from a tap: if it didn't start, play it muted and say so
  useEffect(() => {
    if (Platform.OS !== 'web' || muted || paused || !autoPlay) return;
    const tm = setTimeout(() => {
      if (!player.playing) { player.muted = true; player.play(); onSoundBlocked?.(); }
    }, 900);
    return () => clearTimeout(tm);
  }, [player, uri]); // eslint-disable-line react-hooks/exhaustive-deps
  // off screen or on another page: stop (and stay silent) until it's back
  const started = useRef(false);
  useEffect(() => {
    if (paused) player.pause();
    else if (autoPlay || started.current) player.play();
    started.current = true;
  }, [player, paused, autoPlay]);
  useEffect(() => {
    const subs = [
      player.addListener('sourceLoad', ({ availableVideoTracks }) => {
        const sz = availableVideoTracks?.[0]?.size;
        if (sz?.width && sz?.height) onSize?.(sz.width, sz.height);
      }),
      player.addListener('statusChange', ({ status }) => {
        // some players ignore a start time set before the video loaded
        if (status === 'readyToPlay' && trim && player.currentTime < trim.start - 0.2) player.currentTime = trim.start;
        if (status === 'error' && onError) onError();
        else if (status === 'readyToPlay' || status === 'error') onReady?.();
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
  }, [player, trim, loop, onEnd, onReady, onError, onSize]);
  return <VideoView player={player} style={style ?? fill} contentFit={fit} nativeControls={false} playsInline allowsPictureInPicture={false} />;
}

/**
 * A photo or video drawn the way it was framed in the crop editor: a video placed by its rect, a story photo
 * smaller than the screen over a blurred copy of itself. Without meta it simply fills the frame (cover).
 */
export function FramedMedia({ uri, kind, meta, style, video, onImageLoad }: {
  uri: string; kind: 'image' | 'video' | string; meta?: MediaMeta | null; style?: StyleProp<ViewStyle>; onImageLoad?: () => void;
  video?: { loop?: boolean; muted?: boolean; paused?: boolean; onEnd?: () => void; onReady?: () => void; onError?: () => void; autoPlay?: boolean; onSoundBlocked?: () => void };
}) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const placed = place(meta, size.w, size.h);
  // stories: the media can be turned freely
  const at = placed && meta?.rot ? { ...placed, transform: [{ rotate: `${meta.rot}rad` }] } : placed;
  return (
    <View style={[fill, { overflow: 'hidden', direction: 'ltr' }, style]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {meta?.bg ? <LinearGradient colors={meta.bg} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fill} /> : null}
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
      <FilterLayer id={meta?.filter} />
    </View>
  );
}

/** A video's own width and height as it is shown (rotation applied). Browsers only; phones report it through onSize. */
export function measureVideo(uri: string): Promise<{ w: number; h: number } | null> {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    const done = (r: { w: number; h: number } | null) => { v.removeAttribute('src'); v.load(); resolve(r); };
    v.onloadedmetadata = () => done(v.videoWidth && v.videoHeight ? { w: v.videoWidth, h: v.videoHeight } : null);
    v.onerror = () => done(null);
    setTimeout(() => done(null), 6000);
    v.src = uri;
  });
}
