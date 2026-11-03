import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from './supabase';

export type Picked = { uri: string; mime: string; kind: 'image' | 'video'; duration?: number | null; size?: number | null };

export async function pickMedia(opts: { video?: boolean; camera?: boolean } = {}): Promise<Picked | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: opts.video ? ['images', 'videos'] : ['images'],
    quality: 0.7,                  // compress before upload: keeps storage and data costs low
    videoMaxDuration: 15,
    allowsEditing: false,
  };
  const res = opts.camera
    ? (await ImagePicker.requestCameraPermissionsAsync()).granted ? await ImagePicker.launchCameraAsync(options) : null
    : await ImagePicker.launchImageLibraryAsync(options);
  if (!res || res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const kind = a.type === 'video' ? 'video' : 'image';
  if (kind === 'video' && (a.duration ?? 0) > 15500) throw new Error('الفيديو لازم يكون 15 ثانية أو أقل');
  return { uri: a.uri, mime: a.mimeType ?? (kind === 'video' ? 'video/mp4' : 'image/jpeg'), kind, duration: a.duration, size: a.fileSize };
}

/** Upload to <bucket>/<folder>/<uuid>.<ext>; returns the storage path. */
export async function uploadFile(bucket: string, folder: string, file: { uri: string; mime: string }): Promise<string> {
  const ext = file.mime.split('/')[1]?.replace('quicktime', 'mov').replace('jpeg', 'jpg') ?? 'bin';
  const path = `${folder}/${Crypto.randomUUID()}.${ext}`;
  const buf = await (await fetch(file.uri)).arrayBuffer();
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: file.mime, upsert: false });
  if (error) throw error;
  return path;
}
