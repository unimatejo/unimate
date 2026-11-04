import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

/**
 * Light performance reports: how long key screens take to show their data, and any request slower
 * than 2 seconds. Samples are batched and sent every 20 seconds; the admin panel shows p50 / p90.
 */
type Sample = { kind: 'screen' | 'query'; name: string; ms: number; platform: string; app_version: string | null };
const queue: Sample[] = [];
const version = Constants.expoConfig?.version ?? null;
let timer: ReturnType<typeof setTimeout> | null = null;

function flush() {
  timer = null;
  if (!queue.length) return;
  const batch = queue.splice(0, 50);
  supabase.auth.getSession().then(({ data }) => {
    if (!data.session) return; // signed out: drop them
    supabase.from('perf_samples').insert(batch).then(() => {}, () => {});
  }, () => {});
}

export function recordPerf(kind: Sample['kind'], name: string, ms: number) {
  if (!Number.isFinite(ms) || ms < 0 || ms > 600000) return;
  queue.push({ kind, name: name.slice(0, 80), ms: Math.round(ms), platform: Platform.OS, app_version: version });
  if (queue.length >= 10) flush();
  else if (!timer) timer = setTimeout(flush, 20000);
}

/** Time from opening a screen until `ready` first becomes true (its data is on screen). */
export function useScreenTimer(name: string, ready: boolean) {
  const start = useRef(Date.now());
  const done = useRef(false);
  useEffect(() => {
    if (ready && !done.current) { done.current = true; recordPerf('screen', name, Date.now() - start.current); }
  }, [ready, name]);
}

/** Wrap a request; reports it only when it took more than 2 seconds. */
export async function timed<T>(name: string, p: PromiseLike<T>): Promise<T> {
  const t0 = Date.now();
  try { return await p; } finally { const ms = Date.now() - t0; if (ms > 2000) recordPerf('query', name, ms); }
}
