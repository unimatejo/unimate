import { createContext, useContext, useRef, useState, useSyncExternalStore } from 'react';

/**
 * Reels in the feed, like Instagram: one sound setting for all of them (turn sound on once and it stays on,
 * even after the list reloads), and only the post that's on screen plays.
 */
let muted = true;
const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function useReelSound(): [muted: boolean, setMuted: (m: boolean) => void] {
  const m = useSyncExternalStore(subscribe, () => muted, () => true);
  return [m, (v) => { muted = v; listeners.forEach((fn) => fn()); }];
}

/** Ids of the posts a list is showing right now; outside a list (post page) everything counts as on screen. */
const OnScreen = createContext<ReadonlySet<string> | null>(null);
export const OnScreenProvider = OnScreen.Provider;
export const useOnScreen = (id?: string) => { const s = useContext(OnScreen); return !s || !id || s.has(id); };

const VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 120 };

/** Hook for a FlatList of posts: pass `onViewableItemsChanged` and `viewabilityConfig` to it, and `visible` to OnScreenProvider. */
export function useVisiblePosts() {
  const [visible, setVisible] = useState<ReadonlySet<string>>(new Set());
  // FlatList doesn't allow these to change after the first render
  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { key: string; item: unknown }[] }) => {
    setVisible(new Set(viewableItems.map((v) => String((v.item as { id?: string })?.id ?? v.key))));
  }).current;
  return { visible, onViewableItemsChanged, viewabilityConfig: VIEWABILITY };
}
