import { useEffect, useSyncExternalStore } from 'react';

import { useAuth } from './auth';
import { readCache, writeCache } from './cache';
import { isAR } from './i18n';
import { supabase } from './supabase';

/**
 * What the owner sets from the admin panel ("شكل التطبيق"): a notice for everyone, the home greeting and banner, the
 * quick links, the login page's words, and which features are on. Each text is written in Arabic, with its English
 * next to it (`…_en`, filled by «ترجم» or by hand) for students who use the app in English. Anything can be set
 * again for one university (`unis`): what it sets wins there, what it leaves out comes from the general settings.
 */
export type Palette = 'royal' | 'ocean' | 'forest' | 'sunset' | 'rose' | 'gold' | 'night';
/** the six flat colours of the first version, still read from saved settings */
type OldTone = 'blue' | 'green' | 'pink' | 'orange' | 'violet' | 'red';
export type FeatureKey = 'rides' | 'honor' | 'frames' | 'market' | 'study' | 'swap' | 'map' | 'attendance' | 'gpa' | 'exams';
export type QuickKey = 'map' | 'swap' | 'summaries' | 'market' | 'study' | 'ranks' | 'events' | 'lost_found' | 'sections';

export type Notice = { on?: boolean; text?: string; text_en?: string; tone?: Palette | OldTone };
export type Banner = {
  on?: boolean; title?: string; title_en?: string; body?: string; body_en?: string;
  /** a page inside the app (/rides) or a secure site */
  link?: string; cta?: string; cta_en?: string;
  tone?: Palette | OldTone;
  /** a photo behind the words (public URL); the palette then only tints it */
  image?: string;
};
export type Look = {
  notice?: Notice;
  home?: {
    /** replaces "صباح الخير، …"; {name} becomes the first name */
    greeting?: string; greeting_en?: string;
    banner?: Banner;
    /** quick links in this order; any left out are hidden */
    quick?: QuickKey[];
  };
  login?: { title?: string; title_en?: string; tagline?: string; tagline_en?: string };
  /** false switches a feature off (its buttons disappear) */
  features?: Partial<Record<FeatureKey, boolean>>;
};
export type AppContent = Look & { unis?: Record<string, Look> };

/** Designed gradients, deep at one end and lit at the other, so white writing always reads well. */
export const PALETTES: Record<Palette, [string, string, string]> = {
  royal: ['#1E1B4B', '#4338CA', '#8B5CF6'],
  ocean: ['#082F49', '#0369A1', '#22D3EE'],
  forest: ['#052E16', '#047857', '#34D399'],
  sunset: ['#431407', '#C2410C', '#FBBF24'],
  rose: ['#4C0519', '#BE185D', '#F472B6'],
  gold: ['#1C1204', '#92400E', '#F59E0B'],
  night: ['#020617', '#1E293B', '#64748B'],
};
const OLD: Record<OldTone, Palette> = { blue: 'royal', green: 'forest', pink: 'rose', orange: 'sunset', violet: 'royal', red: 'rose' };
export const paletteOf = (t?: Palette | OldTone, fallback: Palette = 'royal'): [string, string, string] =>
  PALETTES[(t && (t in PALETTES ? t : OLD[t as OldTone])) as Palette] ?? PALETTES[fallback];

/** The owner's text in the app's language: the English one when the app is in English and it was written. */
export const say = (ar?: string, en?: string) => ((!isAR && en?.trim()) ? en.trim() : ar?.trim() ?? '');

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

/** Everything as saved, every university's own settings included (the admin panel). */
export function useAllAppContent(): AppContent {
  const c = useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => current, () => current);
  useEffect(() => { refreshAppContent(); }, []);
  return c;
}

/** The general settings with one university's own on top: a section it sets replaces the general one. */
export function lookFor(c: AppContent, universityId?: string | null): Look {
  const own = universityId ? c.unis?.[universityId] : undefined;
  if (!own) return c;
  return {
    notice: own.notice ?? c.notice,
    home: {
      greeting: own.home?.greeting?.trim() ? own.home.greeting : c.home?.greeting,
      greeting_en: own.home?.greeting?.trim() ? own.home.greeting_en : c.home?.greeting_en,
      banner: own.home?.banner ?? c.home?.banner,
      quick: own.home?.quick?.length ? own.home.quick : c.home?.quick,
    },
    login: c.login,
    features: { ...c.features, ...own.features },
  };
}

/** What this student sees: the general settings with their university's own on top. */
export function useAppContent(): Look {
  const { profile } = useAuth();
  return lookFor(useAllAppContent(), profile?.university_id);
}

export const featureOn = (c: Look, k: FeatureKey) => c.features?.[k] !== false;
