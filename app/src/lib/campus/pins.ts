import type { Pin } from '@/components/map/kinds';
import { readCache, writeCache } from '@/lib/cache';
import { nm } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

import { loadCampus } from './data';

/**
 * Every building and place of a university on the map, with their nicknames («المجمع»، «C11») so search finds them,
 * kept on the phone: what the map showed last time comes up at once, and it is all there is without internet.
 */
const key = (universityId: string) => `campus_pins:${universityId}`;

export const keptPins = (universityId: string) => readCache<Pin[]>(key(universityId)) ?? null;

/** Fresh from the server (and kept); null when that didn't work (no connection): use `keptPins`. */
export async function fetchPins(universityId: string): Promise<Pin[] | null> {
  try {
    const [{ data: b, error: be }, { data: p, error: pe }, { data: al }] = await Promise.all([
      supabase.from('buildings').select('id, name_ar, name_en, code, lat, lng').eq('university_id', universityId).eq('state', 'approved').not('lat', 'is', null),
      supabase.from('places').select('id, kind, name_ar, name_en, description, lat, lng, advertiser_id').eq('university_id', universityId).eq('state', 'approved'),
      supabase.from('place_aliases').select('alias, building_id, place_id').eq('university_id', universityId).eq('state', 'approved'),
    ]);
    if (be || pe) return null;
    const alt = new Map<string, string[]>();
    for (const a of al ?? []) { const id = a.building_id ?? a.place_id; if (id) alt.set(id, [...(alt.get(id) ?? []), a.alias]); }
    const pins: Pin[] = [
      ...(b ?? []).map((x) => ({ id: x.id, kind: 'building', name: nm(x), sub: x.code, lat: x.lat!, lng: x.lng!, alt: alt.get(x.id) })),
      ...(p ?? []).map((x) => ({ id: x.id, kind: x.kind, name: nm(x), sub: x.description, lat: x.lat, lng: x.lng, advertiser_id: x.advertiser_id, alt: alt.get(x.id) })),
    ];
    writeCache(key(universityId), pins);
    return pins;
  } catch { return null; }
}

let prepared: string | null = null;
/**
 * Once per app start, a little after it opens: the student's own campus (map file and places) is made ready on the
 * phone, so the map works at the university without internet even if it was never opened before. The file only
 * downloads when there's a new version; the places are a small list.
 */
export function prepareOfflineCampus(universityId: string | null | undefined) {
  if (!universityId || prepared === universityId) return;
  prepared = universityId;
  setTimeout(() => { void loadCampus(universityId); void fetchPins(universityId); }, 8000);
}
