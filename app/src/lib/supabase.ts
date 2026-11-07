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

/**
 * Addresses for files. Public buckets get their public URL. Private ones get a short-lived signed URL, and every
 * request made in the same moment (a page of the feed, a chat's photos) is signed together in ONE call. Nothing is
 * resized on the server (Supabase bills that per photo): a photo shown small (lists, grids, thumbnails) uses the small
 * copy made on the phone at upload (`<name>.t.jpg`, lib/upload), or the photo itself for older ones without it.
 */
const signedCache = new Map<string, { url: string; exp: number }>();
export function clearMediaCache() { signedCache.clear(); }
const TTL = 3600, KEEP_MS = 50 * 60 * 1000;
/** the small copy's name: `a/b.jpg` → `a/b.t.jpg` */
export const thumbPath = (path: string) => path.replace(/\.[a-z0-9]+$/i, '.t.jpg');
const SMALL = 480;

type Want = { path: string; resolve: (u: string | null) => void };
const queue = new Map<string, Want[]>(); // bucket → waiting
let flushing: ReturnType<typeof setTimeout> | null = null;

function flush() {
  flushing = null;
  for (const [bucket, wants] of queue) {
    queue.delete(bucket);
    const paths = [...new Set(wants.map((w) => w.path))];
    (async () => {
      for (let i = 0; i < paths.length; i += 100) {
        const part = paths.slice(i, i + 100);
        try {
          const { data } = await supabase.storage.from(bucket).createSignedUrls(part, TTL);
          for (const d of data ?? []) if (d.path && d.signedUrl) signedCache.set(bucket + '/' + d.path, { url: d.signedUrl, exp: Date.now() + KEEP_MS });
        } catch { /* left unsigned: each caller gets null */ }
      }
      for (const w of wants) w.resolve(signedCache.get(bucket + '/' + w.path)?.url ?? null);
    })();
  }
}

/** Signed URL for one private file, batched with every other one asked for in the same moment. */
function signed(bucket: string, path: string): Promise<string | null> {
  const hit = signedCache.get(bucket + '/' + path);
  if (hit && hit.exp > Date.now()) return Promise.resolve(hit.url);
  return new Promise((resolve) => {
    queue.set(bucket, [...(queue.get(bucket) ?? []), { path, resolve }]);
    if (!flushing) flushing = setTimeout(flush, 16);
  });
}

/** Signs many private files ahead (a page of the feed), so each one shows without waiting. */
export async function primeMedia(bucket: string, paths: string[]) {
  await Promise.all([...new Set(paths)].filter((x) => x && !x.startsWith('http')).map((x) => signed(bucket, x)));
}

/**
 * `width`: how wide (pixels) the photo is shown. At 480 or less the small copy is used when there is one.
 * Videos and files always use the original.
 */
export async function mediaUrl(bucket: string, path?: string | null, width?: number): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (bucket === 'avatars' || bucket === 'ads' || bucket === 'campus' || bucket === 'stickers') {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  if (width && width <= SMALL && /\.(jpe?g|png|webp)$/i.test(path) && !/\.t\.jpg$/i.test(path)) {
    // asked together with the original, so a photo without a small copy costs no second round trip
    const [small, full] = await Promise.all([signed(bucket, thumbPath(path)), signed(bucket, path)]);
    return small ?? full;
  }
  return signed(bucket, path);
}

/** The width (in pixels) a photo needs to look sharp at `points` wide on this screen, in a few fixed steps so caches are shared. */
export function photoWidth(points: number) {
  const px = points * Math.min(3, PixelRatio.get());
  return [320, 480, 720, 1080, 1440].find((w) => w >= px) ?? 1440;
}
