// Campus map data, from OpenStreetMap, one file per university (Storage: campus/<university>.json).
// Fired by pg_cron once a week (private.campus_osm_fire) or by hand for one university: { university_id }.
// For each campus it reads buildings (with heights), green areas, water, parking, every path and road, trees, and
// points of interest (kiosks, bus stops, cafés, ATMs, gates…) from the OSM map API, links buildings to our `buildings`
// table (official Arabic names, floors) and gives the ones OSM doesn't have an approximate box. New named points of
// interest are added to `places` (source OSM) without touching anything already there. The campus outline is found by
// the university's name (Photon, then the OSM API), so a rough saved centre still lands the map on the real campus.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

type LL = [number, number]; // [lng, lat]
type El = { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags?: Record<string, string>;
  geometry?: { lat: number; lon: number }[]; members?: { type: string; role: string; geometry?: { lat: number; lon: number }[] }[] };

const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
const M_LAT = 111320;
const mLng = (lat: number) => 111320 * Math.cos((lat * Math.PI) / 180);

function dist(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const dx = (a.lng - b.lng) * mLng(a.lat), dy = (a.lat - b.lat) * M_LAT;
  return Math.hypot(dx, dy);
}
function inside(p: LL, ring: LL[]) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function centroid(ring: LL[]): LL {
  let x = 0, y = 0;
  for (const [a, b] of ring) { x += a; y += b; }
  return [x / ring.length, y / ring.length];
}
function area(ring: LL[]) { // m², for sorting and filtering out slivers
  const lat = ring[0][1]; let s = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += (ring[j][0] * mLng(lat)) * (ring[i][1] * M_LAT) - (ring[i][0] * mLng(lat)) * (ring[j][1] * M_LAT);
  return Math.abs(s / 2);
}
const ringOf = (g?: { lat: number; lon: number }[]): LL[] | null => (g && g.length >= 4 ? g.map((p) => [r6(p.lon), r6(p.lat)] as LL) : null);
const lineOf = (g?: { lat: number; lon: number }[]): LL[] | null => (g && g.length >= 2 ? g.map((p) => [r6(p.lon), r6(p.lat)] as LL) : null);
function rings(e: El): LL[][] {
  if (e.type === 'way') { const r = ringOf(e.geometry); return r ? [r] : []; }
  if (e.type === 'relation') {
    // a multipolygon's outer edge can be several ways end to end: join them into closed rings
    const parts = (e.members ?? []).filter((m) => m.role === 'outer' && (m.geometry?.length ?? 0) >= 2).map((m) => m.geometry!.map((p) => [r6(p.lon), r6(p.lat)] as LL));
    const same = (a: LL, b: LL) => a[0] === b[0] && a[1] === b[1];
    const out: LL[][] = [];
    while (parts.length) {
      let ring = parts.shift()!;
      for (let guard = 0; !same(ring[0], ring[ring.length - 1]) && guard < 500; guard++) {
        const end = ring[ring.length - 1];
        const i = parts.findIndex((p) => same(p[0], end) || same(p[p.length - 1], end));
        if (i < 0) break;
        const p = parts.splice(i, 1)[0];
        ring = ring.concat((same(p[0], end) ? p : [...p].reverse()).slice(1));
      }
      if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) out.push(ring);
    }
    return out;
  }
  return [];
}
const nameOf = (t: Record<string, string> = {}) => t['name:ar'] || t.name || t['name:en'] || null;

// OSM tags → the kinds the app already uses for places
function poiKind(t: Record<string, string>): string | null {
  const a = t.amenity, s = t.shop;
  if (t.highway === 'bus_stop' || t.amenity === 'bus_station' || t.public_transport === 'platform') return 'bus';
  if (a === 'cafe' || a === 'food_court') return 'cafeteria';
  if (a === 'restaurant' || a === 'fast_food') return 'restaurant';
  if (s === 'kiosk' || a === 'vending_machine' && t.vending === 'drinks') return 'kiosk';
  if (s === 'copyshop' || s === 'stationery' || a === 'printer') return 'print';
  if (s) return 'shop';
  if (a === 'atm') return 'atm';
  if (a === 'bank') return 'bank';
  if (a === 'pharmacy') return 'pharmacy';
  if (a === 'clinic' || a === 'doctors' || a === 'hospital' || a === 'first_aid') return 'clinic';
  if (a === 'place_of_worship' || a === 'mosque') return 'mosque';
  if (a === 'library') return 'library';
  if (a === 'parking' || a === 'parking_entrance') return 'parking';
  if (t.barrier === 'gate' || t.entrance === 'main' || a === 'gate') return 'gate';
  if (t.leisure === 'sports_centre' || t.leisure === 'stadium' || t.leisure === 'pitch' || t.leisure === 'fitness_centre') return 'sports';
  if (a === 'drinking_water' || a === 'toilets' || a === 'post_office' || a === 'police' || a === 'theatre' || a === 'arts_centre' || a === 'community_centre') return 'service';
  return null;
}
const KIND_AR: Record<string, string> = { bus: 'موقف باص', cafeteria: 'كافتيريا', restaurant: 'مطعم', kiosk: 'كشك', print: 'طباعة وقرطاسية', shop: 'محل', atm: 'صراف آلي',
  bank: 'بنك', pharmacy: 'صيدلية', clinic: 'عيادة', mosque: 'مسجد', library: 'مكتبة', parking: 'موقف سيارات', gate: 'بوابة', sports: 'ملعب', service: 'خدمة' };

// places whose own name can tell a building next to them apart
const LANDMARKS = new Set(['library', 'mosque', 'gate', 'sports', 'clinic', 'building']);

function greenType(t: Record<string, string>): string | null {
  if (t.natural === 'water' || t.water || t.leisure === 'swimming_pool') return 'water';
  if (t.leisure === 'pitch' || t.leisure === 'track' || t.leisure === 'stadium') return 'pitch';
  if (t.natural === 'wood' || t.landuse === 'forest' || t.landuse === 'orchard') return 'wood';
  if (t.natural === 'scrub' || t.landuse === 'meadow' || t.natural === 'grassland') return 'scrub';
  if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'recreation_ground' || t.landuse === 'village_green' || t.leisure === 'playground') return 'grass';
  return null;
}
const WALK = new Set(['footway', 'path', 'pedestrian', 'steps', 'living_street', 'service', 'residential', 'unclassified', 'track', 'tertiary', 'secondary', 'primary', 'corridor', 'cycleway', 'road']);

function heightOf(t: Record<string, string>, floors?: number | null) {
  const h = parseFloat(t.height ?? ''), lv = parseFloat(t['building:levels'] ?? '');
  if (h > 0) return Math.min(120, h);
  if (lv > 0) return Math.min(120, lv * 3.4 + 1);
  if (floors && floors > 0) return floors * 3.4 + 1;
  const b = t.building;
  if (b === 'mosque') return 9;
  if (b === 'roof' || b === 'carport' || b === 'kiosk' || b === 'shed' || t['building'] === 'guardhouse') return 3.5;
  if (b === 'university' || b === 'college' || b === 'school' || b === 'dormitory' || b === 'hospital') return 13;
  return 8;
}

// The OSM map API answers a campus-sized box in about a second (Overpass mirrors time out from cloud servers). It
// returns every node in the box, every way touching them (with all their nodes) and the relations around them.
type Raw = { type: 'node' | 'way' | 'relation'; id: number; lat?: number; lon?: number; tags?: Record<string, string>; nodes?: number[];
  members?: { type: string; ref: number; role: string }[] };
async function osmBox(w: number, s: number, e: number, n: number, depth = 0): Promise<Raw[]> {
  const r = await fetch(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${w},${s},${e},${n}`,
    { headers: { 'User-Agent': 'UniMate-CampusMap/1.0 (+https://unimate.my)', Accept: 'application/json' }, signal: AbortSignal.timeout(60000) });
  if (r.status === 400 && depth < 2) { // too many nodes for one call: four quarters
    const mx = (w + e) / 2, my = (s + n) / 2;
    const q = await Promise.all([[w, s, mx, my], [mx, s, e, my], [w, my, mx, n], [mx, my, e, n]].map(([a, b, c, d]) => osmBox(a, b, c, d, depth + 1)));
    return q.flat();
  }
  if (!r.ok) throw new Error(`osm ${r.status} ${(await r.text()).slice(0, 120)}`);
  return ((await r.json()) as { elements: Raw[] }).elements;
}
async function osm(w: number, s: number, e: number, n: number): Promise<El[]> {
  const raw = await osmBox(w, s, e, n);
  const nodes = new Map<number, { lat: number; lon: number }>(), ways = new Map<number, Raw>(), seen = new Set<string>();
  for (const x of raw) { if (x.type === 'node') nodes.set(x.id, { lat: x.lat!, lon: x.lon! }); else if (x.type === 'way') ways.set(x.id, x); }
  const geom = (ids?: number[]) => (ids ?? []).map((id) => nodes.get(id)).filter(Boolean) as { lat: number; lon: number }[];
  const out: El[] = [];
  for (const x of raw) {
    const k = x.type + x.id;
    if (seen.has(k)) continue; // the quarters overlap at their edges
    seen.add(k);
    if (x.type === 'node') { if (x.tags) out.push({ type: 'node', id: x.id, lat: x.lat, lon: x.lon, tags: x.tags }); }
    else if (x.type === 'way') out.push({ type: 'way', id: x.id, tags: x.tags, geometry: geom(x.nodes) });
    else out.push({ type: 'relation', id: x.id, tags: x.tags, members: (x.members ?? []).filter((m) => m.type === 'way').map((m) => ({ type: 'way', role: m.role, geometry: geom(ways.get(m.ref)?.nodes) })) });
  }
  return out;
}


// The campus outline by the university's name (OSM Nominatim). Small colleges' saved centre is often a rough
// point from Wikipedia, a few hundred metres off: the outline puts the map on the real campus.
// the words that tell one university from another (not "university", "college", "of"…), in a plain spelling
const GENERIC = new Set(['university', 'college', 'univ', 'of', 'the', 'for', 'and', 'in', 'jordan', 'jordanian', 'amman', 'campus', 'branch', 'جامعة', 'جامعه', 'الجامعة', 'الجامعه', 'كلية', 'كليه', 'الكلية', 'الكليه', 'في', 'فرع', 'الأردن', 'الاردن', 'الأردنية', 'الاردنيه', 'الأردنيه', 'و', 'لل', 'للعلوم']);
const plain = (x: string) => x.toLowerCase().replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const words = (x: string) => plain(x).split(' ').filter((w) => w.length > 1 && !GENERIC.has(w));
// a name made only of common words («الجامعة الأردنية», "The University of Jordan") must match whole
const sameName = (q: string, name: string) => { const a = words(q), b = new Set(words(name)); return a.length ? a.every((w) => b.has(w)) : plain(q) === plain(name); };
type Uni = { id: string; center_lat: number; center_lng: number; name_ar: string | null; name_en: string | null };
// someone's home, a private flat or housing (as a word of its own: «كلية العمارة» is architecture), a family diwan, a phone number: never a campus place or a name on the map.
// Student housing run by the university stays (سكن الطلاب / الطالبات / الجامعة / الداخلي).
const PRIVATE = /\d{5,}|\d{3}[\s-]\d{3,}|07[789]\d{7}|منزل|مسكن|(^|\s)(شق[ةه]|فيلا|عمار[ةه]|بناي[ةه])\s|المرحوم|مكان عمل|ديوان|(بيت|سكن)\s+(رئيس|عميد|نائب|مدير|السيد|الدكتور|الحاج|المهندس|المحامي|أبو|ابو|أم|ام)\s/;
const UNI_HOUSING = /سكن\s*(ال)?(طلاب|طالبات|طلبة|الطلبة|جامع|داخلي)/;
// no current officials' names on buildings: «رئاسة الجامعة الرئيس الحالي فلان» → «رئاسة الجامعة»
const OFFICIAL = /\s*[-–,،(]?\s*(ال)?(رئيس|عميد|مدير|نائب)\S*\s+(ال)?(جامع[ةه]\s+)?(ال)?حال[يى](\s.*)?$/u;
const noOfficial = (n: string) => n.replace(OFFICIAL, '').trim();
const isPrivate = (name: string) => PRIVATE.test(name) || (/(^|\s)سكن\s/.test(name) && !UNI_HOUSING.test(name));

// an OSM name that is someone's home stays off the map (the outline is still drawn)
const publicName = (t: Record<string, string>) => { const n = nameOf(t); return n && !isPrivate(n) ? noOfficial(n) || null : null; };

async function outline(uni: Uni): Promise<{ ring: LL[]; center: { lat: number; lng: number }; extra: LL[][] } | null> {
  // Photon finds the campus by name (Nominatim refuses cloud servers); the OSM API then gives its full outline
  const c = { lat: uni.center_lat, lng: uni.center_lng };
  let best: { ring: LL[]; center: { lat: number; lng: number }; d: number } | null = null;
  // a university can have more than one campus (Yarmouk's south campus, Mutah's military wing): same name, or a "campus"
  const more: { ring: LL[]; d: number }[] = [];
  const seen = new Set<string>();
  for (const q of [uni.name_en, uni.name_ar].filter(Boolean) as string[]) {
    const u = `https://photon.komoot.io/api/?limit=10&bbox=${c.lng - 0.06},${c.lat - 0.06},${c.lng + 0.06},${c.lat + 0.06}&q=${encodeURIComponent(q.replace(/\(.*?\)/g, ' ').trim())}`;
    const r = await fetch(u, { headers: { 'User-Agent': 'UniMate campus maps (https://app.unimate.my)' } }).catch(() => null);
    if (!r?.ok) continue;
    const j = await r.json().catch(() => ({ features: [] })) as { features: { properties: { osm_type: string; osm_id: number; osm_key: string; osm_value: string; name?: string } }[] };
    for (const f of j.features ?? []) {
      const p = f.properties;
      if (!(p.osm_value === 'university' || p.osm_value === 'college') || p.osm_type === 'N' || !p.name || !sameName(q, p.name)) continue;
      const key = p.osm_type + p.osm_id;
      if (seen.has(key)) continue; seen.add(key);
      const kind = p.osm_type === 'W' ? 'way' : 'relation';
      const g = await fetch(`https://api.openstreetmap.org/api/0.6/${kind}/${p.osm_id}/full.json`, { headers: { 'User-Agent': 'UniMate campus maps (https://app.unimate.my)' } }).catch(() => null);
      if (!g?.ok) continue;
      const els = ((await g.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; members?: { type: string; ref: number; role: string }[] }[] }).elements;
      const nodes = new Map<number, LL>(), ways = new Map<number, number[]>();
      for (const e of els) { if (e.type === 'node') nodes.set(e.id, [r6(e.lon!), r6(e.lat!)]); else if (e.type === 'way') ways.set(e.id, e.nodes ?? []); }
      const geo = (id: number) => (ways.get(id) ?? []).map((n) => nodes.get(n)).filter(Boolean).map((x) => ({ lon: x![0], lat: x![1] }));
      const top = els.find((e) => e.type === kind && e.id === p.osm_id);
      if (!top) continue;
      const el = (kind === 'way' ? { type: 'way', id: top.id, geometry: geo(top.id) } : { type: 'relation', id: top.id, members: (top.members ?? []).filter((m) => m.type === 'way').map((m) => ({ type: 'way', role: m.role || 'outer', geometry: geo(m.ref) })) }) as El;
      for (const ring of rings(el)) {
        if (area(ring) < 3000) continue;
        const [lng, lat] = centroid(ring);
        const d = inside([c.lng, c.lat], ring) ? 0 : dist(c, { lat, lng });
        if (d < 6000 && (!best || d < best.d || (d === best.d && area(ring) > area(best.ring)))) best = { ring, center: { lat, lng }, d };
        if (d < 6000 && (plain(p.name) === plain(q) || /حرم|جناح|campus/i.test(p.name))) more.push({ ring, d });
      }
    }
    if (best) break;
  }
  if (!best) return null;
  const b = best;
  return { ring: b.ring, center: b.center, extra: more.filter((x) => x.ring !== b.ring && dist(b.center, { lat: centroid(x.ring)[1], lng: centroid(x.ring)[0] }) < 6000).map((x) => x.ring) };
}

async function build(db: ReturnType<typeof createClient>, uni: Uni) {
  const [{ data: bs }, { data: ps }, { data: hidden }] = await Promise.all([
    db.from('buildings').select('id, name_ar, name_en, code, lat, lng, floors, osm_id').eq('university_id', uni.id).eq('state', 'approved'),
    db.from('places').select('id, kind, name_ar, lat, lng, osm_id, state').eq('university_id', uni.id),
    db.from('buildings').select('name_ar, name_en, osm_id').eq('university_id', uni.id).neq('state', 'approved'),
  ]);
  let c = { lat: uni.center_lat, lng: uni.center_lng };
  const named = await outline(uni);
  let moved = 0;
  if (named && !inside([c.lng, c.lat], named.ring)) {
    // the saved centre isn't on the campus: move it there (the app opens the map on it)
    moved = Math.round(dist(c, named.center));
    c = named.center;
    await db.from('universities').update({ center_lat: r6(c.lat), center_lng: r6(c.lng) }).eq('id', uni.id);
  }
  // the campus box: everything we know of within 2.5 km of the centre, plus a margin; at least 1 km across
  const near = [...(bs ?? []), ...(ps ?? [])].filter((x) => x.lat != null && dist(c, x as { lat: number; lng: number }) < 1800) as { lat: number; lng: number }[];
  let s = c.lat, n = c.lat, w = c.lng, e = c.lng;
  for (const p of near) { s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lng); e = Math.max(e, p.lng); }
  const padLat = 180 / M_LAT, padLng = 180 / mLng(c.lat), minLat = 380 / M_LAT, minLng = 380 / mLng(c.lat);
  s = Math.min(s - padLat, c.lat - minLat); n = Math.max(n + padLat, c.lat + minLat);
  w = Math.min(w - padLng, c.lng - minLng); e = Math.max(e + padLng, c.lng + minLng);
  const near2km = (r: LL[]) => Math.max(...r.map((p) => dist(c, { lat: p[1], lng: p[0] }))) < 2200;
  if (named) for (const [x, y] of [named.ring, ...named.extra].filter(near2km).flat()) { s = Math.min(s, y - padLat); n = Math.max(n, y + padLat); w = Math.min(w, x - padLng); e = Math.max(e, x + padLng); }
  // a university's branches in other towns (Al-Balqa's colleges): every group of our buildings more than 3 km away
  // gets its own box, drawn like the main campus, and a chip on the map to fly there
  type Branch = { n: string; c: LL; box: [number, number, number, number] };
  const branches: Branch[] = [];
  for (const b of (bs ?? []).filter((x) => x.lat != null && dist(c, x as { lat: number; lng: number }) > 3000) as { name_ar: string; lat: number; lng: number }[]) {
    const g = branches.find((x) => dist({ lat: x.c[1], lng: x.c[0] }, b) < 1500);
    if (g) continue;
    const hx = 450 / mLng(b.lat), hy = 450 / M_LAT;
    branches.push({ n: b.name_ar, c: [r6(b.lng), r6(b.lat)], box: [r6(b.lng - hx), r6(b.lat - hy), r6(b.lng + hx), r6(b.lat + hy)] });
  }
  const boxes: [number, number, number, number][] = [[w, s, e, n], ...branches.map((x) => x.box)];
  const inBoxes = (p: LL) => boxes.some(([a, b2, c2, d]) => p[0] >= a && p[0] <= c2 && p[1] >= b2 && p[1] <= d);
  const elements = await osm(w, s, e, n);
  for (const b of branches) elements.push(...await osm(...b.box));

  type B = { o: number; c: LL[]; h: number; mh: number; n: string | null; b: string | null; f: number | null; k: string; ap?: 1; l?: 1; e?: boolean };
  const buildings: B[] = [];
  const green: { t: string; c: LL[] }[] = [];
  const parking: LL[][] = [];
  const paths: { t: string; c: LL[]; n?: string }[] = [];
  const trees: LL[] = [];
  const pois: { o: number; k: string; n: string | null; p: LL }[] = [];
  let campus: LL[] | null = null;

  for (const el of elements) {
    const t = el.tags ?? {};
    if (el.type === 'node') {
      if (t.natural === 'tree') { trees.push([r6(el.lon!), r6(el.lat!)]); continue; }
      const k = poiKind(t);
      if (k) pois.push({ o: el.id, k, n: nameOf(t), p: [r6(el.lon!), r6(el.lat!)] });
      continue;
    }
    if ((t.amenity === 'university' || t.amenity === 'college') && !t.building) {
      for (const r of rings(el)) if (inside([c.lng, c.lat], r) && (!campus || area(r) > area(campus))) campus = r;
      continue;
    }
    if (t.building || t['building:part']) {
      for (const r of rings(el)) {
        if (area(r) < 12) continue;
        const mh = parseFloat(t.min_height ?? '') || (parseFloat(t['building:min_level'] ?? '') > 0 ? parseFloat(t['building:min_level']) * 3.4 : 0);
        buildings.push({ o: el.id, c: r, h: heightOf(t), mh, n: publicName(t), b: null, f: null, k: t.building ?? 'part', e: !!(t.height || t['building:levels']) });
      }
      const k = poiKind(t);
      const r0 = rings(el)[0];
      if (k && r0 && k !== 'parking') pois.push({ o: el.id, k, n: nameOf(t), p: centroid(r0) });
      continue;
    }
    if (t.highway && el.type === 'way') {
      const l = lineOf(el.geometry);
      if (!l) continue;
      if (t.area === 'yes' && (t.highway === 'pedestrian' || t.highway === 'footway')) { green.push({ t: 'plaza', c: l }); }
      if (WALK.has(t.highway) || t.foot === 'yes' || t.foot === 'designated') paths.push({ t: t.highway === 'steps' ? 'steps' : ['footway', 'path', 'pedestrian', 'corridor', 'cycleway'].includes(t.highway) ? 'foot' : 'road', c: l, ...(nameOf(t) ? { n: nameOf(t)! } : {}) });
      continue;
    }
    if (t.natural === 'tree_row') { const l = lineOf(el.geometry); if (l) for (let i = 0; i < l.length; i++) trees.push(l[i]); continue; }
    if (t.amenity === 'parking') {
      for (const r of rings(el)) { parking.push(r); }
      const r0 = rings(el)[0];
      if (r0 && area(r0) > 300) pois.push({ o: el.id, k: 'parking', n: nameOf(t), p: centroid(r0) });
      continue;
    }
    const g = greenType(t);
    if (g) { for (const r of rings(el)) green.push({ t: g, c: r }); }
    const k = poiKind(t);
    const r0 = rings(el)[0];
    if (k && r0 && !g) pois.push({ o: el.id, k, n: nameOf(t), p: centroid(r0) });
    else if (k === 'sports' && r0) pois.push({ o: el.id, k, n: nameOf(t), p: centroid(r0) });
  }

  if (!campus && named) campus = named.ring;
  const campuses = campus ? [campus, ...(named?.extra ?? [])] : [];

  // where OpenStreetMap has no building, the shape Microsoft's footprints found on satellite imagery (campus-footprints)
  let ml = 0;
  const { data: fpFile } = await db.storage.from('campus').download(`fp/${uni.id}.json`);
  if (fpFile) {
    const parts = (JSON.parse(await fpFile.text()) as { parts?: Record<string, { c: LL[]; h: number }[]> }).parts ?? {};
    // compare only shapes whose boxes meet: a campus has thousands of each
    const bboxOf = (r: LL[]) => { let a = Infinity, b2 = Infinity, c2 = -Infinity, d = -Infinity; for (const [x, y] of r) { a = Math.min(a, x); c2 = Math.max(c2, x); b2 = Math.min(b2, y); d = Math.max(d, y); } return [a, b2, c2, d] as const; };
    const osmShapes = buildings.filter((x) => x.k !== 'part').map((x) => ({ x, bb: bboxOf(x.c) }));
    const seenFp = new Set<string>();
    for (const f of Object.values(parts).flat()) {
      const key = f.c[0].join(',');
      if (seenFp.has(key) || f.c.length < 4 || area(f.c) < 15) continue;
      seenFp.add(key);
      const cc = centroid(f.c);
      if (!inBoxes(cc)) continue;
      const fb = bboxOf(f.c);
      if (osmShapes.some(({ x, bb }) => bb[0] <= fb[2] && bb[2] >= fb[0] && bb[1] <= fb[3] && bb[3] >= fb[1] && (inside(cc, x.c) || inside(centroid(x.c), f.c)))) continue; // OSM drew it already
      buildings.push({ o: -(++ml), c: f.c, h: f.h > 0 ? f.h : 7, mh: 0, n: null, b: null, f: null, k: 'ml', e: f.h > 0 });
    }
  }

  // trees: the ones OSM mapped; where nobody mapped any, planted evenly in the green areas (for the look, not their spots)
  let planted = 0;
  if (trees.length < 40) {
    const boxes = buildings.filter((b) => b.k !== 'part').map((b) => { let a = Infinity, c2 = Infinity, d = -Infinity, f2 = -Infinity; for (const [x, y] of b.c) { a = Math.min(a, x); d = Math.max(d, x); c2 = Math.min(c2, y); f2 = Math.max(f2, y); } return { b, a, c2, d, f2 }; });
    const onBuilding = (p: LL) => boxes.some((q) => p[0] >= q.a && p[0] <= q.d && p[1] >= q.c2 && p[1] <= q.f2 && inside(p, q.b.c));
    for (const g of green) {
      if (!['grass', 'wood', 'scrub'].includes(g.t) || area(g.c) < 150) continue;
      const step = g.t === 'wood' ? 9 : 15;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of g.c) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const dx = step / mLng(y0), dy = step / M_LAT;
      for (let y = y0 + dy / 2; y < y1 && planted < 4000; y += dy) {
        for (let x = x0 + dx / 2; x < x1 && planted < 4000; x += dx) {
          // a fixed jitter from the position, so every build plants the same trees
          const j = Math.sin(x * 12.9898e3 + y * 78.233e3) * 43758.5453, jx = (j - Math.floor(j) - 0.5) * dx * 0.7, jy = (((j * 7) % 1) - 0.5) * dy * 0.7;
          const p: LL = [r6(x + jx), r6(y + jy)];
          if (inside(p, g.c) && !onBuilding(p)) { trees.push(p); planted++; }
        }
      }
    }
  }

  // link our buildings (official names, floors) to the OSM outlines: the outline they sit in, else the nearest within 40 m
  const used = new Set<number>();
  let linked = 0, approx = 0;
  for (const b of (bs ?? []).filter((x) => x.lat != null && (dist(c, x as { lat: number; lng: number }) < 3000 || branches.some((g) => dist({ lat: g.c[1], lng: g.c[0] }, x as { lat: number; lng: number }) < 1500)))) {
    const p: LL = [b.lng!, b.lat!];
    let hit = buildings.findIndex((x, i) => !used.has(i) && (b.osm_id ? String(x.o) === String(b.osm_id).replace(/\D/g, '') : false));
    if (hit < 0) hit = buildings.findIndex((x, i) => !used.has(i) && x.k !== 'part' && inside(p, x.c));
    if (hit < 0) {
      let best = -1, bd = 40;
      buildings.forEach((x, i) => { if (used.has(i) || x.k === 'part') return; const cc = centroid(x.c); const d = dist({ lat: cc[1], lng: cc[0] }, { lat: p[1], lng: p[0] }); if (d < bd) { bd = d; best = i; } });
      hit = best;
    }
    if (hit >= 0) {
      used.add(hit);
      const x = buildings[hit];
      x.b = b.id; x.n = b.name_ar || x.n; x.f = b.floors ?? null;
      if (b.floors && !x.e) x.h = b.floors * 3.4 + 1;
      linked++;
    } else {
      // no outline in OSM: an approximate box, so every building still stands on the map
      const hx = 17 / mLng(p[1]), hy = 11 / M_LAT;
      buildings.push({ o: 0, c: [[r6(p[0] - hx), r6(p[1] - hy)], [r6(p[0] + hx), r6(p[1] - hy)], [r6(p[0] + hx), r6(p[1] + hy)], [r6(p[0] - hx), r6(p[1] + hy)], [r6(p[0] - hx), r6(p[1] - hy)]],
        h: (b.floors ?? 3) * 3.4 + 1, mh: 0, n: b.name_ar, b: b.id, f: b.floors ?? null, k: 'approx', ap: 1 });
      approx++;
    }
  }

  // "on campus": inside the university's outline when OSM has one, else close to the buildings we know there.
  // Small colleges sit in the middle of a city, and the shops around them aren't theirs.
  const known = (bs ?? []).filter((x) => x.lat != null && dist(c, x as { lat: number; lng: number }) < 1500) as { lat: number; lng: number }[];
  const reach = Math.max(200, ...known.map((x) => dist(c, x) + 60));
  const onCampus = (p: LL) => (campuses.length ? campuses.some((r) => inside(p, r)) : dist(c, { lat: p[1], lng: p[0] }) < reach)
    || branches.some((g) => dist({ lat: g.c[1], lng: g.c[0] }, { lat: p[1], lng: p[0] }) < 400);

  // every building on campus carries a name: its own, else where it stands («مبنى قرب كلية الشريعة», numbered when one
  // landmark has several next to it), else a number. `l` marks the ones the map labels from this file (ours, linked to
  // the buildings table, are labelled from there). A real name, from OSM or the table, always wins on the next build.
  // a building we hid (a home, a wrong name) keeps its shape but not the name OSM gave it
  const hiddenOsm = new Set((hidden ?? []).map((x) => String(x.osm_id ?? '').replace(/\D/g, '')).filter(Boolean));
  const hiddenName = new Set((hidden ?? []).flatMap((x) => [x.name_ar, x.name_en]).filter(Boolean));
  for (const x of buildings) if (!x.b && x.n && (hiddenOsm.has(String(x.o)) || hiddenName.has(x.n))) x.n = null;
  const GENERIC = new Set([...Object.values(KIND_AR), 'حديقة']);
  const short = (n: string) => n.split(/[،,(]| - /)[0].trim();
  const pt = (p: LL) => ({ lat: p[1], lng: p[0] });
  const anchors = [
    ...buildings.filter((x) => x.n && x.k !== 'part' && onCampus(centroid(x.c))).map((x) => ({ n: short(x.n!), p: centroid(x.c) })),
    ...((ps ?? []) as { kind: string; name_ar: string | null; lat: number; lng: number; state: string }[])
      .filter((x) => x.state === 'approved' && x.name_ar && !GENERIC.has(x.name_ar) && LANDMARKS.has(x.kind) && onCampus([x.lng, x.lat]))
      .map((x) => ({ n: short(x.name_ar!), p: [x.lng, x.lat] as LL })),
  ].filter((a) => a.n.length > 1 && /[\u0621-\u064A]/.test(a.n) && !/^مبنى رقم| قرب |^مبنى قرب /.test(a.n));
  const unnamed = buildings.filter((x) => !x.n && x.k !== 'part' && onCampus(centroid(x.c))).map((x) => ({ x, p: centroid(x.c) }))
    .sort((a, b) => b.p[1] - a.p[1] || a.p[0] - b.p[0]);
  const nearest = unnamed.map(({ p }) => {
    let best: string | null = null, bd = 90;
    for (const a of anchors) { const d = dist(pt(a.p), pt(p)); if (d < bd) { bd = d; best = a.n; } }
    return best;
  });
  const around = new Map<string, number>(), seen = new Map<string, number>();
  nearest.forEach((a) => { if (a) around.set(a, (around.get(a) ?? 0) + 1); });
  let numbered = 0;
  unnamed.forEach(({ x }, i) => {
    const a = nearest[i];
    if (!a) { x.n = `مبنى رقم ${++numbered}`; return; }
    const k = (seen.get(a) ?? 0) + 1; seen.set(a, k);
    x.n = around.get(a)! > 1 ? `مبنى ${k} قرب ${a}` : `مبنى قرب ${a}`;
  });
  for (const x of buildings) if (x.n && !x.b && x.k !== 'part' && onCampus(centroid(x.c))) x.l = 1;

  // points of interest → `places` (new ones only; anything already there, by OSM id or same kind within 20 m, stays as it is)
  const have = (ps ?? []) as { kind: string; lat: number; lng: number; osm_id: string | null }[];
  const haveOsm = new Set(have.map((x) => String(x.osm_id ?? '').replace(/\D/g, '')).filter(Boolean));
  const fresh = pois.filter((x) => (x.n || ['bus', 'kiosk', 'atm', 'gate', 'cafeteria', 'restaurant', 'pharmacy', 'mosque', 'print'].includes(x.k))
    && !haveOsm.has(String(x.o)) && !have.some((h) => h.kind === x.k && dist({ lat: h.lat, lng: h.lng }, { lat: x.p[1], lng: x.p[0] }) < 20)
    && onCampus(x.p) && !(x.n && isPrivate(x.n)));
  let added = 0;
  for (let i = 0; i < fresh.length; i += 200) {
    const rows = fresh.slice(i, i + 200).map((x) => ({ university_id: uni.id, kind: x.k, name_ar: x.n ?? KIND_AR[x.k] ?? 'خدمة', lat: x.p[1], lng: x.p[0], state: 'approved', osm_id: String(x.o) }));
    const { error, count } = await db.from('places').insert(rows, { count: 'exact' });
    if (!error) added += count ?? rows.length;
  }
  // a place OSM left nameless («بوابة», «موقف سيارات») is told apart by the building next to it
  await db.rpc('campus_label_places', { p_university: uni.id });

  buildings.sort((a, b) => area(b.c) - area(a.c));
  for (const x of buildings) delete x.e;
  const out = { v: 2, at: new Date().toISOString(), bbox: [r6(w), r6(s), r6(e), r6(n)], center: [c.lng, c.lat], campus, campuses,
    buildings, green, parking, paths, trees: trees.slice(0, 6000), ...(planted ? { planted: 1 } : {}), ...(branches.length ? { branches: branches.map(({ n, c }) => ({ n, c })) } : {}) };
  const body = JSON.stringify(out);
  const up = await db.storage.from('campus').upload(`${uni.id}.json`, new Blob([body], { type: 'application/json' }), { upsert: true, contentType: 'application/json', cacheControl: '3600' });
  if (up.error) throw new Error('upload: ' + up.error.message);
  const stats = { outline: !!named, outlines: campuses.length, ml, planted, branches: branches.length, boxes, moved, buildings: buildings.length, linked, approx, labelled: unnamed.length, green: green.length, paths: paths.length, trees: trees.length, pois: pois.length, added, bytes: body.length };
  await db.rpc('campus_map_saved', { p_university: uni.id, p_bbox: out.bbox, p_stats: stats, p_error: null });
  return stats;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) return new Response('no', { status: 401 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const body = await req.json().catch(() => ({})) as { university_id?: string };
  let q = db.from('universities').select('id, center_lat, center_lng, name_ar, name_en').not('center_lat', 'is', null);
  if (body.university_id) q = q.eq('id', body.university_id);
  else {
    // the weekly run: the campus whose file is oldest (one per call keeps each run short)
    const { data: next } = await db.rpc('campus_map_next');
    if (!next) return Response.json({ idle: true });
    q = q.eq('id', next as string);
  }
  const { data: unis } = await q;
  const res: Record<string, unknown> = {};
  for (const u of (unis ?? []) as Uni[]) {
    try { res[u.id] = await build(db, u); }
    catch (e) { res[u.id] = { error: String(e).slice(0, 600) }; await db.rpc('campus_map_saved', { p_university: u.id, p_bbox: null, p_stats: null, p_error: String(e).slice(0, 300) }); }
  }
  return Response.json(res);
});
