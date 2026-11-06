import { router, type Href } from 'expo-router';

/**
 * One step back, always: the screen under this one, exactly like the phone's back gesture (LIFO, never a jump to
 * the start). Only when there is nothing under it (opened from a link or a notification) it goes to `fallback`.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
