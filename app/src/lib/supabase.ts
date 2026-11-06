import 'expo-sqlite/localStorage/install';
import { AppState, PixelRatio } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export const supabase = createClient(url, key, {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    flowType: 'pkce',
  },
});

AppState.addEventListener('change', (state) => {
  if (state === 'active') supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});

/** Public URL for a file in a public bucket, or a short-lived signed URL for a private one. */
const signedCache = new Map<string, { url: string; exp: number }>();
export function clearMediaCache() { signedCache.clear(); }
/** Signs many private files in one request (a page of the feed), so each photo shows without its own round trip. */
export async function primeMedia(bucket: string, paths: string[]) {
  const need = [...new Set(paths)].filter((x) => x && !x.startsWith('http') && !((signedCache.get(bucket + '/' + x)?.exp ?? 0) > Date.now()));
  if (!need.length) return;
  try {
    const { data } = await supabase.storage.from(bucket).createSignedUrls(need, 3600);
    for (const d of data ?? []) if (d.path && d.signedUrl) signedCache.set(bucket + '/' + d.path, { url: d.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  } catch { /* each photo signs itself as before */ }
}

/**
 * `width`: a photo resized on the server for where it's shown (feed, grid, thumbnail) — a fraction of the original's size.
 * Only for photos; videos and files always use the original.
 */
export async function mediaUrl(bucket: string, path?: string | null, width?: number): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (bucket === 'avatars' || bucket === 'ads' || bucket === 'campus') {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  const sized = !!width && /\.(jpe?g|png|webp)$/i.test(path);
  const k = bucket + '/' + path + (sized ? `@${width}` : '');
  const hit = signedCache.get(k);
  if (hit && hit.exp > Date.now()) return hit.url;
  let data: { signedUrl: string } | null = null;
  try {
    ({ data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600, sized ? { transform: { width, quality: 75, resize: 'contain' } } : undefined));
  } catch { return null; }
  if (!data) return null;
  signedCache.set(k, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** The width (in pixels) a photo needs to look sharp at `points` wide on this screen, in a few fixed steps so caches are shared. */
export function photoWidth(points: number) {
  const px = points * Math.min(3, PixelRatio.get());
  return [320, 480, 720, 1080, 1440].find((w) => w >= px) ?? 1440;
}
