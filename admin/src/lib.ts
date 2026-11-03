import { createClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useState } from 'react';

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type Uni = { id: string; slug: string; name_ar: string; name_en: string; city: string | null; email_domains: string[]; brand_color: string; center_lat: number | null; center_lng: number | null; is_active: boolean; data_status: string; data_notes: string | null };

/** Small data hook: runs `fn`, exposes data + reload, and surfaces errors. */
export function useLoad<T>(fn: () => PromiseLike<{ data: T | null; error: { message: string } | null }>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(async () => {
    setLoading(true);
    const r = await fn();
    setData(r.data); setError(r.error?.message ?? null); setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { data, error, loading, reload: run, setData };
}

let uniCache: Uni[] | null = null;
export function useUnis() {
  const [unis, setUnis] = useState<Uni[]>(uniCache ?? []);
  useEffect(() => {
    if (uniCache) return;
    supabase.from('universities').select('*').order('name_ar').then(({ data }) => { uniCache = (data ?? []) as Uni[]; setUnis(uniCache); });
  }, []);
  return unis;
}
export function clearUniCache() { uniCache = null; }

export const fmtDate = (s?: string | null) => s ? new Date(s).toLocaleString('ar-JO', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
export const fmtNum = (n?: number | null) => (n ?? 0).toLocaleString('ar-JO');

export async function audit(action: string, target_type: string, target_id: string, meta: Record<string, unknown> = {}) {
  await supabase.rpc('admin_log', { action, target_type, target_id, meta });
}
