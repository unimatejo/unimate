import { router } from 'expo-router';

export type Point = { lat: number; lng: number };

let waiting: ((p: Point | null) => void) | null = null;

/**
 * Point at a spot on a university's campus map, without typing coordinates: the map opens with a pin in its middle,
 * you move the map under it and press «هنا تمامًا». Resolves with the spot, or null if it was closed.
 */
export function pickOnMap(universityId: string): Promise<Point | null> {
  waiting?.(null);
  return new Promise((resolve) => {
    waiting = resolve;
    router.push({ pathname: '/map', params: { uni: universityId, pick: '1' } });
  });
}

/** The map is asked for a spot right now. */
export const pickWaiting = () => !!waiting;

/** The map's answer (null: closed without choosing). */
export function finishMapPick(p: Point | null) {
  const f = waiting;
  waiting = null;
  f?.(p);
}
