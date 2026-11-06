import { useSyncExternalStore } from 'react';

import { supabase } from '@/lib/supabase';

/**
 * Honor frames (0109): who in my university wears one this term, from the official grades only. Loaded once on the
 * first avatar that asks, kept for a few hours, dropped on sign-out. The server leaves out anyone who hid the board,
 * uses a nickname there, or is blocked, and returns nothing when the owner switched frames off.
 */
export type FrameLevel = 'gold' | 'silver' | 'bronze' | 'blue';
type Frame = { level: FrameLevel; label: string };

/** The metals (several stops so they look lit), and a small blue frame for 4th–10th. Same on all three themes. */
export const FRAME_COLORS: Record<FrameLevel, [string, string, ...string[]]> = {
  gold: ['#FFF6C9', '#FFD34D', '#F5A900', '#C77D00', '#FFE58A'],
  silver: ['#FFFFFF', '#DCE1EA', '#A9B1C1', '#7D8597', '#E9ECF2'],
  bronze: ['#FFE0C7', '#F0A46B', '#C9773A', '#8E4F22', '#F6C29A'],
  blue: ['#BFDCFF', '#4C8DFF', '#2A5FE0', '#8FBEFF'],
};
export const FRAME_GLOW = 'rgba(255,196,0,0.7)';

const TTL = 3 * 3600000;
let frames = new Map<string, Frame>();
let loadedAt = 0;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function load() {
  if (loading || Date.now() - loadedAt < TTL) return;
  loading = (async () => {
    const { data, error } = await supabase.rpc('honor_frames_visible');
    if (!error) {
      frames = new Map(((data ?? []) as { user_id: string; level: FrameLevel; label: string }[]).map((f) => [f.user_id, { level: f.level, label: f.label }]));
      loadedAt = Date.now();
      emit();
    }
  })().finally(() => { loading = null; });
}

/** Re-read now (after an import, a privacy change, or the owner flipping the switch). */
export function refreshFrames() { loadedAt = 0; load(); }

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') { frames = new Map(); loadedAt = 0; emit(); }
  else if (event === 'SIGNED_IN' && listeners.size) refreshFrames();
});

function subscribe(f: () => void) {
  listeners.add(f);
  load();
  return () => { listeners.delete(f); };
}

/** The frame this person wears, if any. Cheap: one shared store, each avatar reads one key. */
export function useFrame(id?: string | null): Frame | null {
  return useSyncExternalStore(subscribe, () => (id ? frames.get(id) ?? null : null), () => null);
}
