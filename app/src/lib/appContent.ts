import { useEffect, useSyncExternalStore } from 'react';

import { readCache, writeCache } from './cache';
import { supabase } from './supabase';

/**
 * What the owner sets from the admin panel ("شكل التطبيق"): texts, the home banner and quick links,
 * a notice for everyone, and which features are on. Anything not set keeps the app's normal look.
 */
export type Tone = 'blue' | 'green' | 'pink' | 'orange' | 'violet' | 'red';
export type FeatureKey = 'rides' | 'honor' | 'frames' | 'market' | 'study' | 'swap' | 'map' | 'attendance' | 'gpa' | 'exams';
export type QuickKey = 'map' | 'swap' | 'summaries' | 'market' | 'study' | 'ranks' | 'events' | 'lost_found' | 'sections';

export type AppContent = {
  notice?: { on?: boolean; text?: string; tone?: Tone };
  home?: {
    /** replaces "صباح الخير، …"; {name} becomes the first name */
    greeting?: string;
    banner?: { on?: boolean; title?: string; body?: string; link?: string; tone?: Tone };
    /** quick links in this order; any left out are hidden */
    quick?: QuickKey[];
  };
  login?: { title?: string; tagline?: string };
  /** false switches a feature off (its buttons disappear) */
  features?: Partial<Record<FeatureKey, boolean>>;
};

const KEY = 'app_content';
let current: AppContent = readCache<AppContent>(KEY) ?? {};
const listeners = new Set<() => void>();
const set = (c: AppContent) => { current = c; writeCache(KEY, c); listeners.forEach((f) => f()); };
let fetched = 0;

/** Ask the server again (at most every 30 s unless forced). */
export async function refreshAppContent(force = false) {
  if (!force && Date.now() - fetched < 30000) return;
  fetched = Date.now();
  const { data, error } = await supabase.rpc('app_content');
  if (!error && data && typeof data === 'object') set(data as AppContent);
}

/** After the owner saves: everyone on this device sees it at once. */
export const applyAppContent = (c: AppContent) => set(c);

export function useAppContent(): AppContent {
  const c = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => current, () => current);
  useEffect(() => { refreshAppContent(); }, []);
  return c;
}

export const featureOn = (c: AppContent, k: FeatureKey) => c.features?.[k] !== false;

export const TONES: Record<Tone, [string, string]> = {
  blue: ['#3D6BFF', '#6C8CFF'], green: ['#10B981', '#34D399'], pink: ['#EC4899', '#F472B6'],
  orange: ['#F97316', '#FB923C'], violet: ['#8B5CF6', '#A78BFA'], red: ['#EF4444', '#F87171'],
};
