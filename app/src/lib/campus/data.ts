import { supabase } from '@/lib/supabase';

/**
 * The campus file the campus-osm function builds from OpenStreetMap (0111): building outlines with heights (linked to
 * our `buildings` for official names and floors), green areas, water, parking, every path and road, and trees.
 * One file per university, versioned in `campus_maps`; the browser / phone HTTP cache keeps it between visits and only
 * the current university is ever loaded.
 */
export type LL = [number, number]; // [lng, lat]
export type CampusBuilding = {
  o: number;            // OSM id (0 = an approximate box for a building OSM doesn't have)
  c: LL[];              // closed outline
  h: number; mh: number; // height and base height, metres
  n: string | null;     // name (the official Arabic one when linked)
  b: string | null;     // our buildings.id when linked
  f: number | null;     // floors (ours)
  k: string;            // OSM building type
  ap?: 1;
};
export type CampusData = {
  v: number; at: string;
  bbox: [number, number, number, number]; // w, s, e, n
  center: LL;
  campus: LL[] | null;  // the university's outline, when OSM has it
  buildings: CampusBuilding[];
  green: { t: 'grass' | 'wood' | 'scrub' | 'pitch' | 'water' | 'plaza' | string; c: LL[] }[];
  parking: LL[][];
  paths: { t: 'foot' | 'road' | 'steps'; c: LL[]; n?: string }[];
  trees: LL[];
};

const BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/campus`;
const mem = new Map<string, Promise<CampusData | null>>();

/** The campus of one university, or null when it has no file yet (the map still works with pins only). */
export function loadCampus(universityId: string): Promise<CampusData | null> {
  let p = mem.get(universityId);
  if (!p) {
    p = (async () => {
      const { data: row } = await supabase.from('campus_maps').select('version').eq('university_id', universityId).maybeSingle();
      if (!row?.version) return null;
      const r = await fetch(`${BASE}/${universityId}.json?v=${row.version}`);
      return r.ok ? ((await r.json()) as CampusData) : null;
    })().catch(() => null);
    p.then((d) => { if (!d) mem.delete(universityId); });
    mem.set(universityId, p);
  }
  return p;
}

// ---------- small geometry helpers (metres on a local flat projection: fine at campus size) ----------
export const M_LAT = 111320;
export const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);
export const distM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
  Math.hypot((a.lng - b.lng) * mLng(a.lat), (a.lat - b.lat) * M_LAT);

export function inside(p: LL, ring: LL[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export function centroid(ring: LL[]): LL {
  let x = 0, y = 0;
  const n = ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) { x += ring[i][0]; y += ring[i][1]; }
  return [x / n, y / n];
}

/** The building a place belongs to: ours by id, else the outline it stands in. */
export function findBuilding(d: CampusData, id?: string | null, at?: { lat: number; lng: number } | null) {
  if (id) { const b = d.buildings.find((x) => x.b === id); if (b) return b; }
  if (at) return d.buildings.find((x) => inside([at.lng, at.lat], x.c)) ?? null;
  return null;
}
