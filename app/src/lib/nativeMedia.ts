import { requireOptionalNativeModule } from 'expo';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { reportError } from './errors';
import type { Picked } from './upload';

/**
 * The phone's gallery (expo-media-library) and the in-app camera (expo-camera) are native modules that only
 * exist in builds made after they were added. Older installed apps get this JS through an OTA update, so
 * everything here checks first and the screens fall back to the system picker when a module is missing.
 */
type ML = typeof import('expo-media-library/legacy');
type CamMod = typeof import('expo-camera');

let ml: ML | null | undefined;
let cam: CamMod | null | undefined;

export function mediaLibrary(): ML | null {
  if (ml !== undefined) return ml;
  try {
    ml = Platform.OS !== 'web' && requireOptionalNativeModule('ExpoMediaLibrary') ? (require('expo-media-library/legacy') as ML) : null;
  } catch (e) { reportError(e); ml = null; }
  return ml;
}

export function cameraModule(): CamMod | null {
  if (cam !== undefined) return cam;
  try {
    // the web build has its own camera (getUserMedia); phones need the native module
    const ok = Platform.OS === 'web' ? typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia : !!requireOptionalNativeModule('ExpoCamera');
    cam = ok ? (require('expo-camera') as CamMod) : null;
  } catch (e) { reportError(e); cam = null; }
  return cam;
}

export type GalleryAsset = { id: string; uri: string; mediaType: 'photo' | 'video'; duration: number; width: number; height: number };
export type GalleryAlbum = { id: string; title: string; count: number };
export type GalleryKind = 'all' | 'photo' | 'video';

export async function galleryPermission(ask: boolean): Promise<'granted' | 'denied' | 'unavailable'> {
  const m = mediaLibrary();
  if (!m) return 'unavailable';
  try {
    const cur = await m.getPermissionsAsync(false, ['photo', 'video']);
    if (cur.granted) return 'granted';
    if (!ask || !cur.canAskAgain) return 'denied';
    const r = await m.requestPermissionsAsync(false, ['photo', 'video']);
    return r.granted ? 'granted' : 'denied';
  } catch (e) { reportError(e); return 'unavailable'; }
}

export async function galleryAlbums(): Promise<GalleryAlbum[]> {
  const m = mediaLibrary();
  if (!m) return [];
  try {
    const list = await m.getAlbumsAsync({ includeSmartAlbums: true });
    return list.filter((a) => a.assetCount > 0).sort((a, b) => b.assetCount - a.assetCount).map((a) => ({ id: a.id, title: a.title, count: a.assetCount }));
  } catch (e) { reportError(e); return []; }
}

/** One page of the gallery, newest first. */
export async function galleryPage(o: { kind: GalleryKind; album?: string | null; after?: string; first?: number }): Promise<{ assets: GalleryAsset[]; end?: string; hasNext: boolean }> {
  const m = mediaLibrary();
  if (!m) return { assets: [], hasNext: false };
  const r = await m.getAssetsAsync({
    first: o.first ?? 60, after: o.after, album: o.album ?? undefined,
    mediaType: o.kind === 'photo' ? ['photo'] : o.kind === 'video' ? ['video'] : ['photo', 'video'],
    sortBy: [['creationTime', false]],
  });
  return {
    assets: r.assets.map((a) => ({ id: a.id, uri: a.uri, mediaType: a.mediaType === 'video' ? 'video' : 'photo', duration: a.duration ?? 0, width: a.width, height: a.height })),
    end: r.endCursor, hasNext: r.hasNextPage,
  };
}

/** The newest photo, for the little gallery button on the camera. */
export async function latestAsset(): Promise<GalleryAsset | null> {
  if ((await galleryPermission(false)) !== 'granted') return null;
  try { return (await galleryPage({ kind: 'all', first: 1 })).assets[0] ?? null; } catch { return null; }
}

/** Turn a gallery item into an uploadable file: photos become a JPEG (no HEIC), videos keep their file. */
export async function assetToPicked(a: GalleryAsset): Promise<Picked> {
  const m = mediaLibrary();
  let uri = a.uri;
  if (m) {
    try {
      const info = await m.getAssetInfoAsync(a.id, { shouldDownloadFromNetwork: true });
      uri = info.localUri ?? info.uri ?? a.uri;
    } catch (e) { reportError(e); }
  }
  if (a.mediaType === 'video') {
    return { uri, mime: uri.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4', kind: 'video', duration: Math.round(a.duration * 1000), width: a.width || undefined, height: a.height || undefined };
  }
  try {
    const ctx = ImageManipulator.manipulate(uri);
    if (a.width > 2400) ctx.resize({ width: 2400 });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });
    return { uri: out.uri, mime: 'image/jpeg', kind: 'image', width: out.width, height: out.height };
  } catch (e) {
    reportError(e);
    return { uri, mime: 'image/jpeg', kind: 'image', width: a.width, height: a.height };
  }
}

/** A photo or video just taken with the in-app camera, in the same shape as a picked file. */
export async function captureToPicked(c: { uri: string; width?: number; height?: number; kind: 'image' | 'video'; durationMs?: number }): Promise<Picked> {
  if (c.kind === 'video') return { uri: c.uri, mime: Platform.OS === 'web' ? 'video/webm' : 'video/mp4', kind: 'video', duration: c.durationMs ?? null, width: c.width, height: c.height };
  try {
    const ctx = ImageManipulator.manipulate(c.uri);
    if ((c.width ?? 0) > 2160) ctx.resize({ width: 2160 });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ compress: 0.88, format: SaveFormat.JPEG });
    return { uri: out.uri, mime: 'image/jpeg', kind: 'image', width: out.width, height: out.height };
  } catch {
    return { uri: c.uri, mime: 'image/jpeg', kind: 'image', width: c.width, height: c.height };
  }
}

export const fmtDuration = (sec: number) => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
