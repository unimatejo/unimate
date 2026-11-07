import type { Pin } from '@/components/map/kinds';
import { readCache, writeCache } from '@/lib/cache';
import { nm } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { normalize } from '@/lib/util';

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

/** words that say what a place is, not which one (dropped when matching a room's text to a building) */
const GENERIC = new Set(['مبني', 'كليه', 'مجمع', 'قاعه', 'قاعات', 'عماده', 'قسم', 'ملك', 'امير', 'جامعه', 'و'].map(normalize));
/** a text's distinctive words: normalised, «ال» and «و» dropped from the front, digits split off, generic words out */
function keyWords(s: string): string[] {
  return normalize(s).replace(/(\d+)/g, ' $1 ').split(/[\s,،·.\-/()]+/)
    .map((w) => w.replace(/^و(?=ال)/, '').replace(/^ال(?=..)/, ''))
    .filter((w) => w.length >= 2 && !/^\d+$/.test(w) && !GENERIC.has(w));
}

/**
 * The building a room written as text is in («مبنى الحسين الباني ح.ب 303», «الهندسه 2017», «IT 305»), from the campus
 * buildings kept on the phone: every distinctive word of a building's name (or of one of its nicknames) appears in the
 * text, or the text starts with its code. The name with the most words wins; null when nothing fits or two buildings
 * fit equally (then the reminder opens the timetable instead of guessing).
 */
export function buildingFor(roomText: string | null | undefined, universityId: string | null | undefined): Pin | null {
  if (!roomText || !universityId) return null;
  const words = new Set(keyWords(roomText));
  const raw = normalize(roomText).split(/[\s,،·\-/]+/).filter(Boolean);
  const all = new Set(raw);
  let best: Pin | null = null, bestScore = 0, tie = false;
  for (const p of keptPins(universityId) ?? []) {
    if (p.kind !== 'building') continue;
    let score = 0;
    for (const name of [p.name, ...(p.alt ?? [])]) {
      const k = keyWords(name);
      // every distinctive word must be there; the name's other words (مبنى / مجمع…) only break a tie
      if (k.length && k.every((w) => words.has(w))) score = Math.max(score, k.length + normalize(name).split(' ').filter((w) => all.has(w)).length / 10);
    }
    const code = p.sub ? normalize(p.sub) : '';
    if (code && raw.some((w, i) => (w === code && /^\d/.test(raw[i + 1] ?? '')) || (w.startsWith(code) && /^\d+$/.test(w.slice(code.length))))) score = Math.max(score, 1);
    if (score > bestScore) { best = p; bestScore = score; tie = false; } else if (score && score === bestScore) tie = true;
  }
  return tie ? null : best;
}
