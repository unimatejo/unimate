import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronRight, Crosshair, School, Footprints, Layers, MapPinPlus, Maximize2, Navigation, Pause, Play, Search, Send, SkipBack, SkipForward, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Linking, Platform, ScrollView, TextInput, View } from 'react-native';
import MapView, { Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ShareToChat } from '@/components/chat/ShareToChat';
import Map3D, { type Campus3DHandle } from '@/components/map/Map3D';
import { FILTERS, inGroup, kindOf, localSearch, MINOR, TOUR_KINDS, type FilterKey, type Pin } from '@/components/map/kinds';
import { MapMarkers, type MarkerSpec } from '@/components/map/markers';
import { NativeCampus } from '@/components/map/NativeCampus';
import { DirectionBanner, NavCard } from '@/components/map/NavPanel';
import { SuggestPlace } from '@/components/map/SuggestPlace';
import { UniSwitcher } from '@/components/map/UniSwitcher';
import { Button, Chip, Row, T, Tap } from '@/components/ui';
import { GlyphTile } from '@/components/ui/Glyph';
import { useAuth } from '@/lib/auth';
import { fetchPins, keptPins } from '@/lib/campus/pins';
import { CAMPUS_BASE, centroid, distM, findBuilding, loadCampus, type CampusData, type LL } from '@/lib/campus/data';
import { progress, walkRoute, type Route } from '@/lib/campus/route';
import { mapTheme } from '@/lib/campus/theme';
import { flip, nm, t, ta } from '@/lib/i18n';
import { goBack } from '@/lib/nav';
import { getPref } from '@/lib/prefs';
import type { University } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';

type Hit = { kind: string; id: string; title: string; subtitle: string; lat: number | null; lng: number | null };
type Nav = { dest: Pin; building: string | null; buildingId: string | null; outline: LL[] | null; floor: number | null; room: string | null; route: Route; from: 'me' | 'gate' };

const WEB = Platform.OS === 'web';
/** What a campus is known by: named from far away (colleges, presidency, library, mosque, gates, stadiums). */
const LANDMARK_KINDS = ['library', 'mosque', 'gate', 'sports'];
const LANDMARK_NAME = /كلي[ةه]|رئاس[ةه]|برج|عماد[ةه]|مجمع|مدرج|مكتب[ةه]|مستشفى|المسجد|faculty|college|school of|library|presidency/i;
const landmark = (p: { kind: string; name: string }) => LANDMARK_KINDS.includes(p.kind) || (p.kind === 'building' && LANDMARK_NAME.test(p.name));
const theme = mapTheme();

/**
 * The campus map, all inside the app: a real 3D campus (MapLibre: buildings with height, light and shadow, trees,
 * green areas, paths) built from OpenStreetMap, Microsoft footprints and our own buildings. The web draws it in the
 * page and phones in a web view (Campus3D); a phone whose web view doesn't come up falls back to the platform map with
 * the campus drawn flat. "وديني" walks you there on the campus paths with turn-by-turn directions.
 * Opened with ?building=…&go=1 (&room, &floor) from a lecture, it starts the route by itself.
 */
export default function CampusMap() {
  const { university: mine, profile } = useAuth();
  const params = useLocalSearchParams<{ uni?: string; building?: string; advertiser?: string; lat?: string; lng?: string; name?: string; go?: string; room?: string; floor?: string }>();
  // a place someone shared in a chat ("lat,lng,name"): pinned and opened on arrival
  const shared = useMemo<Pin | null>(() => {
    const la = Number(params.lat), ln = Number(params.lng);
    return params.lat && params.lng && Number.isFinite(la) && Number.isFinite(ln) ? { id: 'shared', kind: 'shared', name: params.name || t('موقع مشارك'), sub: t('من محادثة'), lat: la, lng: ln } : null;
  }, [params.lat, params.lng, params.name]);
  // another university's map: from the switcher, or ?uni=<id> (admin › campus maps). Its buildings and places come from
  // campus_pins (names and points only); the student's own campus reads the tables as before.
  const [picked, setPicked] = useState<University | null>(null);
  const [switching, setSwitching] = useState(false);
  const wanted = picked ? null : params.uni && params.uni !== mine?.id ? params.uni : null;
  const [loaded, setLoaded] = useState<{ id: string; uni: University | null } | null>(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    supabase.from('universities').select('*').eq('id', wanted).maybeSingle()
      .then(({ data }) => { if (live) setLoaded({ id: wanted, uni: (data as University | null) ?? null }); }, () => { if (live) setLoaded({ id: wanted, uni: null }); });
    return () => { live = false; };
  }, [wanted]);
  // undefined while it loads; null on the student's own campus
  const preview = picked ? (picked.id === mine?.id ? null : picked) : !wanted ? null : loaded?.id === wanted ? loaded.uni : undefined;
  const university = preview ?? mine;
  const [shareFor, setShareFor] = useState<Pin | null>(null);
  const flat = useRef<MapView>(null);
  const deep = useRef<Campus3DHandle>(null);
  // the 3D view on phones too; if it isn't drawn within 12 s (an old web view, no GPU), the platform map takes over
  const [ready3d, setReady3d] = useState(WEB);
  const [failed3d, setFailed3d] = useState(false);
  const three = WEB || !failed3d;
  useEffect(() => {
    if (ready3d || failed3d) return;
    const tm = setTimeout(() => setFailed3d(true), 12000);
    return () => clearTimeout(tm);
  }, [ready3d, failed3d]);
  const threeRef = useRef(three);
  useEffect(() => { threeRef.current = three; }, [three]);
  // one camera for whichever map is showing; tilted further in 3D
  const cam = useMemo(() => ({
    animateCamera: (c: { center?: { latitude: number; longitude: number }; zoom?: number; pitch?: number; heading?: number }, o?: { duration?: number }) =>
      threeRef.current ? deep.current?.animateCamera(c, o) : flat.current?.animateCamera(c, o),
    fitToCoordinates: (cs: { latitude: number; longitude: number }[], o: { edgePadding: { top: number; bottom: number; left: number; right: number }; animated: boolean }) =>
      threeRef.current ? deep.current?.fitToCoordinates(cs, o) : flat.current?.fitToCoordinates(cs, o),
    tilt: (deg3d: number, flatDeg: number) => (threeRef.current ? deg3d : flatDeg),
  }), []);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinsState, setPinsState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [campus, setCampus] = useState<CampusData | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState<Pin | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [sat, setSat] = useState(false);
  const [zoom, setZoom] = useState(16);
  const [look, setLook] = useState<{ lat: number; lng: number } | null>(null); // the map's centre after each move
  const mid = useRef<{ lat: number; lng: number } | null>(null);
  const [suggest, setSuggest] = useState(false);
  const [nav, setNav] = useState<Nav | null>(null);
  const [follow, setFollow] = useState(true);
  // virtual walk: the camera walks you along the paths without you moving (the campus tour, or a route preview)
  const [tour, setTour] = useState<{ stops: Pin[]; i: number } | null>(null);
  const [auto, setAuto] = useState(false);
  const [walker, setWalker] = useState<{ lat: number; lng: number } | null>(null);
  const anim = useRef<ReturnType<typeof setInterval> | null>(null);
  const next = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAnim = () => { if (anim.current) clearInterval(anim.current); if (next.current) clearTimeout(next.current); anim.current = null; next.current = null; };
  useEffect(() => stopAnim, []);

  const center = university?.center_lat ? { latitude: university.center_lat, longitude: university.center_lng! } : { latitude: 31.95, longitude: 35.91 }; // Amman, until the university has a campus point

  const loadPins = useCallback(async () => {
    if (!university) { setPinsState('empty'); return; }
    setPinsState('loading');
    try {
      if (preview) {
        const { data, error } = await supabase.rpc('campus_pins', { p_university: university.id });
        if (error) { setPinsState('error'); return; }
        const rows = (data ?? []) as { id: string; kind: string; name_ar: string; name_en: string | null; sub: string | null; lat: number; lng: number; advertiser_id: string | null }[];
        setPins(rows.map((x) => ({ id: x.id, kind: x.kind, name: nm(x), sub: x.sub, lat: x.lat, lng: x.lng, advertiser_id: x.advertiser_id })));
        setPinsState(rows.length ? 'ok' : 'empty');
        return;
      }
      // what this campus showed last time comes up at once, and is all there is without internet
      const kept = keptPins(university.id);
      if (kept?.length) { setPins(kept); setPinsState('ok'); }
      const fresh = await fetchPins(university.id);
      if (!fresh) { if (!kept?.length) setPinsState('error'); return; }
      setPins(fresh);
      setPinsState(fresh.length ? 'ok' : 'empty');
    } catch { if (!keptPins(university.id)?.length) setPinsState('error'); }
  }, [university, preview]);
  useEffect(() => { loadPins(); }, [loadPins]);
  // the 3D campus: only this university's file, kept by the browser between visits
  useEffect(() => {
    if (!university) return;
    let live = true;
    loadCampus(university.id).then((d) => { if (live) setCampus(d); });
    return () => { live = false; };
  }, [university]);

  const near = useMemo(() => pins.filter((p) => distM({ lat: center.latitude, lng: center.longitude }, p) < 3000), [pins, center.latitude, center.longitude]);
  const fitAll = useCallback(() => {
    // the main campus only: colleges in other cities (Al-Balqa has many) would zoom the map out to all of Jordan
    if (near.length < 2) { cam.animateCamera({ center, zoom: 16.4, pitch: cam.tilt(52, 35), heading: cam.tilt(-18, 0) }, { duration: 700 }); return; }
    cam.fitToCoordinates(near.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: 170, bottom: 80, left: 40, right: 40 }, animated: true });
  }, [near, center, cam]);
  const opened = useRef(false);
  useEffect(() => {
    if (!pins.length || opened.current || params.building || params.advertiser || shared) return;
    opened.current = true;
    setTimeout(fitAll, 400);
  }, [pins, fitAll, params.building, params.advertiser, shared]);

  // follow the student's position while the map is open (stopped when leaving)
  const watch = useRef<Location.LocationSubscription | null>(null);
  const startLocation = useCallback(async (ask: boolean) => {
    try {
      let { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted' && ask) ({ status } = await Location.requestForegroundPermissionsAsync());
      if (status !== 'granted') {
        if (ask) Alert.alert(t('الموقع مسكّر'), t('افتح الإعدادات واسمح ليونيميت يوصل لموقعك عشان نوريك الطريق.'), [
          { text: t('لاحقاً'), style: 'cancel' }, { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() },
        ]);
        return false;
      }
      watch.current?.remove();
      // a fix much worse than the last good one (indoors, a jump of the signal) is skipped for 15 s, so the blue dot
      // and the turn-by-turn don't hop between buildings
      let good = { acc: Infinity, at: 0 };
      watch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 3 }, (pos) => {
        const acc = pos.coords.accuracy ?? 30, now = Date.now();
        if (acc > 60 && acc > good.acc * 2.5 && now - good.at < 15000) return;
        if (acc <= 60) good = { acc, at: now };
        setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc });
      });
      return true;
    } catch { return false; }
  }, []);
  useEffect(() => { startLocation(false); return () => { watch.current?.remove(); watch.current = null; }; }, [startLocation]);

  // search: what's on the map answers instantly (names, and kinds like «كشك»), the server adds rooms and nicknames
  const local = useMemo(() => localSearch(pins, q, me ?? mid.current), [pins, q, me]);
  useEffect(() => {
    const tm = setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return; }
      const { data } = await supabase.rpc('campus_search', { q: q.trim(), lim: 12 });
      setHits(((data ?? []) as Hit[]).filter((h) => h.lat != null));
    }, 250);
    return () => clearTimeout(tm);
  }, [q]);
  const results = useMemo(() => {
    const seen = new Set<string>();
    const out: { key: string; pin: Pin; title: string; sub: string }[] = [];
    for (const p of local) { if (seen.has(p.id)) continue; seen.add(p.id); out.push({ key: p.id, pin: p, title: p.name, sub: kindOf(p.kind).label }); }
    for (const h of hits) {
      if (h.kind !== 'room' && h.kind !== 'alias' && seen.has(h.id)) continue;
      seen.add(h.id);
      const kind = h.kind === 'place' ? h.subtitle : h.kind === 'room' || h.kind === 'alias' ? 'building' : h.kind;
      out.push({ key: h.kind + h.id + h.title, pin: { id: h.id, kind, name: h.title, sub: h.subtitle, lat: h.lat!, lng: h.lng! },
        title: h.title, sub: h.kind === 'alias' ? t('لقب لـ {0}', [h.subtitle]) : h.kind === 'place' ? kindOf(h.subtitle).label : h.subtitle || kindOf(kind).label });
    }
    return out.slice(0, 14);
  }, [local, hits]);

  const focus = useCallback((p: Pin) => {
    setSel(p);
    cam.animateCamera({ center: { latitude: p.lat - cam.tilt(0.0003, 0.0006), longitude: p.lng }, zoom: 18, pitch: cam.tilt(55, 40) }, { duration: 800 });
  }, [cam]);
  useEffect(() => { if (shared) { const tm = setTimeout(() => focus(shared), 500); return () => clearTimeout(tm); } }, [shared, focus]);

  // ---------- walking there ----------
  const gate = useMemo(() => near.find((p) => p.kind === 'gate') ?? null, [near]);
  const startNav = useCallback((dest: Pin, extra?: { floor?: number | null; room?: string | null }) => {
    const b = campus ? findBuilding(campus, dest.kind === 'building' ? dest.id : null, dest) : null;
    const fromMe = !!me && distM(me, dest) < 5000;
    const origin = fromMe ? me! : gate ?? { lat: center.latitude, lng: center.longitude };
    const route = walkRoute(campus, [origin.lng, origin.lat], [dest.lng, dest.lat], dest.name, b?.c ?? null);
    stopAnim(); setTour(null); setWalker(null); setSel(null); setFollow(fromMe);
    setNav({ dest, building: b?.n ?? null, buildingId: b?.b ?? (dest.kind === 'building' ? dest.id : null), outline: b?.c ?? null, floor: extra?.floor ?? b?.f ?? null,
      room: extra?.room ?? null, route, from: fromMe ? 'me' : 'gate' });
    cam.fitToCoordinates(route.line.map(([lng, lat]) => ({ latitude: lat, longitude: lng })), { edgePadding: { top: 190, bottom: 330, left: 50, right: 50 }, animated: true });
  }, [campus, me, gate, center, cam]);

  // where I am on the route; off it by more than 35 m → a new route from here (at most every 8 s)
  const live = useMemo(() => (nav && me && nav.from === 'me' ? progress(nav.route, [me.lng, me.lat], me.acc) : null), [nav, me]);
  const lastReroute = useRef(0);
  useEffect(() => {
    if (!nav || !me) return;
    if (nav.from === 'gate' && distM(me, nav.dest) < 5000) { startNav(nav.dest, { floor: nav.floor, room: nav.room }); return; } // location came on: start from me
    if (live?.off && Date.now() - lastReroute.current > 8000) { lastReroute.current = Date.now(); startNav(nav.dest, { floor: nav.floor, room: nav.room }); }
  }, [me, live?.off]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!nav || !me || !follow || walker) return;
    const r = nav.route.line, i = Math.min(r.length - 1, 1);
    const head = (Math.atan2((r[i][0] - me.lng) * Math.cos((me.lat * Math.PI) / 180), r[i][1] - me.lat) * 180) / Math.PI;
    cam.animateCamera({ center: { latitude: me.lat, longitude: me.lng }, zoom: 18.6, pitch: 60, heading: live && live.left > 15 ? head : undefined }, { duration: 600 });
  }, [me, follow, nav, walker]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Walk the little figure along a line, with the camera following like you're there. */
  const walkAlong = useCallback((line: LL[], done?: () => void) => {
    stopAnim();
    const cum = [0];
    for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM({ lat: line[i - 1][1], lng: line[i - 1][0] }, { lat: line[i][1], lng: line[i][0] }));
    const total = cum[cum.length - 1];
    const ms = Math.min(14000, Math.max(1200, total * 16)); // ~60 m a second, so long walks don't drag
    const t0 = Date.now();
    let last = 0, seg = 1;
    anim.current = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / ms);
      const at = total * (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
      while (seg < line.length - 1 && cum[seg] < at) seg++;
      const a = line[seg - 1], b = line[seg], u = cum[seg] > cum[seg - 1] ? (at - cum[seg - 1]) / (cum[seg] - cum[seg - 1]) : 1;
      const p = { lat: a[1] + (b[1] - a[1]) * u, lng: a[0] + (b[0] - a[0]) * u };
      setWalker(p);
      if (Date.now() - last > 280 || k === 1) {
        last = Date.now();
        const head = (Math.atan2((b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180), b[1] - a[1]) * 180) / Math.PI;
        cam.animateCamera({ center: { latitude: p.lat, longitude: p.lng }, zoom: k === 1 ? 18.6 : 18.3, pitch: 62, heading: head }, { duration: k === 1 ? 700 : 300 });
      }
      if (k === 1) { if (anim.current) clearInterval(anim.current); anim.current = null; done?.(); }
    }, 50);
  }, [cam]);

  const tourLine = useCallback((stops: Pin[], i: number, from?: { lat: number; lng: number } | null) => {
    const a = from ?? stops[i - 1] ?? stops[i], b = stops[i];
    return walkRoute(campus, [a.lng, a.lat], [b.lng, b.lat], b.name).line;
  }, [campus]);

  const startTour = useCallback(() => {
    const pool = near.filter((p) => TOUR_KINDS.includes(p.kind));
    if (pool.length < 2) { Alert.alert(t('ما في أماكن كفاية'), t('لسا ما عنا أماكن كفاية بهاي الجامعة لجولة.')); return; }
    // start at a gate (or the southern-most place) and always go to the closest place not seen yet
    const left = [...pool];
    let cur: Pin | undefined = left.find((p) => p.kind === 'gate') ?? left.reduce((m, p) => (p.lat < m.lat ? p : m));
    const order: Pin[] = [];
    while (cur && order.length < 30) {
      order.push(cur);
      const c0: Pin = cur;
      // drop anything right next to this stop (a gate and the gate building, say)
      for (let j = left.length - 1; j >= 0; j--) if (left[j] === c0 || distM(c0, left[j]) < 35) left.splice(j, 1);
      cur = left.reduce<Pin | undefined>((m, p) => (!m || distM(c0, p) < distM(c0, m) ? p : m), undefined);
    }
    setSel(null); setNav(null); setAuto(true);
    setTour({ stops: order, i: 0 });
    setWalker({ lat: order[0].lat, lng: order[0].lng });
    cam.animateCamera({ center: { latitude: order[0].lat, longitude: order[0].lng }, zoom: 18.4, pitch: 62 }, { duration: 900 });
  }, [near, cam]);

  const go = useCallback((i: number) => {
    if (!tour || i < 0 || i >= tour.stops.length) return;
    setTour({ ...tour, i });
    walkAlong(tourLine(tour.stops, i, walker));
  }, [tour, walker, walkAlong, tourLine]);
  const endTour = useCallback(() => { stopAnim(); setTour(null); setAuto(false); setWalker(null); setTimeout(fitAll, 200); }, [fitAll]);

  // auto-play: wait at each stop for a moment, then walk on
  useEffect(() => {
    if (!tour || !auto) return;
    if (tour.i >= tour.stops.length - 1) { setAuto(false); return; }
    const d = tour.i === 0 ? 0 : distM(tour.stops[tour.i - 1], tour.stops[tour.i]);
    next.current = setTimeout(() => go(tour.i + 1), Math.min(14000, Math.max(1200, d * 20)) + 2600);
    return () => { if (next.current) clearTimeout(next.current); };
  }, [tour, auto, go]);

  // opened from a lecture, a search result or a shop page: show it (and with go=1, start walking there)
  const handled = useRef('');
  useEffect(() => {
    const key = `${params.building}|${params.advertiser}|${params.go}`;
    if (!(params.building || params.advertiser) || !pins.length || handled.current === key) return;
    const p = pins.find((x) => (params.building && x.id === params.building) || (params.advertiser && x.advertiser_id === params.advertiser));
    if (!p) return;
    if (params.go === '1' && !campus && university) return; // wait for the campus paths so the first route is the real one
    handled.current = key;
    if (params.go === '1') startNav(p, { floor: params.floor ? Number(params.floor) : null, room: params.room || null });
    else focus(p);
  }, [params.building, params.advertiser, params.go, params.floor, params.room, pins, campus, university, startNav, focus]);
  // the campus file never arrives (no file for this university yet): don't wait for it forever
  useEffect(() => {
    if (params.go !== '1' || campus) return;
    const tm = setTimeout(() => setCampus((c) => c ?? { v: 0, at: '', bbox: [0, 0, 0, 0], center: [center.longitude, center.latitude], campus: null, buildings: [], green: [], parking: [], paths: [], trees: [] }), 6000);
    return () => clearTimeout(tm);
  }, [params.go, campus, center.latitude, center.longitude]);

  // zoomed out, only the big landmarks; parking, bus stops and ATMs appear as you zoom in (or pick their filter)
  // every building on campus has a name: ours from the tables, the rest from the 3D file («مبنى قرب …»), those only
  // once you're close and around where you look, so a big campus doesn't put thousands of labels on the map
  const filePins = useMemo<Pin[]>(() => (campus?.buildings ?? []).flatMap((b, i) => {
    if (!b.l || !b.n) return [];
    const [lng, lat] = centroid(b.c);
    return [{ id: `f${i}`, kind: 'building', name: b.n, lat, lng }];
  }), [campus]);
  const listed = useMemo(() => {
    const near = zoom > 17.2 && look && (filter === 'all' || filter === 'building') ? filePins.filter((p) => distM(look, p) < 260) : [];
    return [...pins.filter((p) => inGroup(filter, p.kind) && (filter !== 'all' || zoom > 16.9 || !MINOR.includes(p.kind))), ...near];
  }, [pins, filePins, filter, zoom, look]);
  // phones: the platform map has no collision handling, so place markers by importance on their real screen positions
  // and leave out any that would sit on one already placed (the web map does this itself)
  const [fits, setFits] = useState<Set<string> | null>(null);
  const region = useRef(0);
  const placeMarkers = useCallback(async () => {
    if (three || !flat.current) return;
    const turn = ++region.current;
    const rank = (p: Pin) => (p.id === sel?.id ? 0 : landmark(p) ? 1 : p.kind === 'building' ? 2 : MINOR.includes(p.kind) ? 4 : 3);
    const order = [...listed].sort((a, b) => rank(a) - rank(b)).slice(0, 220);
    const pts = await Promise.all(order.map((p) => flat.current!.pointForCoordinate({ latitude: p.lat, longitude: p.lng }).catch(() => null)));
    if (turn !== region.current) return;
    const boxes: [number, number, number, number][] = [];
    const keep = new Set<string>();
    order.forEach((p, i) => {
      const pt = pts[i];
      if (!pt) return;
      const w = (landmark(p) && zoom > 15.2) || (p.kind === 'building' && zoom > 16.6) ? 120 : 36, h = 36;
      const b: [number, number, number, number] = [pt.x - w / 2, pt.y - h / 2, pt.x + w / 2, pt.y + h / 2];
      if (p.id !== sel?.id && boxes.some((o) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1])) return;
      boxes.push(b); keep.add(p.id);
    });
    setFits(keep);
  }, [listed, sel?.id, zoom, three]);
  useEffect(() => { placeMarkers(); }, [placeMarkers]);
  const shown = three || !fits ? listed : listed.filter((p) => fits.has(p.id));
  const highlight = nav?.buildingId ?? (sel ? (sel.kind === 'building' ? sel.id : campus ? findBuilding(campus, null, sel)?.b ?? null : null) : null);
  const meters = sel && me ? Math.round(distM(me, sel) * 1.25) : null; // paths are ~25% longer than a straight line
  const walkMin = meters != null ? Math.max(1, Math.round(meters / 75)) : null;
  const busy = !!(nav || tour || suggest);
  const pressBuilding = (b: { b: string | null; n: string | null; at: { latitude: number; longitude: number } }) => {
    if (busy) return;
    const p = (b.b && pins.find((x) => x.id === b.b)) || { id: b.b ?? `osm-${b.at.latitude}`, kind: 'building', name: b.n ?? t('مبنى'), lat: b.at.latitude, lng: b.at.longitude };
    focus(p);
  };
  const pressPin = (id: string) => {
    const p = id === 'shared' ? shared : shown.find((x) => x.id === id);
    if (p) focus(p);
  };
  // a finger on the map while walking: the camera stops riding along, and «إعادة التوسط» brings it back
  const handMoved = useCallback(() => { setFollow((f) => (f ? false : f)); }, []);
  // the phone's 3D view without internet asks for the campus copy kept on the phone
  const campusRef = useRef(campus);
  useEffect(() => { campusRef.current = campus; }, [campus]);
  const keptCampus = useCallback(async () => campusRef.current, []);
  const onRegion = (r: { latitude: number; longitude: number; longitudeDelta: number; zoom?: number }) => {
    setZoom(r.zoom ?? Math.log2(360 / r.longitudeDelta));
    mid.current = { lat: r.latitude, lng: r.longitude };
    setLook(mid.current);
    placeMarkers();
  };
  // what goes on the map, as data: the same list draws on the platform map and in the 3D view
  const markers = useMemo<MarkerSpec[]>(() => {
    const out: MarkerSpec[] = [];
    if (!nav) for (const p of shown) {
      const on = sel?.id === p.id;
      // a drawn campus: a building is its own shape, just its name once you're close
      const bare = !!campus && p.kind === 'building' && !on;
      const label = on || (landmark(p) ? zoom > 15.2 : p.kind === 'building' ? zoom > 16.6 : zoom > 17.6);
      if (bare && !label) continue;
      out.push({ t: 'pin', key: p.id + (on ? '-on' : '') + (label ? '-l' : ''), id: p.id, kind: p.kind, name: p.name, lat: p.lat, lng: p.lng, on, label, bare,
        small: MINOR.includes(p.kind) && !on, priority: on ? 100 : landmark(p) ? 80 : p.kind === 'building' ? 60 : MINOR.includes(p.kind) ? 20 : 40 });
    }
    if (shared) out.push({ t: 'shared', key: 'shared', lat: shared.lat, lng: shared.lng });
    if (nav) { const [lng, lat] = nav.route.line[nav.route.line.length - 1]; out.push({ t: 'dest', key: 'dest', name: nav.dest.name, lat, lng }); }
    if (walker) out.push({ t: 'walker', key: 'walker', lat: walker.lat, lng: walker.lng });
    if (three && me && !walker) out.push({ t: 'me', key: 'me', lat: me.lat, lng: me.lng }); // the platform map draws its own
    return out;
  }, [nav, shown, sel?.id, campus, zoom, shared, walker, me, three]);
  // the phone's 3D view reads the app's look and language from its own storage, set before it starts
  const prefs = useMemo(() => `try{localStorage.setItem('theme',${JSON.stringify(getPref('theme') ?? '')});localStorage.setItem('lang',${JSON.stringify(getPref('lang') ?? '')})}catch(e){};true;`, []);

  if (preview === undefined) return <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.primary} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, overflow: 'hidden' }}>
      {three ? (
        <View key={university?.id ?? 'none'} style={{ flex: 1 }}>
          <Map3D ref={deep} theme={theme} center={center} highlight={highlight} route={nav?.route.line ?? null} sat={sat} markers={markers}
            onPin={pressPin} onBuilding={pressBuilding} onRegion={onRegion} onPanDrag={handMoved} onTap={() => Keyboard.dismiss()} onReady={() => setReady3d(true)}
            getCampus={keptCampus}
            {...(WEB ? { campus } : { file: campus ? `${CAMPUS_BASE}/${university?.id}.json?v=${encodeURIComponent(campus.at)}` : null,
              dom: { style: { flex: 1 }, injectedJavaScriptBeforeContentLoaded: prefs } })} />
        </View>
      ) : (
        <MapView key={university?.id ?? 'none'} ref={flat} provider={PROVIDER_DEFAULT} style={{ flex: 1 }} showsUserLocation showsCompass={false} showsPointsOfInterests={false} showsBuildings pitchEnabled rotateEnabled
          mapType={sat ? (Platform.OS === 'ios' ? 'hybridFlyover' : 'hybrid') : Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
          initialCamera={{ center, zoom: 16, heading: 0, pitch: 35 }} onPress={() => { Keyboard.dismiss(); }} onPanDrag={handMoved} onRegionChangeComplete={onRegion}>
          {campus && <NativeCampus campus={campus} theme={theme} zoom={zoom} highlight={highlight} onBuildingPress={pressBuilding} />}
          <MapMarkers specs={markers} onPin={pressPin} />
          {nav && <Polyline coordinates={nav.route.line.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))} strokeColor="#FFFFFF" strokeWidth={9} />}
          {nav && <Polyline coordinates={nav.route.line.map(([lng, lat]) => ({ latitude: lat, longitude: lng }))} strokeColor={C.primary} strokeWidth={5} />}
        </MapView>
      )}

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 10 }} pointerEvents="box-none">
        <Row gap={8} style={{ marginTop: 6 }}>
          <Tap onPress={() => (nav ? setNav(null) : goBack('/'))} accessibilityLabel={t('رجوع')}
            style={[{ width: 52, height: 52, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <ChevronRight size={22} color={C.ink} style={flip} />
          </Tap>
          {nav ? (
            <View style={{ flex: 1 }}>
              <DirectionBanner step={live?.next ?? nav.route.steps[Math.min(1, nav.route.steps.length - 1)]} toNext={live?.toNext ?? nav.route.steps[Math.min(1, nav.route.steps.length - 1)].at} from={nav.from} />
            </View>
          ) : (
            <Row gap={8} style={[{ flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: C.card, paddingHorizontal: 16 }, shadow]}>
              <Search size={20} color={C.muted} />
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث: كلية، مبنى، قاعة، مطعم، كشك، باص…')} placeholderTextColor={C.faint}
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta, minHeight: 48 }} accessibilityLabel={t('ابحث بالخريطة')} />
              {q ? <Tap onPress={() => setQ('')} accessibilityLabel={t('مسح')}><X size={18} color={C.muted} /></Tap> : null}
            </Row>
          )}
        </Row>
        {!nav && (results.length > 0 ? (
          <Animated.View entering={FadeIn} style={[{ backgroundColor: C.card, borderRadius: 18, maxHeight: 320 }, shadow]}>
            <FlatList data={results} keyExtractor={(h) => h.key} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const k = kindOf(item.pin.kind);
                return (
                  <Tap onPress={() => { setQ(''); setHits([]); Keyboard.dismiss(); focus(item.pin); }}
                    style={{ minHeight: 56, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: C.line }}>
                    <GlyphTile icon={k.icon} colors={k.g} size={32} />
                    <View style={{ flex: 1 }}>
                      <T v="bodyMd" numberOfLines={1}>{item.title}</T>
                      {item.sub ? <T v="tiny" color={C.muted} numberOfLines={1}>{item.sub}</T> : null}
                    </View>
                  </Tap>
                );
              }} />
          </Animated.View>
        ) : q.trim().length < 2 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.filter((f) => f.key === 'all' || pins.some((p) => inGroup(f.key, p.kind))).map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} style={shadow} />)}
          </ScrollView>
        ))}
        {!nav && q.trim().length < 2 && !!campus?.branches?.length && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            <Chip label={t('الحرم الرئيسي')} onPress={fitAll} style={shadow} />
            {campus.branches.map((b) => (
              <Chip key={b.n} label={b.n} style={shadow}
                onPress={() => cam.animateCamera({ center: { latitude: b.c[1], longitude: b.c[0] }, zoom: 16.6, pitch: cam.tilt(52, 35) }, { duration: 900 })} />
            ))}
          </ScrollView>
        )}
        {preview && (
          <Tap onPress={() => setSwitching(true)} accessibilityLabel={t('غيّر الجامعة')}
            style={[{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, backgroundColor: C.primary, borderRadius: 999, paddingHorizontal: 12 }, shadow]}>
            <School size={15} color={C.onPrimary} />
            <T v="tiny" color={C.onPrimary}>{t('بتتصفّح خريطة {0}', [nm(preview)])}</T>
          </Tap>
        )}
      </SafeAreaView>

      <UniSwitcher open={switching} onClose={() => setSwitching(false)} current={university?.id ?? null} mine={mine?.id ?? null}
        onPick={(u) => { if (u.id === university?.id) return; stopAnim(); setTour(null); setWalker(null); setSuggest(false); setSel(null); setNav(null); setQ(''); setFilter('all'); setCampus(null); setPins([]); opened.current = false; setPicked(u); }} />

      {suggest && university && <SuggestPlace universityId={university.id} userId={profile?.id} at={() => mid.current ?? { lat: center.latitude, lng: center.longitude }} onClose={() => setSuggest(false)} />}

      {!sel && !busy && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}>
          <T v="tiny" color={C.muted} style={{ fontSize: 10, backgroundColor: C.glass, paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden' }}>{t('الخريطة من OpenStreetMap و Microsoft')}</T>
        </View>
      )}

      {!sel && !busy && pinsState === 'ok' && near.filter((p) => TOUR_KINDS.includes(p.kind)).length > 1 && (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: 40 }}>
          <Tap onPress={startTour} accessibilityLabel={t('تمشّى بالجامعة')}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 18, borderRadius: 26, backgroundColor: C.primary }, shadow]}>
            <Footprints size={20} color={C.onPrimary} />
            <T v="bold" color={C.onPrimary}>{t('تمشّى بالجامعة')}</T>
          </Tap>
        </View>
      )}

      {!sel && !busy && (
        <View style={{ position: 'absolute', left: 16, bottom: 40, gap: 10 }}>
          <Tap onPress={() => setSat((x) => !x)} accessibilityLabel={sat ? t('الخريطة المرسومة') : t('صور الأقمار الصناعية')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: sat ? C.inverse : C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Layers size={21} color={sat ? C.onInverse : C.ink} />
          </Tap>
          {!preview && (
            <Tap onPress={() => setSuggest(true)} accessibilityLabel={t('اقترح مكان ناقص')}
              style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
              <MapPinPlus size={21} color={C.ink} />
            </Tap>
          )}
          <Tap onPress={() => setSwitching(true)} accessibilityLabel={t('خرائط الجامعات')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: preview ? C.primary : C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <School size={21} color={preview ? C.onPrimary : C.ink} />
          </Tap>
          <Tap onPress={fitAll} accessibilityLabel={t('شوف الجامعة كاملة')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Maximize2 size={20} color={C.ink} />
          </Tap>
          {me && (
            <Tap onPress={() => cam.animateCamera({ center: { latitude: me.lat, longitude: me.lng }, zoom: 17.8 }, { duration: 600 })} accessibilityLabel={t('موقعي')}
              style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
              <Crosshair size={22} color={C.primary} />
            </Tap>
          )}
        </View>
      )}

      {!sel && !busy && pinsState !== 'ok' && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: 104, alignItems: 'center' }}>
          <View style={[{ backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 340 }, shadow]}>
            {pinsState === 'loading' ? <ActivityIndicator color={C.primary} /> : null}
            <T v="small" style={{ flexShrink: 1 }} color={pinsState === 'error' ? C.red : C.ink2}>
              {pinsState === 'loading' ? t('عم نحمّل أماكن الجامعة…') : pinsState === 'error' ? t('ما قدرنا نحمّل الأماكن، تأكد من الإنترنت.') : t('أماكن جامعتك بتنضاف قريباً.')}
            </T>
            {pinsState === 'error' && <Tap onPress={loadPins} style={{ paddingHorizontal: 8 }}><T v="small" color={C.primary} style={{ fontFamily: F.bodyBold }}>{t('جرّب كمان مرة')}</T></Tap>}
          </View>
        </View>
      )}

      {tour && (() => {
        const s = tour.stops[tour.i];
        const prev = tour.stops[tour.i - 1];
        const k = kindOf(s.kind);
        const m = prev ? Math.round(distM(prev, s) * 1.25) : null;
        const btn = { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' } as const;
        return (
          <Animated.View entering={SlideInDown.duration(240)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 30, padding: 16, paddingTop: 10, gap: 12 }, shadow]}>
            <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
            <Row gap={12}>
              <GlyphTile icon={k.icon} colors={k.g} size={50} />
              <View style={{ flex: 1 }}>
                <T v="tiny" color={C.primary}>{t('المحطة {0} من {1}', [String(tour.i + 1), String(tour.stops.length)])}</T>
                <T v="h2" numberOfLines={2}>{s.name}</T>
                <T v="small" color={C.muted}>{m != null ? t('{0} · {1} متر من {2}', [k.label, String(m), prev!.name]) : k.label}</T>
              </View>
              <Tap onPress={endTour} accessibilityLabel={t('إنهاء الجولة')}><X size={22} color={C.muted} /></Tap>
            </Row>
            <Row gap={10} style={{ justifyContent: 'center' }}>
              <Tap onPress={() => { setAuto(false); go(tour.i - 1); }} disabled={tour.i === 0} accessibilityLabel={t('اللي قبل')} style={[btn, { backgroundColor: C.soft, opacity: tour.i === 0 ? 0.4 : 1 }]}>
                <SkipBack size={20} color={C.ink} style={flip} />
              </Tap>
              <Tap onPress={() => { if (!auto && tour.i >= tour.stops.length - 1) { setAuto(true); go(0); } else setAuto((x) => !x); }} accessibilityLabel={auto ? t('وقّف') : t('كمّل')} style={[btn, { width: 62, height: 62, borderRadius: 31, backgroundColor: C.primary }]}>
                {auto ? <Pause size={24} color={C.onPrimary} fill={C.white} /> : <Play size={24} color={C.onPrimary} fill={C.white} />}
              </Tap>
              <Tap onPress={() => { setAuto(false); go(tour.i + 1); }} disabled={tour.i >= tour.stops.length - 1} accessibilityLabel={t('اللي بعد')} style={[btn, { backgroundColor: C.soft, opacity: tour.i >= tour.stops.length - 1 ? 0.4 : 1 }]}>
                <SkipForward size={20} color={C.ink} style={flip} />
              </Tap>
              <Tap onPress={() => { endTour(); startNav(s); }} accessibilityLabel={t('وديني لهون')} style={[btn, { width: undefined, paddingHorizontal: 14, flexDirection: 'row', gap: 6, backgroundColor: C.primarySoft }]}>
                <Navigation size={18} color={C.primary} /><T v="small" color={C.primary}>{t('وديني')}</T>
              </Tap>
            </Row>
          </Animated.View>
        );
      })()}

      {nav && !tour && (
        <NavCard name={nav.dest.name} kind={nav.dest.kind} building={nav.building} floor={nav.floor} room={nav.room}
          left={live?.left ?? nav.route.meters} minutes={live?.minutes ?? nav.route.minutes} straight={nav.route.straight}
          following={nav.from === 'me' ? follow : null} onRecenter={() => setFollow(true)}
          onPreview={() => { setFollow(false); walkAlong(nav.route.line, () => setTimeout(() => setWalker(null), 1500)); }}
          onEnd={() => { stopAnim(); setWalker(null); setNav(null); }} />
      )}

      {sel && !busy && (
        <Animated.View entering={SlideInDown.duration(240)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 30, padding: 18, paddingTop: 10, gap: 12 }, shadow]}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <Row gap={12}>
            <GlyphTile icon={kindOf(sel.kind).icon} colors={kindOf(sel.kind).g} size={56} pop />
            <View style={{ flex: 1 }}>
              <T v="h2">{sel.name}</T>
              <T v="small" color={C.muted}>{sel.sub ? `${kindOf(sel.kind).label} · ${sel.sub}` : kindOf(sel.kind).label}</T>
            </View>
            <Tap onPress={() => setSel(null)} accessibilityLabel={t('إغلاق')}><X size={22} color={C.muted} /></Tap>
          </Row>
          {walkMin != null && (
            <Row gap={10}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.primarySoft, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }} color={C.primary}>{walkMin}</T><T v="tiny" color={C.ink2}>{t('دقايق مشي (تقريباً)')}</T>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.bg, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }}>{meters}</T><T v="tiny" color={C.ink2}>{t('متر')}</T>
              </View>
            </Row>
          )}
          <Row gap={8}>
            <Tap onPress={() => setShareFor(sel)} accessibilityLabel={t('شارك بالمحادثة')}
              style={{ flex: 1, flexDirection: 'row', gap: 8, minHeight: 46, borderRadius: 16, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Send size={17} color={C.ink} style={flip ? undefined : { transform: [{ scaleX: -1 }] }} />
              <T v="bodyMd">{t('شارك بالمحادثة')}</T>
            </Tap>
            {sel.advertiser_id && (
              <Tap onPress={() => router.push({ pathname: '/advertiser/[id]', params: { id: sel.advertiser_id! } })}
                style={{ flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
                <T v="bodyMd">{t('صفحة المحل')}</T>
              </Tap>
            )}
          </Row>
          <Button title={t('وديني')} icon={<Navigation size={19} color={C.onPrimary} />}
            onPress={async () => { if (!me) await startLocation(true); startNav(sel); }} />
        </Animated.View>
      )}
      <ShareToChat place={shareFor} onClose={() => setShareFor(null)} />
    </View>
  );
}
