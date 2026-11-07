import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { getPref, setPref } from '@/lib/prefs';
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
  l?: 1;                // on campus and named only here ("مبنى قرب …" or an OSM name): the map labels it from the file
};
export type CampusData = {
  v: number; at: string;
  bbox: [number, number, number, number]; // w, s, e, n
  center: LL;
  campus: LL[] | null;  // the university's main outline, when OSM has it
  campuses?: LL[][];    // every outline (a second campus, a wing); the main one first
  buildings: CampusBuilding[];
  green: { t: 'grass' | 'wood' | 'scrub' | 'pitch' | 'water' | 'plaza' | string; c: LL[] }[];
  parking: LL[][];
  paths: { t: 'foot' | 'road' | 'steps'; c: LL[]; n?: string }[];
  trees: LL[];
  planted?: 1;                         // trees planted evenly in green areas where none were mapped (for the look)
  branches?: { n: string; c: LL }[];   // the university's colleges in other towns, drawn in the same file
};

/** Where each university's 3D file lives (`<id>.json`); public, cached by the browser between visits. */
export const CAMPUS_BASE = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/storage/v1/object/public/campus`;
const mem = new Map<string, Promise<CampusData | null>>();
/** how long to wait for the version check before using the copy on the phone (a weak campus signal) */
const CHECK_MS = 5000;

/**
 * The campus of one university, or null when it has no file yet (the map still works with pins only).
 * Works without internet: phones keep the file in the app's own folder (once opened, anywhere, with internet), a
 * newer version replaces it, and with no connection the kept copy is used. The web does the same in the browser's
 * offline store.
 */
export function loadCampus(universityId: string): Promise<CampusData | null> {
  let p = mem.get(universityId);
  if (!p) {
    p = (async () => {
      const version = await Promise.race([
        supabase.from('campus_maps').select('version').eq('university_id', universityId).maybeSingle()
          .then(({ data, error }) => (error ? undefined : (data?.version as number | undefined) ?? null), () => undefined),
        new Promise<undefined>((r) => setTimeout(() => r(undefined), CHECK_MS)),
      ]);
      if (version === null) return null; // this university has no map
      return Platform.OS === 'web' ? webFile(universityId, version) : phoneFile(universityId, version);
    })().catch(() => null);
    p.then((d) => { if (!d) mem.delete(universityId); });
    mem.set(universityId, p);
  }
  return p;
}

const url = (id: string, v: number) => `${CAMPUS_BASE}/${id}.json?v=${v}`;

/** Phones: `campus/<id>-v<version>.json` in the app's folder; `version` undefined = no connection right now. */
async function phoneFile(id: string, version: number | undefined): Promise<CampusData | null> {
  const dir = new Directory(Paths.document, 'campus');
  if (!dir.exists) dir.create({ intermediates: true });
  const kept = dir.list().filter((f): f is File => f instanceof File && f.name.startsWith(`${id}-v`) && f.name.endsWith('.json'));
  const keptV = (f: File) => Number(f.name.slice(id.length + 2, -5)) || 0;
  const newest = kept.sort((a, b) => keptV(b) - keptV(a))[0];
  const read = async (f: File) => { try { return JSON.parse(await f.text()) as CampusData; } catch { return null; } };
  if (newest && (version === undefined || keptV(newest) >= version)) {
    const d = await read(newest);
    if (d) return d;
  }
  if (version === undefined) return null; // offline and nothing kept yet
  try {
    const r = await fetch(url(id, version));
    if (!r.ok) throw new Error(`campus file ${r.status}`);
    const text = await r.text();
    const d = JSON.parse(text) as CampusData;
    const f = new File(dir, `${id}-v${version}.json`);
    f.write(text);
    kept.filter((x) => x.uri !== f.uri).forEach((x) => { try { x.delete(); } catch { /* in use */ } });
    return d;
  } catch {
    return newest ? read(newest) : null; // a drop halfway: the older copy still beats nothing
  }
}

/** Web: the file is also kept in the browser's offline store (Cache Storage), so the map opens without internet too. */
async function webFile(id: string, version: number | undefined): Promise<CampusData | null> {
  const key = `campus_v:${id}`;
  const v = version ?? Number(getPref(key) ?? 0);
  if (!v) return null;
  const store = typeof caches !== 'undefined' ? await caches.open('campus').catch(() => null) : null;
  try {
    if (version === undefined) {
      const hit = await store?.match(url(id, v));
      if (hit) return (await hit.json()) as CampusData;
    }
    const r = await fetch(url(id, v));
    if (!r.ok) return null;
    if (store) {
      await store.put(url(id, v), r.clone()).catch(() => {});
      // older versions of this campus go
      for (const k of await store.keys()) if (k.url.includes(`/${id}.json`) && !k.url.endsWith(`v=${v}`)) await store.delete(k);
    }
    setPref(key, String(v));
    return (await r.json()) as CampusData;
  } catch {
    const hit = await store?.match(url(id, v)).catch(() => undefined);
    return hit ? ((await hit.json()) as CampusData) : null;
  }
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
