import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { reportError } from './errors';
import type { Picked } from './upload';

/** How a photo / video sits in its frame after the crop editor (saved with the post / story). */
export type MediaMeta = {
  /** where the media is inside the frame, as fractions of the frame (can go past 0..1 when zoomed in) */
  rect?: { l: number; t: number; w: number; h: number };
  /** width/height of the frame the rect is measured in (shown screens cover-fit this shape, so nothing stretches) */
  aspect?: number;
  /** fill the rest of the frame with a blurred copy (story photos smaller than the screen) */
  fit?: 'blur';
  /** seconds of the video to play */
  trim?: { start: number; end: number };
  /** stories: the photo / video turned (radians) around its centre */
  rot?: number;
  /** stories: what fills the frame behind the media — a blurred copy ('blur' fit) or a two-colour gradient */
  bg?: [string, string];
  /** stories: colour filter id (components/story/filters.ts) */
  filter?: string;
  /** stories: written in the editor's "add a caption" field */
  caption?: string;
  /** stories: the author turned replies off */
  noReplies?: boolean;
};

/** post: feed photos / reels · story: fixed 9:16 · chat: free crop, "send" · avatar: square */
export type CropMode = 'post' | 'story' | 'chat' | 'avatar';
export type CropOpts = {
  mode: CropMode;
  /** lock the frame to this width/height (e.g. the first photo of a post decides the rest, reels are 9:16) */
  aspect?: number | null;
  /** longest video the result may play (seconds) */
  maxSec?: number;
};
export type CropResult = { media: Picked; aspect: number };

type Req = { src: Picked; opts: CropOpts; resolve: (r: CropResult | null) => void };
let pending: Req | null = null;
const subs = new Set<(r: Req | null) => void>();

/** Open the full-screen crop editor (rendered once by MediaCropperHost). Resolves with the edited media, or null if cancelled. */
export function openCropper(src: Picked, opts: CropOpts): Promise<CropResult | null> {
  return new Promise((resolve) => {
    if (pending) pending.resolve(null);
    pending = { src, opts, resolve };
    subs.forEach((f) => f(pending));
  });
}

/** Host side: listen for crop requests. */
export function subscribeCropper(f: (r: Req | null) => void) {
  subs.add(f);
  f(pending);
  return () => { subs.delete(f); };
}

/** Host side: finish the current request; waits for the editor's window to close on iPhone before the next screen opens. */
export function finishCropper(r: CropResult | null) {
  const p = pending;
  pending = null;
  subs.forEach((f) => f(null));
  if (!p) return;
  setTimeout(() => p.resolve(r), Platform.OS === 'ios' ? 380 : 0);
}

/** Instagram keeps one shape per post: the first photo's crop decides the rest (centred, adjustable later). */
export async function autoCrop(p: Picked, aspect: number, maxLong = 1440): Promise<Picked> {
  if (p.kind !== 'image' || !p.width || !p.height) return p;
  try {
    const iw = p.width, ih = p.height, cur = iw / ih;
    const cw = cur > aspect ? Math.round(ih * aspect) : iw;
    const ch = cur > aspect ? ih : Math.round(iw / aspect);
    const ctx = ImageManipulator.manipulate(p.uri);
    ctx.crop({ originX: Math.round((iw - cw) / 2), originY: Math.round((ih - ch) / 2), width: cw, height: ch });
    if (Math.max(cw, ch) > maxLong) ctx.resize(cw >= ch ? { width: maxLong } : { height: maxLong });
    const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return { ...p, uri: out.uri, mime: 'image/jpeg', width: out.width, height: out.height, aspect, meta: undefined, orig: p.orig ?? { uri: p.uri, width: iw, height: ih } };
  } catch (e) {
    reportError(e);
    return p;
  }
}

/** Seconds of video that will play after trimming (for story progress bars). */
export function playLength(p: Picked): number | null {
  if (p.kind !== 'video') return null;
  const tr = p.meta?.trim;
  if (tr) return Math.max(1, Math.ceil(tr.end - tr.start));
  return p.duration ? Math.ceil(p.duration / 1000) : null;
}
