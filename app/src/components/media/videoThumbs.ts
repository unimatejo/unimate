import type { VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

/** An image expo-image can draw: a data URL (browsers) or the player's own thumbnail (phones). */
export type Thumb = object;

/** Browsers: draw `n` frames of the video on a small canvas, one after another (no extra download: it's the same file). */
async function webThumbs(uri: string, duration: number, n: number): Promise<Thumb[]> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = uri;
  const once = (ev: string) => new Promise<void>((res, rej) => {
    const ok = () => { v.removeEventListener(ev, ok); res(); };
    v.addEventListener(ev, ok); v.addEventListener('error', () => rej(new Error('video')), { once: true });
    setTimeout(ok, 4000); // a frame that never arrives: keep going with what we have
  });
  await once('loadeddata');
  const h = 72, w = Math.max(24, Math.round(h * ((v.videoWidth || 9) / (v.videoHeight || 16))));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const out: Thumb[] = [];
  for (let i = 0; i < n && g; i++) {
    v.currentTime = Math.min(duration - 0.05, ((i + 0.5) / n) * duration);
    await once('seeked');
    g.drawImage(v, 0, 0, w, h);
    out.push({ uri: c.toDataURL('image/jpeg', 0.6) });
  }
  v.removeAttribute('src'); v.load();
  return out;
}

/** A strip of frames across the whole video, for the trim bar (like Instagram's). Empty until ready, or if it can't. */
export function useVideoThumbs(uri: string | null, duration: number, player: VideoPlayer, n = 8): Thumb[] {
  const [thumbs, setThumbs] = useState<Thumb[]>([]);
  useEffect(() => {
    if (!uri || !(duration > 0)) return;
    let live = true;
    const times = Array.from({ length: n }, (_, i) => ((i + 0.5) / n) * duration);
    const job = Platform.OS === 'web'
      ? webThumbs(uri, duration, n)
      : player.generateThumbnailsAsync(times, { maxWidth: 160 }).then((l) => l as unknown as Thumb[]);
    job.then((l) => { if (live) setThumbs(l); }).catch(() => { /* no strip: the bar still works */ });
    return () => { live = false; };
  }, [uri, duration > 0, n]); // eslint-disable-line react-hooks/exhaustive-deps
  return thumbs;
}
