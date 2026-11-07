import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

import { openCropper, type CropMode, type MediaMeta } from './cropper';
import { reportError } from './errors';
import { UserError } from './run';
import { supabase, thumbPath } from './supabase';
import type { Cover } from './videoCover';
import { shrinkVideo } from './videoShrink';
import { t } from './i18n';

export type Picked = {
  uri: string; mime: string; kind: 'image' | 'video'; duration?: number | null; size?: number | null; width?: number; height?: number;
  /** framing from the crop editor (videos, story photos), saved with the post / story */
  meta?: MediaMeta;
  /** the frame's width/height chosen in the crop editor */
  aspect?: number;
  /** the photo as picked, so editing again starts from the full picture */
  orig?: { uri: string; width?: number; height?: number };
  /** videos: the still chosen as the cover (a frame of the video or a gallery photo) */
  cover?: Cover;
};

/**
 * Pick a photo or short video. `square` opens the system crop (like Instagram's profile photo);
 * photos are resized and saved as JPEG so every phone (including HEIC iPhones) uploads the same way.
 */
/** Shrinks a photo so its LONGER side is at most `max` (tall portrait photos too, not only wide ones). */
export function fitLongSide(ctx: { resize: (s: { width?: number; height?: number }) => unknown }, w?: number | null, h?: number | null, max = 2400) {
  const W = w ?? 0, H = h ?? 0;
  if (Math.max(W, H) <= max) return;
  if (W >= H) ctx.resize({ width: max }); else ctx.resize({ height: max });
}

export async function pickMedia(opts: { video?: boolean; maxSec?: number; camera?: boolean; square?: boolean; maxWidth?: number; crop?: CropMode; aspect?: number | null; anyLength?: boolean } = {}): Promise<Picked | null> {
  const p = await pickRaw(opts);
  if (!p || !opts.crop) return p;
  // like Instagram: every photo / video goes through the crop editor before it's used
  const r = await openCropper(p, { mode: opts.crop, aspect: opts.aspect, maxSec: opts.maxSec ?? 15 });
  return r ? { ...r.media, aspect: r.aspect } : null;
}

async function pickRaw(opts: { video?: boolean; maxSec?: number; camera?: boolean; square?: boolean; maxWidth?: number; crop?: CropMode; anyLength?: boolean }): Promise<Picked | null> {
  const maxSec = opts.maxSec ?? 15;
  // from the gallery a video of any length is fine when it goes to the editor next: the student picks the part to keep there
  const trimLater = (!!opts.crop || !!opts.anyLength) && !opts.camera;
  const pickMax = trimLater ? Infinity : maxSec;
  // the web needs no permission, and waiting for one would make the browser block the picker (it must open from the tap)
  const perm = Platform.OS === 'web' ? { granted: true } : opts.camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(opts.camera ? t('الوصول إلى الكاميرا غير مسموح') : t('الوصول إلى الصور غير مسموح'), t('افتح الإعدادات واسمح ليونيميت بالوصول إلى الصور والكاميرا.'), [
      { text: t('لاحقاً'), style: 'cancel' }, { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() },
    ]);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: opts.video ? ['images', 'videos'] : ['images'],
    quality: 0.85,
    videoMaxDuration: opts.camera ? maxSec : trimLater ? undefined : pickMax,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame960x540,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
  };
  const res = opts.camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.type === 'video') {
    // the browser reports seconds, phones milliseconds
    const durMs = a.duration == null ? null : Platform.OS === 'web' ? a.duration * 1000 : a.duration;
    if ((durMs ?? 0) > pickMax * 1000 + 500) { Alert.alert(t('الفيديو طويل'), t('يجب أن تكون مدة الفيديو {0} ثانية أو أقل.', [pickMax])); return null; }
    if ((a.fileSize ?? 0) > (trimLater ? 600 : 50) * 1048576) { Alert.alert(t('الفيديو كبير'), t('جرّب فيديو أقصر.')); return null; }
    return { uri: a.uri, mime: a.mimeType ?? 'video/mp4', kind: 'video', duration: durMs, size: a.fileSize, width: a.width || undefined, height: a.height || undefined };
  }
  // resize + JPEG: smaller uploads, no HEIC surprises
  try {
    const ctx = ImageManipulator.manipulate(a.uri);
    const maxW = opts.crop ? 2400 : opts.maxWidth ?? (opts.square ? 720 : 1440);
    fitLongSide(ctx, a.width, a.height, maxW);
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
    return { uri: out.uri, mime: 'image/jpeg', kind: 'image', width: out.width, height: out.height };
  } catch (e) {
    reportError(e);
    return { uri: a.uri, mime: a.mimeType ?? 'image/jpeg', kind: 'image', width: a.width, height: a.height };
  }
}

/** Pick a PDF (summaries, notes). Max 10MB, the posts bucket limit. */
export async function pickPdf(): Promise<{ uri: string; mime: string; name: string; size: number | null } | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if ((a.size ?? 0) > 10 * 1048576) { Alert.alert(t('الملف كبير'), t('الحد الأقصى للحجم 10 ميغابايت.')); return null; }
  return { uri: a.uri, mime: 'application/pdf', name: a.name ?? t('ملف.pdf'), size: a.size ?? null };
}

/**
 * Pick up to `max` photos at once (posts with several photos), and videos too when `videos` is set. Photos are saved
 * as JPEG, kept large: the crop step resizes. Videos come as they are (the editor trims them).
 */
export async function pickPhotos(max = 10, videos = false): Promise<Picked[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(t('الوصول إلى الصور غير مسموح'), t('افتح الإعدادات واسمح ليونيميت بالوصول إلى الصور والكاميرا.'), [
      { text: t('لاحقاً'), style: 'cancel' }, { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() },
    ]);
    return [];
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: videos ? ['images', 'videos'] : ['images'], allowsMultipleSelection: true, selectionLimit: max, orderedSelection: true, quality: 0.85 });
  if (res.canceled) return [];
  const out: Picked[] = [];
  for (const a of res.assets.slice(0, max)) {
    if (a.type === 'video') {
      // the browser reports seconds, phones milliseconds
      const ms = a.duration == null ? null : Platform.OS === 'web' ? a.duration * 1000 : a.duration;
      out.push({ uri: a.uri, mime: a.mimeType ?? 'video/mp4', kind: 'video', duration: ms, size: a.fileSize, width: a.width || undefined, height: a.height || undefined });
      continue;
    }
    try {
      const ctx = ImageManipulator.manipulate(a.uri);
      fitLongSide(ctx, a.width, a.height, 2400);
      const img = await ctx.renderAsync();
      const o = await img.saveAsync({ compress: 0.82, format: SaveFormat.JPEG });
      out.push({ uri: o.uri, mime: 'image/jpeg', kind: 'image', width: o.width, height: o.height });
    } catch (e) {
      reportError(e);
      out.push({ uri: a.uri, mime: a.mimeType ?? 'image/jpeg', kind: 'image', width: a.width, height: a.height });
    }
  }
  return out;
}

/** Photos go up at most 1440 px on the long side as JPEG (what Instagram serves too): a few hundred KB instead of
 *  several MB, so they go up on a weak connection and load fast for everyone. Already-small photos are left alone. */
const PHOTO_SIDE = 1440;
export async function lightImage<T extends { uri: string; mime: string; width?: number; height?: number }>(f: T): Promise<T> {
  if (!/^image\/(jpeg|jpg|png|heic|heif|webp)$/i.test(f.mime)) return f;
  const long = Math.max(f.width ?? 0, f.height ?? 0);
  if (long && long <= PHOTO_SIDE && /jpe?g/i.test(f.mime)) return f;
  try {
    const ctx = ImageManipulator.manipulate(f.uri);
    if (!long || long > PHOTO_SIDE) fitLongSide(ctx, f.width ?? PHOTO_SIDE + 1, f.height ?? 0, PHOTO_SIDE);
    const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
    return { ...f, uri: out.uri, mime: 'image/jpeg', width: out.width, height: out.height };
  } catch (e) { reportError(e); return f; }
}

const THUMB_BUCKETS = new Set(['posts', 'chat', 'stories']);
/** The small copy of a photo shown in lists and grids (`<name>.t.jpg` next to it), see `thumbPath` in lib/supabase. */
const THUMB_SIDE = 480;
async function uploadThumb(bucket: string, path: string, f: { uri: string; width?: number; height?: number }) {
  try {
    const ctx = ImageManipulator.manipulate(f.uri);
    fitLongSide(ctx, f.width ?? THUMB_SIDE + 1, f.height ?? 0, THUMB_SIDE);
    const out = await (await ctx.renderAsync()).saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    const { error } = await supabase.storage.from(bucket).upload(thumbPath(path), await readBytes(out.uri), { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
  } catch (e) { reportError(e); } // the full photo still shows; lists just use it instead
}

/**
 * A video's cover: the still shown before it plays and in the profile grid, stored next to the video
 * (`<name>.jpg`, with its small copy `<name>.t.jpg`; one changed later is `<name>.c<time>.jpg`). Returns its path, or null if it couldn't go up
 * (the video is posted anyway and shows its first frame).
 */
export async function uploadCover(bucket: string, videoPath: string, cover: { uri: string; width?: number; height?: number }, again = false): Promise<string | null> {
  try {
    const f = await lightImage({ ...cover, mime: 'image/jpeg' });
    // a cover changed after posting gets a name of its own, so the old one is never overwritten while it's shown
    const path = videoPath.replace(/\.[a-z0-9]+$/i, again ? `.c${Date.now().toString(36)}.jpg` : '.jpg');
    const { error } = await supabase.storage.from(bucket).upload(path, await readBytes(f.uri), { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    await uploadThumb(bucket, path, f);
    return path;
  } catch (e) { reportError(e); return null; }
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/** Upload to <bucket>/<folder>/<uuid>.<ext>; returns the storage path. Throws a readable Arabic error. */
export async function uploadFile(bucket: string, folder: string, file: { uri: string; mime: string; duration?: number | null; size?: number | null; width?: number; height?: number }): Promise<string> {
  return (await uploadPicked(bucket, folder, file)).path;
}

/**
 * Uploads a picked photo or video. A trimmed video is cut to the chosen part before it goes up (where the device can),
 * and the returned meta then has no trim, because the file itself starts and ends there.
 */
export async function uploadPicked<M extends { trim?: { start: number; end: number } }>(bucket: string, folder: string,
  file: { uri: string; mime: string; duration?: number | null; size?: number | null; width?: number; height?: number; meta?: M | null }): Promise<{ path: string; meta: M | null }> {
  // photos and videos are made light enough for every phone and connection before they go up
  if (file.mime.startsWith('image/')) file = await lightImage(file);
  const small = file.mime.startsWith('video/') ? await shrinkVideo(file, file.meta?.trim) : null;
  const mime = small?.mime ?? file.mime;
  const ext = mime.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
  const path = `${folder}/${Crypto.randomUUID()}.${ext}`;
  let meta = file.meta ?? null;
  if (small?.trimmed && meta) { const { trim: _t, ...rest } = meta; meta = rest as M; }
  try {
    // phones send videos straight from the file (no copy of a big video in memory, which can close the app)
    if (Platform.OS !== 'web' && mime.startsWith('video/')) {
      await streamUp(bucket, path, (small?.uri ?? file.uri).split('#')[0], mime);
      return { path, meta };
    }
    const buf = small?.blob ?? await readBytes(small?.uri ?? file.uri);
    const size0 = (buf as { size?: number; byteLength?: number }).size ?? (buf as { byteLength?: number }).byteLength ?? 0;
    if (mime.startsWith('video/') && size0 > 50 * 1048576) throw new UserError(t('الفيديو كبير جداً. قصّره أو اختر جزءاً أقصر.'));
    // big files get more time (about 150 KB/s on a slow connection), never less than 90 seconds
    const bytes = (buf as { size?: number; byteLength?: number }).size ?? (buf as { byteLength?: number }).byteLength ?? 0;
    const ms = Math.max(90_000, Math.min(600_000, 30_000 + bytes / 150));
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
    const { error } = await Promise.race([supabase.storage.from(bucket).upload(path, buf, { contentType: mime, upsert: false }), timeout]);
    if (error) throw error;
    // photos also get a small copy made here on the phone: lists show it, and nothing is resized (or billed) on the server
    if (mime.startsWith('image/') && THUMB_BUCKETS.has(bucket)) await uploadThumb(bucket, path, file);
    return { path, meta };
  } catch (e) {
    reportError(e);
    const msg = e instanceof Error && e.message === 'timeout' ? t('الاتصال بالإنترنت بطيء، حاول مرة أخرى.') : t('تعذّر رفع الملف، تأكد من اتصالك بالإنترنت وحاول مرة أخرى.');
    throw new UserError(msg);
  }
}

/** A file straight from disk to storage through a one-time upload address (phones only). */
async function streamUp(bucket: string, path: string, uri: string, mime: string) {
  const size = new File(uri).size ?? 0;
  if (size > 50 * 1048576) throw new UserError(t('الفيديو كبير جداً. قصّره أو اختر جزءاً أقصر.'));
  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error('no upload address');
  const ms = Math.max(90_000, Math.min(600_000, 30_000 + size / 150));
  const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms));
  const res = await Promise.race([LegacyFS.uploadAsync(data.signedUrl, uri, {
    httpMethod: 'PUT', uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'content-type': mime, 'cache-control': 'max-age=3600', 'x-upsert': 'false', apikey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '' },
  }), timeout]);
  if (res.status < 200 || res.status >= 300) throw new Error(`upload ${res.status}: ${res.body.slice(0, 200)}`);
}

export function publicUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
