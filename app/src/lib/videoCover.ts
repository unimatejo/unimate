import { createVideoPlayer, type VideoPlayer } from 'expo-video';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

/** A still picked for a video: the frame at `at` seconds, or a photo from the gallery (no `at`). */
export type Cover = { uri: string; width?: number; height?: number; at?: number };

const SIDE = 1080;

/** Browsers: the frame at `sec`, drawn on a canvas and kept as a JPEG blob URL. */
async function webFrame(uri: string, sec: number): Promise<Cover> {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.preload = 'auto'; v.crossOrigin = 'anonymous'; v.src = uri;
  const wait = (ev: string) => new Promise<void>((res, rej) => {
    const ok = () => { v.removeEventListener(ev, ok); res(); };
    v.addEventListener(ev, ok);
    v.addEventListener('error', () => rej(new Error('video')), { once: true });
  });
  await wait('loadeddata');
  v.currentTime = Math.max(0, Math.min(sec, (v.duration || sec) - 0.05));
  await wait('seeked');
  const k = Math.min(1, SIDE / Math.max(v.videoWidth, v.videoHeight, 1));
  const c = document.createElement('canvas');
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext('2d')?.drawImage(v, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.85));
  v.removeAttribute('src'); v.load();
  if (!blob) throw new Error('frame');
  return { uri: URL.createObjectURL(blob), width: c.width, height: c.height, at: sec };
}

/** Phones: the player's own frame at `sec`, saved as a JPEG file. */
async function nativeFrame(player: VideoPlayer, sec: number): Promise<Cover> {
  const [thumb] = await player.generateThumbnailsAsync([sec], { maxWidth: SIDE });
  if (!thumb) throw new Error('frame');
  const out = await (await ImageManipulator.manipulate(thumb).renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
  return { uri: out.uri, width: out.width, height: out.height, at: sec };
}

/**
 * The frame of a video at `sec`. Pass the screen's player when there is one (no second decoder);
 * otherwise a short-lived one is made for the file.
 */
export async function frameAt(uri: string, sec: number, player?: VideoPlayer): Promise<Cover> {
  if (Platform.OS === 'web') return webFrame(uri, sec);
  if (player) return nativeFrame(player, sec);
  const own = createVideoPlayer(uri);
  try { return await nativeFrame(own, sec); } finally { own.release(); }
}
