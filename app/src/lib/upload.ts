import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Alert, Linking, Platform } from 'react-native';

import { reportError } from './errors';
import { supabase } from './supabase';
import { t } from './i18n';

export type Picked = { uri: string; mime: string; kind: 'image' | 'video'; duration?: number | null; size?: number | null; width?: number; height?: number };

/**
 * Pick a photo or short video. `square` opens the system crop (like Instagram's profile photo);
 * photos are resized and saved as JPEG so every phone (including HEIC iPhones) uploads the same way.
 */
export async function pickMedia(opts: { video?: boolean; camera?: boolean; square?: boolean; maxWidth?: number } = {}): Promise<Picked | null> {
  const perm = opts.camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(opts.camera ? t('الكاميرا مسكّرة') : t('الصور مسكّرة'), t('افتح الإعدادات واسمح ليونيميت يوصل للصور والكاميرا.'), [
      { text: t('لاحقاً'), style: 'cancel' }, { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() },
    ]);
    return null;
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: opts.video ? ['images', 'videos'] : ['images'],
    quality: 0.85,
    videoMaxDuration: 15,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.IFrame960x540,
    allowsEditing: !!opts.square,
    aspect: opts.square ? [1, 1] : undefined,
  };
  const res = opts.camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  if (a.type === 'video') {
    if ((a.duration ?? 0) > 15500) { Alert.alert(t('الفيديو طويل'), t('الفيديو لازم يكون 15 ثانية أو أقل.')); return null; }
    if ((a.fileSize ?? 0) > 50 * 1048576) { Alert.alert(t('الفيديو كبير'), t('جرّب فيديو أقصر.')); return null; }
    return { uri: a.uri, mime: a.mimeType ?? 'video/mp4', kind: 'video', duration: a.duration, size: a.fileSize };
  }
  // resize + JPEG: smaller uploads, no HEIC surprises
  try {
    const ctx = ImageManipulator.manipulate(a.uri);
    const maxW = opts.maxWidth ?? (opts.square ? 720 : 1440);
    if ((a.width ?? 0) > maxW) ctx.resize({ width: maxW });
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
  if ((a.size ?? 0) > 10 * 1048576) { Alert.alert(t('الملف كبير'), t('أكبر حجم 10 ميجا.')); return null; }
  return { uri: a.uri, mime: 'application/pdf', name: a.name ?? t('ملف.pdf'), size: a.size ?? null };
}

/** Pick up to `max` photos at once (posts with several photos). Each is resized to JPEG. */
export async function pickPhotos(max = 10): Promise<Picked[]> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(t('الصور مسكّرة'), t('افتح الإعدادات واسمح ليونيميت يوصل للصور والكاميرا.'), [
      { text: t('لاحقاً'), style: 'cancel' }, { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() },
    ]);
    return [];
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: max, orderedSelection: true, quality: 0.85 });
  if (res.canceled) return [];
  const out: Picked[] = [];
  for (const a of res.assets.slice(0, max)) {
    try {
      const ctx = ImageManipulator.manipulate(a.uri);
      if ((a.width ?? 0) > 1440) ctx.resize({ width: 1440 });
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

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/** Upload to <bucket>/<folder>/<uuid>.<ext>; returns the storage path. Throws a readable Arabic error. */
export async function uploadFile(bucket: string, folder: string, file: { uri: string; mime: string }): Promise<string> {
  const ext = file.mime.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
  const path = `${folder}/${Crypto.randomUUID()}.${ext}`;
  try {
    const buf = await readBytes(file.uri);
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 90000));
    const { error } = await Promise.race([supabase.storage.from(bucket).upload(path, buf, { contentType: file.mime, upsert: false }), timeout]);
    if (error) throw error;
    return path;
  } catch (e) {
    reportError(e);
    const msg = e instanceof Error && e.message === 'timeout' ? t('الإنترنت بطيء، جرّب كمان مرة.') : t('ما زبط رفع الملف، تأكد من الإنترنت وجرّب كمان مرة.');
    throw new Error(msg);
  }
}

export function publicUrl(bucket: string, path: string) {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
