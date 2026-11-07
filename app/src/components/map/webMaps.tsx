/**
 * react-native-maps for the web (metro.config.js points `react-native-maps` here on web), drawn with MapLibre GL:
 * the same MapView / Marker / Polyline the screens use on phones, plus a real 3D campus when given one —
 * extruded buildings with light and soft shadows, trees, green areas, paths, and a 3D route ribbon.
 * MapLibre (~800 KB) loads only when a map is first shown.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import type * as ML from 'maplibre-gl';
import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { centroid, inside, M_LAT, mLng, type CampusBuilding, type CampusData, type LL } from '@/lib/campus/data';
import type { MapTheme } from '@/lib/campus/theme';

type Lib = typeof ML;
let lib: Lib | null = null;
let loading: Promise<Lib> | null = null;
const loadLib = () => (loading ??= import('maplibre-gl').then((m) => { lib = ((m as unknown as { default?: Lib }).default ?? m) as Lib; return lib; }));
/** The phone's 3D view has MapLibre in its own bundle (a web view can't load split chunks), so it hands it over here. */
export function provideLib(m: unknown) { lib = ((m as { default?: Lib }).default ?? m) as Lib; loading = Promise.resolve(lib); }

type LatLng = { latitude: number; longitude: number };
type Camera = { center?: LatLng; zoom?: number; pitch?: number; heading?: number };
type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number; zoom: number };
type Props = {
  style?: StyleProp<ViewStyle>; children?: ReactNode;
  initialCamera?: Camera; initialRegion?: LatLng;
  mapType?: string;
  onPress?: (e: unknown) => void;
  onRegionChangeComplete?: (r: Region) => void;
  /** the student moved the map with a finger (not the app moving the camera) */
  onPanDrag?: () => void;
  onReady?: () => void; // the map is drawn (the phone's 3D view waits for this before giving up on it)
  // web only
  campus?: CampusData | null; theme?: MapTheme; highlight?: string | null; route?: LL[] | null;
  onBuildingPress?: (b: Pick<CampusBuilding, 'b' | 'n' | 'f'> & { at: LatLng }) => void;
};
export type MapHandle = {
  animateCamera: (c: Camera, o?: { duration?: number }) => void;
  animateToRegion: (r: LatLng, ms?: number) => void;
  fitToCoordinates: (cs: LatLng[], o?: { edgePadding?: { top?: number; bottom?: number; left?: number; right?: number }; animated?: boolean }) => void;
};

type Reg = Map<HTMLElement, number>;
const Ctx = createContext<{ map: ML.Map; lib: Lib; reg: Reg; relayout: () => void } | null>(null);

/**
 * Labels never pile up: after every zoom or move, markers are placed from the most important down, and one that
 * would overlap an already placed one is hidden until there's room (zoom in and it comes back).
 */
function declutter(reg: Reg) {
  const placed: DOMRect[] = [];
  const all = [...reg.entries()].sort((a, b) => b[1] - a[1]);
  for (const [el, pr] of all) {
    el.style.visibility = 'visible';
    if (pr >= 90) { placed.push(el.getBoundingClientRect()); continue; } // the picked place, the route's end, me: always shown
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const hit = placed.some((q) => r.left < q.right + 3 && r.right > q.left - 3 && r.top < q.bottom + 2 && r.bottom > q.top - 2);
    if (hit) el.style.visibility = 'hidden'; else placed.push(r);
  }
}
const TILES = 'https://tiles.openfreemap.org/planet';
const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const DEFAULT_THEME: MapTheme = {
  bg: '#EEF0F3', land: '#F3F1EC', water: '#A9D3F5', grass: '#CFE8BE', wood: '#B5DBA0', pitch: '#9FD67F', pitchLine: '#FFFFFF', plaza: '#ECE8E0',
  parking: '#E3E5EA', road: '#FFFFFF', roadEdge: '#D9DCE3', foot: '#FFFFFF', steps: '#C9A37A', city: '#E2E2E6', building: '#ECE9E4',
  campusBuilding: '#F7F3EC', highlight: '#FF7A5C', approx: '#E9E2F7', shadow: '#6B6F80', shadowOpacity: 0.22, tree: '#7DBE63', trunk: '#8A6A4A',
  campusEdge: '#9AA3B8', campusFill: '#FAF8F4', route: '#2E7BFF', routeGlow: '#FFFFFF', light: { color: '#FFF6E8', intensity: 0.42 },
};

// ---------- campus file → GeoJSON (once per file) ----------
const poly = (ring: LL[], props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } });
const line = (c: LL[], props: Record<string, unknown> = {}): GeoJSON.Feature => ({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: c } });
const fc = (features: GeoJSON.Feature[]): GeoJSON.FeatureCollection => ({ type: 'FeatureCollection', features });

function hull(pts: LL[]): LL[] { // convex hull (monotone chain), closed
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: LL, a: LL, b: LL) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: LL[] = [], up: LL[] = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  const h = lo.slice(0, -1).concat(up.slice(0, -1));
  return [...h, h[0]];
}
function circle(c: LL, r: number, n = 8): LL[] {
  const kx = mLng(c[1]), out: LL[] = [];
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2; out.push([c[0] + (Math.cos(a) * r) / kx, c[1] + (Math.sin(a) * r) / M_LAT]); }
  return out;
}
/** A flat ribbon around a line, 2·w metres wide: extruded a little, it reads as a 3D route on the ground. */
function ribbon(c: LL[], w: number): GeoJSON.Feature[] {
  const out: GeoJSON.Feature[] = [];
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i], kx = mLng(a[1]);
    const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * M_LAT, L = Math.hypot(dx, dy) || 1;
    const nx = (-dy / L) * w, ny = (dx / L) * w;
    out.push(poly([[a[0] + nx / kx, a[1] + ny / M_LAT], [b[0] + nx / kx, b[1] + ny / M_LAT], [b[0] - nx / kx, b[1] - ny / M_LAT], [a[0] - nx / kx, a[1] - ny / M_LAT], [a[0] + nx / kx, a[1] + ny / M_LAT]]));
    out.push(poly(circle(b, w, 10))); // round joints
  }
  return out;
}

const geoCache = new WeakMap<CampusData, ReturnType<typeof toGeo>>();
function toGeo(d: CampusData) {
  // the sun from the south-west, a little high: shadows fall north-east, ~0.5 × the height
  const sx = Math.sin((40 * Math.PI) / 180), sy = Math.cos((40 * Math.PI) / 180);
  const blds: GeoJSON.Feature[] = [], shadows: GeoJSON.Feature[] = [];
  // a building drawn in parts (different heights): the parts stand in for its outline, which would flicker
  // through them, and they take its name so it can still be picked and highlighted as one building
  const parts = d.buildings.filter((b) => b.k === 'part');
  const parent = new Map<CampusBuilding, CampusBuilding>();
  const hasParts = new Set<CampusBuilding>();
  for (const pt of parts) {
    const c = centroid(pt.c);
    const host = d.buildings.find((b) => b.k !== 'part' && inside(c, b.c));
    if (host) { parent.set(pt, host); hasParts.add(host); }
  }
  for (const b of d.buildings) {
    if (hasParts.has(b)) continue;
    const host = parent.get(b) ?? b;
    blds.push(poly(b.c, { h: b.h, mh: b.mh, b: host.b ?? '', n: host.n ?? '', f: host.f ?? -1, ap: b.ap ? 1 : 0, part: b.k === 'part' ? 1 : 0 }));
    if (b.mh > 0) continue;
    const L = b.h * 0.5, kx = mLng(b.c[0][1]);
    const moved = b.c.map(([x, y]) => [x + (sx * L) / kx, y + (sy * L) / M_LAT] as LL);
    shadows.push(poly(hull([...b.c, ...moved])));
  }
  const trees: GeoJSON.Feature[] = [], trunks: GeoJSON.Feature[] = [];
  d.trees.forEach((p, i) => {
    const s = ((i * 2654435761) % 1000) / 1000; // the same "random" size every time
    trees.push(poly(circle(p, 2.2 + s * 1.4, 7), { h: 6 + s * 3.5, mh: 2.2 }));
    trunks.push(poly(circle(p, 0.35, 5), { h: 2.4 }));
  });
  return {
    blds: fc(blds), shadows: fc(shadows), trees: fc(trees), trunks: fc(trunks),
    green: fc(d.green.map((g) => (g.t === 'plaza' && g.c.length < 4 ? null : poly(g.c, { t: g.t }))).filter(Boolean) as GeoJSON.Feature[]),
    parking: fc(d.parking.map((r) => poly(r))),
    paths: fc(d.paths.map((p) => line(p.c, { t: p.t }))),
    campus: d.campuses?.length ? fc(d.campuses.map((r) => poly(r))) : d.campus ? fc([poly(d.campus)]) : EMPTY,
  };
}
const geoOf = (d: CampusData) => { let g = geoCache.get(d); if (!g) { g = toGeo(d); geoCache.set(d, g); } return g; };

/**
 * The base map: streets and land around the campus from OpenFreeMap. Offline (a phone on campus without data) there's
 * nothing to fetch, so the map starts with just its background and the campus drawn from the kept file on top: it
 * opens at once instead of waiting on tiles that can't come.
 */
function style(th: MapTheme): ML.StyleSpecification {
  const online = typeof navigator === 'undefined' || navigator.onLine !== false;
  const full: ML.StyleSpecification = {
    version: 8,
    sources: {
      omt: { type: 'vector', url: TILES, attribution: '© OpenStreetMap' },
      sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 19, attribution: 'Esri' },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': th.land } },
      { id: 'sat', type: 'raster', source: 'sat', layout: { visibility: 'none' } },
      { id: 'landcover', type: 'fill', source: 'omt', 'source-layer': 'landcover', filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]], paint: { 'fill-color': th.grass, 'fill-opacity': 0.55 } },
      { id: 'park', type: 'fill', source: 'omt', 'source-layer': 'park', paint: { 'fill-color': th.grass, 'fill-opacity': 0.6 } },
      { id: 'water', type: 'fill', source: 'omt', 'source-layer': 'water', paint: { 'fill-color': th.water } },
      { id: 'roads-edge', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': th.roadEdge, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 1.5, 18, 22] } },
      { id: 'roads', type: 'line', source: 'omt', 'source-layer': 'transportation', filter: ['!=', ['get', 'class'], 'path'],
        layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': th.road, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 12, 0.8, 18, 18] } },
      { id: 'city', type: 'fill-extrusion', source: 'omt', 'source-layer': 'building', minzoom: 14,
        paint: { 'fill-extrusion-color': th.city, 'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6], 'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0], 'fill-extrusion-opacity': 0.85 } },
    ],
  };
  return online ? full : { ...full, sources: {}, layers: full.layers.filter((l) => l.type === 'background') };
}

function addCampus(map: ML.Map, g: ReturnType<typeof toGeo>, th: MapTheme) {
  const src = (id: string, data: GeoJSON.FeatureCollection) => { if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data }); else (map.getSource(id) as ML.GeoJSONSource).setData(data); };
  src('c-campus', g.campus); src('c-green', g.green); src('c-parking', g.parking); src('c-paths', g.paths);
  src('c-shadow', g.shadows); src('c-bld', g.blds); src('c-trees', g.trees); src('c-trunks', g.trunks);
  const add = (l: ML.LayerSpecification) => { if (!map.getLayer(l.id)) map.addLayer(l, map.getLayer('route-glow') ? 'route-glow' : undefined); };
  add({ id: 'c-campus-fill', type: 'fill', source: 'c-campus', paint: { 'fill-color': th.campusFill, 'fill-opacity': 0.7 } });
  add({ id: 'c-campus-edge', type: 'line', source: 'c-campus', paint: { 'line-color': th.campusEdge, 'line-width': 1.5, 'line-dasharray': [3, 2] } });
  add({ id: 'c-green', type: 'fill', source: 'c-green', paint: { 'fill-color': ['match', ['get', 't'], 'water', th.water, 'wood', th.wood, 'pitch', th.pitch, 'plaza', th.plaza, 'scrub', th.wood, th.grass], 'fill-antialias': true } });
  add({ id: 'c-pitch-line', type: 'line', source: 'c-green', filter: ['==', ['get', 't'], 'pitch'], minzoom: 16, paint: { 'line-color': th.pitchLine, 'line-width': 1.5, 'line-opacity': 0.8 } });
  add({ id: 'c-parking', type: 'fill', source: 'c-parking', paint: { 'fill-color': th.parking, 'fill-outline-color': th.roadEdge } });
  add({ id: 'c-road-edge', type: 'line', source: 'c-paths', filter: ['==', ['get', 't'], 'road'], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': th.roadEdge, 'line-width': ['interpolate', ['exponential', 1.7], ['zoom'], 14, 2, 19, 20] } });
  add({ id: 'c-road', type: 'line', source: 'c-paths', filter: ['==', ['get', 't'], 'road'], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': th.road, 'line-width': ['interpolate', ['exponential', 1.7], ['zoom'], 14, 1.2, 19, 16] } });
  add({ id: 'c-foot', type: 'line', source: 'c-paths', filter: ['==', ['get', 't'], 'foot'], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': th.foot, 'line-width': ['interpolate', ['exponential', 1.6], ['zoom'], 15, 0.8, 19, 6], 'line-opacity': 0.95 } });
  add({ id: 'c-steps', type: 'line', source: 'c-paths', filter: ['==', ['get', 't'], 'steps'], minzoom: 16,
    paint: { 'line-color': th.steps, 'line-width': ['interpolate', ['linear'], ['zoom'], 16, 2, 19, 6], 'line-dasharray': [0.4, 0.3] } });
  add({ id: 'c-shadow', type: 'fill', source: 'c-shadow', minzoom: 15, paint: { 'fill-color': th.shadow, 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 15, 0, 16, th.shadowOpacity] } });
  add({ id: 'c-bld', type: 'fill-extrusion', source: 'c-bld', paint: {
    'fill-extrusion-color': ['case', ['==', ['get', 'ap'], 1], th.approx, ['!=', ['get', 'b'], ''], th.campusBuilding, th.building],
    'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13.6, 0, 14.6, ['get', 'h']],
    'fill-extrusion-base': ['get', 'mh'], 'fill-extrusion-opacity': 0.96, 'fill-extrusion-vertical-gradient': true } });
  add({ id: 'c-trunks', type: 'fill-extrusion', source: 'c-trunks', minzoom: 16.5, paint: { 'fill-extrusion-color': th.trunk, 'fill-extrusion-height': ['get', 'h'] } });
  add({ id: 'c-trees', type: 'fill-extrusion', source: 'c-trees', minzoom: 16, paint: { 'fill-extrusion-color': th.tree, 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'mh'], 'fill-extrusion-opacity': 0.92 } });
  if (map.getLayer('city')) map.setLayoutProperty('city', 'visibility', 'none'); // the campus file has the buildings around it too
}

function setRoute(map: ML.Map, th: MapTheme, c: LL[] | null) {
  const lineData = c && c.length > 1 ? fc([line(c)]) : EMPTY;
  const ribbonData = c && c.length > 1 ? fc(ribbon(c, 1.5)) : EMPTY;
  if (!map.getSource('route')) {
    map.addSource('route', { type: 'geojson', data: lineData });
    map.addSource('route-3d', { type: 'geojson', data: ribbonData });
    map.addLayer({ id: 'route-glow', type: 'line', source: 'route', layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': th.routeGlow, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 6, 19, 18], 'line-opacity': 0.9 } });
    map.addLayer({ id: 'route-line', type: 'line', source: 'route', maxzoom: 16.5, layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': th.route, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 3, 16.5, 7] } });
    map.addLayer({ id: 'route-3d', type: 'fill-extrusion', source: 'route-3d', minzoom: 16,
      paint: { 'fill-extrusion-color': th.route, 'fill-extrusion-height': 0.9, 'fill-extrusion-opacity': 0.95 } });
  } else {
    (map.getSource('route') as ML.GeoJSONSource).setData(lineData);
    (map.getSource('route-3d') as ML.GeoJSONSource).setData(ribbonData);
  }
}

const MapView = forwardRef<MapHandle, Props>(function MapView(p, ref) {
  const box = useRef<HTMLDivElement | null>(null);
  const [ctx, setCtx] = useState<{ map: ML.Map; lib: Lib; reg: Reg; relayout: () => void } | null>(null);
  const [ready, setReady] = useState(false);
  const cb = useRef(p);
  cb.current = p;
  const th = p.theme ?? DEFAULT_THEME;

  useEffect(() => {
    let m: ML.Map | null = null, dead = false, ro: ResizeObserver | null = null;
    loadLib().then((L) => {
      if (dead || !box.current) return;
      const c = p.initialCamera?.center ?? p.initialRegion ?? { latitude: 32, longitude: 36 };
      m = new L.Map({ container: box.current, style: style(th), center: [c.longitude, c.latitude], zoom: p.initialCamera?.zoom ?? 16,
        pitch: p.initialCamera?.pitch ?? 0, bearing: Number.isFinite(p.initialCamera?.heading) ? p.initialCamera!.heading! : 0, maxPitch: 75, maxZoom: 20.5, attributionControl: { compact: true },
        fadeDuration: 150, dragRotate: true, pitchWithRotate: true });
      m.on('load', () => {
        m!.setLight({ anchor: 'map', position: [1.4, 210, 35], color: th.light.color, intensity: th.light.intensity });
        setRoute(m!, th, null);
        setReady(true);
        cb.current.onReady?.();
      });
      // tiles that don't load (offline, blocked) just leave the plain background; nothing to show the user
      m.on('error', () => {});
      // a finger on the map (MapLibre only gives camera moves made by the app no original event)
      m.on('movestart', (e: { originalEvent?: unknown }) => { if (e.originalEvent) cb.current.onPanDrag?.(); });
      m.on('moveend', () => {
        const b = m!.getBounds(), z = m!.getZoom(), ce = m!.getCenter();
        cb.current.onRegionChangeComplete?.({ latitude: ce.lat, longitude: ce.lng, latitudeDelta: b.getNorth() - b.getSouth(), longitudeDelta: b.getEast() - b.getWest(), zoom: z });
      });
      m.on('click', (e) => {
        const hit = m!.getLayer('c-bld') ? m!.queryRenderedFeatures(e.point, { layers: ['c-bld'] })[0] : undefined;
        const pr = hit?.properties as { b?: string; n?: string; f?: number } | undefined;
        if (pr && cb.current.onBuildingPress && (pr.b || pr.n)) {
          cb.current.onBuildingPress({ b: pr.b || null, n: pr.n || null, f: pr.f != null && pr.f >= 0 ? pr.f : null, at: { latitude: e.lngLat.lat, longitude: e.lngLat.lng } });
          return;
        }
        cb.current.onPress?.({});
      });
      const reg: Reg = new Map();
      let tm: ReturnType<typeof setTimeout> | null = null;
      const relayout = () => { if (!tm) tm = setTimeout(() => { tm = null; declutter(reg); }, 90); };
      m.on('zoom', relayout); m.on('rotate', relayout); m.on('pitch', relayout); m.on('moveend', relayout);
      setCtx({ map: m, lib: L, reg, relayout });
      ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => m?.resize()) : null;
      ro?.observe(box.current);
    });
    return () => { dead = true; ro?.disconnect(); m?.remove(); };
    // the map is made once; later prop changes are applied by the effects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the campus in 3D, once its file is here
  useEffect(() => { if (ctx && ready && p.campus) addCampus(ctx.map, geoOf(p.campus), th); }, [ctx, ready, p.campus, th]);
  // satellite: the photo under everything, the drawn ground hidden
  const sat = typeof p.mapType === 'string' && /hybrid|satellite/.test(p.mapType);
  useEffect(() => {
    if (!ctx || !ready) return;
    const m = ctx.map, vis = (id: string, on: boolean) => { if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'); };
    vis('sat', sat);
    for (const id of ['landcover', 'park', 'water', 'c-campus-fill', 'c-green', 'c-parking', 'c-shadow', 'c-road-edge', 'c-road', 'c-foot', 'c-pitch-line']) vis(id, !sat);
    if (m.getLayer('c-bld')) m.setPaintProperty('c-bld', 'fill-extrusion-opacity', sat ? 0.78 : 0.96);
  }, [ctx, ready, sat, p.campus]);
  // the building that's picked glows in the accent colour
  useEffect(() => {
    if (!ctx || !ready || !ctx.map.getLayer('c-bld')) return;
    ctx.map.setPaintProperty('c-bld', 'fill-extrusion-color', ['case',
      ['all', ['!=', ['get', 'b'], ''], ['==', ['get', 'b'], p.highlight ?? '#none']], th.highlight,
      ['==', ['get', 'ap'], 1], th.approx, ['!=', ['get', 'b'], ''], th.campusBuilding, th.building]);
  }, [ctx, ready, p.highlight, p.campus, th]);
  useEffect(() => { if (ctx && ready) setRoute(ctx.map, th, p.route ?? null); }, [ctx, ready, p.route, th]);

  useImperativeHandle(ref, () => ({
    animateCamera(cam, o) {
      const m = ctx?.map;
      if (!m) return;
      // only the parts given: MapLibre reads a present-but-undefined bearing as NaN and the map goes blank
      const opt: ML.EaseToOptions = { duration: o?.duration ?? 600 };
      if (cam.center) opt.center = [cam.center.longitude, cam.center.latitude];
      if (cam.zoom != null) opt.zoom = cam.zoom;
      if (cam.pitch != null) opt.pitch = cam.pitch;
      if (cam.heading != null && Number.isFinite(cam.heading)) opt.bearing = cam.heading;
      m.easeTo(opt);
    },
    animateToRegion(r, ms) { ctx?.map.easeTo({ center: [r.longitude, r.latitude], duration: ms ?? 600 }); },
    fitToCoordinates(cs, o) {
      const m = ctx?.map;
      if (!m || !cs.length) return;
      const e = o?.edgePadding ?? {};
      const b = new ctx.lib.LngLatBounds();
      cs.forEach((x) => b.extend([x.longitude, x.latitude]));
      m.fitBounds(b, { padding: { top: e.top ?? 30, bottom: e.bottom ?? 30, left: e.left ?? 30, right: e.right ?? 30 }, maxZoom: 18, duration: o?.animated === false ? 0 : 800, pitch: m.getPitch() });
    },
  }), [ctx]);

  return (
    <View style={[{ overflow: 'hidden', backgroundColor: th.bg }, p.style]}>
      <div ref={box} style={{ position: 'absolute', inset: 0 }} />
      {ctx && <Ctx.Provider value={ctx}>{p.children}</Ctx.Provider>}
    </View>
  );
});

/** A React view pinned to a point; MapLibre moves it (GPU transform), React only renders it when its content changes. */
export function Marker({ coordinate, children, onPress, anchor, zIndex, priority }: { coordinate: LatLng; children?: ReactNode; onPress?: () => void; anchor?: { x: number; y: number }; zIndex?: number; priority?: number }) {
  const ctx = useContext(Ctx);
  const el = useMemo(() => { const d = document.createElement('div'); d.style.cursor = 'pointer'; return d; }, []);
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(() => {
    const f = (e: MouseEvent) => { if (press.current) { e.stopPropagation(); press.current(); } };
    el.addEventListener('click', f);
    return () => el.removeEventListener('click', f);
  }, [el]);
  const mk = useRef<ML.Marker | null>(null);
  const ax = anchor?.x ?? 0.5, ay = anchor?.y ?? 1;
  useEffect(() => {
    if (!ctx) return;
    const a = ay <= 0.25 ? 'top' : ay >= 0.75 ? 'bottom' : 'center';
    mk.current = new ctx.lib.Marker({ element: el, anchor: a === 'center' ? (ax < 0.25 ? 'left' : ax > 0.75 ? 'right' : 'center') : a }).setLngLat([coordinate.longitude, coordinate.latitude]).addTo(ctx.map);
    return () => { mk.current?.remove(); mk.current = null; };
    // made once per map; the position is updated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, el]);
  useEffect(() => { mk.current?.setLngLat([coordinate.longitude, coordinate.latitude]); }, [coordinate.latitude, coordinate.longitude]);
  useEffect(() => { el.style.zIndex = String(zIndex ?? 1); }, [el, zIndex]);
  useEffect(() => {
    if (!ctx) return;
    ctx.reg.set(el, priority ?? zIndex ?? 1); ctx.relayout();
    return () => { ctx.reg.delete(el); ctx.relayout(); };
  }, [ctx, el, priority, zIndex]);
  return createPortal(children ?? <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#3D5AFE', borderWidth: 2, borderColor: '#fff' }} />, el);
}

let lineIds = 0;
export function Polyline({ coordinates, strokeColor, strokeWidth, lineDashPattern }: { coordinates: LatLng[]; strokeColor?: string; strokeWidth?: number; lineDashPattern?: number[] }) {
  const ctx = useContext(Ctx);
  const id = useMemo(() => `pl-${++lineIds}`, []);
  const data = useMemo(() => fc(coordinates.length > 1 ? [line(coordinates.map((c) => [c.longitude, c.latitude] as LL))] : []), [coordinates]);
  useEffect(() => {
    const m = ctx?.map;
    if (!m) return;
    const add = () => {
      if (m.getSource(id)) return;
      m.addSource(id, { type: 'geojson', data });
      m.addLayer({ id, type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': strokeColor ?? '#3D5AFE', 'line-width': strokeWidth ?? 4, ...(lineDashPattern ? { 'line-dasharray': lineDashPattern.map((x) => x / (strokeWidth ?? 4)) } : {}) } });
    };
    if (m.isStyleLoaded()) add(); else m.once('load', add);
    return () => { try { if (m.getLayer(id)) m.removeLayer(id); if (m.getSource(id)) m.removeSource(id); } catch { /* the map is already gone */ } };
    // style changes are rare (theme switch reloads the app); the line itself is updated below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, id]);
  useEffect(() => { (ctx?.map.getSource(id) as ML.GeoJSONSource | undefined)?.setData(data); }, [ctx, id, data]);
  return null;
}

const Noop = () => null;
export const Callout = Noop, Circle = Noop, Polygon = Noop;
export const PROVIDER_DEFAULT = undefined, PROVIDER_GOOGLE = 'google';
export default MapView;

