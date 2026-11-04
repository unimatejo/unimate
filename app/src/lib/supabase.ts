import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
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
export async function mediaUrl(bucket: string, path?: string | null): Promise<string | null> {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (bucket === 'avatars' || bucket === 'ads' || bucket === 'campus') {
    return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  }
  const k = bucket + '/' + path;
  const hit = signedCache.get(k);
  if (hit && hit.exp > Date.now()) return hit.url;
  let data: { signedUrl: string } | null = null;
  try { ({ data } = await supabase.storage.from(bucket).createSignedUrl(path, 3600)); } catch { return null; }
  if (!data) return null;
  signedCache.set(k, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
