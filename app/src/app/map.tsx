import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import {
  BookOpen, Building2, MapPinPlus, Banknote, Bus, Car, ChevronRight, Coffee, Crosshair, DoorOpen, ExternalLink, Footprints, Landmark, Layers, MapPin, Maximize2, Moon, Navigation,
  Pause, Pill, Play, Printer, Rotate3d, Search, ShoppingBag, SkipBack, SkipForward, Stethoscope, Store, Trees, Trophy, UtensilsCrossed, X, type LucideIcon,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Keyboard, Linking, Platform, ScrollView, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlyphTile, GRAD } from '@/components/Glyph';
import { Button, Chip, Field, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import { flip, nm, t, ta } from '@/lib/i18n';

type Pin = { id: string; kind: string; name: string; sub?: string | null; lat: number; lng: number; advertiser_id?: string | null };
type Hit = { kind: string; id: string; title: string; subtitle: string; lat: number | null; lng: number | null };

type G = readonly [string, string];
const KIND: Record<string, { icon: LucideIcon; g: G; label: string }> = {
  building: { icon: Building2, g: GRAD.blue, label: t('مبنى') },
  cafeteria: { icon: Coffee, g: GRAD.orange, label: t('كافتيريا') },
  restaurant: { icon: UtensilsCrossed, g: GRAD.orange, label: t('مطعم') },
  kiosk: { icon: Store, g: GRAD.yellow, label: t('كشك') },
  shop: { icon: ShoppingBag, g: GRAD.yellow, label: t('محل') },
  print: { icon: Printer, g: GRAD.yellow, label: t('طباعة وقرطاسية') },
  parking: { icon: Car, g: GRAD.slate, label: t('موقف سيارات') },
  bus: { icon: Bus, g: GRAD.teal, label: t('موقف باص') },
  gate: { icon: DoorOpen, g: GRAD.indigo, label: t('بوابة') },
  mosque: { icon: Moon, g: GRAD.green, label: t('مسجد') },
  library: { icon: BookOpen, g: GRAD.violet, label: t('مكتبة') },
  bank: { icon: Landmark, g: GRAD.green, label: t('بنك') },
  atm: { icon: Banknote, g: GRAD.green, label: t('صراف آلي') },
  clinic: { icon: Stethoscope, g: GRAD.red, label: t('عيادة') },
  pharmacy: { icon: Pill, g: GRAD.red, label: t('صيدلية') },
  sports: { icon: Trophy, g: GRAD.pink, label: t('رياضة') },
  garden: { icon: Trees, g: GRAD.green, label: t('حديقة') },
};
const kindOf = (k: string) => KIND[k] ?? { icon: MapPin, g: GRAD.green, label: t('خدمة') };

const GROUPS: Record<string, string[]> = {
  building: ['building'], food: ['cafeteria', 'restaurant'], shops: ['kiosk', 'shop', 'print'], parking: ['parking'], bus: ['bus'],
};
const FILTERS = [
  { key: 'all', label: t('الكل') },
  { key: 'building', label: t('المباني') },
  { key: 'food', label: t('أكل وقهوة') },
  { key: 'shops', label: t('أكشاك ومحلات') },
  { key: 'parking', label: t('مواقف') },
  { key: 'bus', label: t('باصات') },
  { key: 'service', label: t('خدمات') },
] as const;
const inGroup = (f: string, k: string) => f === 'all' || (f === 'service' ? !Object.values(GROUPS).flat().includes(k) : (GROUPS[f] ?? []).includes(k));
// what a virtual walk stops at: the places people actually look for, not every parking lot
const MINOR = ['parking', 'bus', 'atm', 'shop', 'service', 'room', 'lab', 'other'];
const TOUR_KINDS = ['gate', 'building', 'library', 'cafeteria', 'restaurant', 'kiosk', 'mosque', 'sports', 'garden', 'clinic', 'bank'];
const streetView = (p: { lat: number; lng: number }) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${p.lat},${p.lng}`;

function bearing(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function CampusMap() {
  const { university, profile } = useAuth();
  const params = useLocalSearchParams<{ building?: string; advertiser?: string }>();
  const map = useRef<MapView>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [pinsState, setPinsState] = useState<'loading' | 'ok' | 'empty' | 'error'>('loading');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState<Pin | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [routing, setRouting] = useState(false);
  const [sat, setSat] = useState(false);
  const [zoom, setZoom] = useState(16);
  const mid = useRef<{ lat: number; lng: number } | null>(null);
  // "suggest a place": move the map under the pin, name it, and the team approves it
  const [suggest, setSuggest] = useState<'pin' | 'form' | null>(null);
  const [sName, setSName] = useState(''); const [sKind, setSKind] = useState('cafeteria'); const [sDesc, setSDesc] = useState('');
  const [sBusy, setSBusy] = useState(false);
  async function sendSuggestion() {
    if (!university || !mid.current || sBusy) return;
    if (sName.trim().length < 2) { Alert.alert(t('اكتب اسم المكان')); return; }
    setSBusy(true);
    const { error } = await supabase.from('places').insert({ university_id: university.id, kind: sKind, name_ar: sName.trim(), description: sDesc.trim() || null, lat: mid.current.lat, lng: mid.current.lng, state: 'pending', created_by: profile?.id });
    setSBusy(false);
    if (error) { Alert.alert(t('ما انبعت'), t('جرّب كمان مرة.')); return; }
    setSuggest(null); setSName(''); setSDesc('');
    Alert.alert(t('شكراً! ✓'), t('وصلنا اقتراحك، وبيطلع على الخريطة لكل طلاب جامعتك بعد ما نراجعه.'));
  }
  // virtual walk: the camera walks you from stop to stop without you moving
  const [tour, setTour] = useState<{ stops: Pin[]; i: number; walk?: boolean } | null>(null);
  const [auto, setAuto] = useState(false);
  const [walker, setWalker] = useState<{ lat: number; lng: number } | null>(null);
  const [trail, setTrail] = useState<{ latitude: number; longitude: number }[]>([]);
  const anim = useRef<ReturnType<typeof setInterval> | null>(null);
  const next = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopAnim = () => { if (anim.current) clearInterval(anim.current); if (next.current) clearTimeout(next.current); anim.current = null; next.current = null; };
  useEffect(() => stopAnim, []);

  useEffect(() => {
    if (!university) return;
    (async () => {
      setPinsState('loading');
      const [{ data: b, error: be }, { data: p, error: pe }] = await Promise.all([
        supabase.from('buildings').select('id, name_ar, name_en, code, lat, lng').eq('university_id', university.id).not('lat', 'is', null),
        supabase.from('places').select('id, kind, name_ar, name_en, description, lat, lng, advertiser_id').eq('university_id', university.id).eq('state', 'approved'),
      ]);
      if (be || pe) { setPinsState('error'); return; }
      setPinsState(((b ?? []).length + (p ?? []).length) ? 'ok' : 'empty');
      setPins([
        ...(b ?? []).map((x) => ({ id: x.id, kind: 'building', name: nm(x), sub: x.code, lat: x.lat!, lng: x.lng! })),
        ...(p ?? []).map((x) => ({ id: x.id, kind: x.kind, name: nm(x), sub: x.description, lat: x.lat, lng: x.lng, advertiser_id: x.advertiser_id })),
      ]);
    })();
  }, [university]);

  const fitAll = useCallback(() => {
    // the main campus only: colleges in other cities (Al-Balqa has many) would zoom the map out to all of Jordan
    const c = university?.center_lat ? { lat: university.center_lat, lng: university.center_lng! } : null;
    const near = c ? pins.filter((p) => distM(c, p) < 3000) : pins;
    if (near.length < 2) return;
    map.current?.fitToCoordinates(near.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: 170, bottom: 80, left: 40, right: 40 }, animated: true });
  }, [pins, university]);
  useEffect(() => { if (pins.length && !params.building && !params.advertiser) setTimeout(fitAll, 400); }, [pins, fitAll, params.building, params.advertiser]);

  useEffect(() => {
    if ((params.building || params.advertiser) && pins.length) {
      const p = pins.find((x) => (params.building && x.id === params.building) || (params.advertiser && x.advertiser_id === params.advertiser));
      if (p) focus(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.building, params.advertiser, pins]);

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
      watch.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 8 }, (pos) => setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude }));
      return true;
    } catch { return false; }
  }, []);
  useEffect(() => { startLocation(false); return () => { watch.current?.remove(); watch.current = null; }; }, [startLocation]);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setHits([]); return; }
      const { data } = await supabase.rpc('campus_search', { q: q.trim(), lim: 12 });
      setHits(((data ?? []) as Hit[]).filter((h) => h.lat != null));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const focus = useCallback((p: Pin) => {
    setSel(p); setRouting(false);
    map.current?.animateCamera({ center: { latitude: p.lat - 0.0006, longitude: p.lng }, zoom: 18, pitch: 40 }, { duration: 700 });
  }, []);

  // zoomed out, only the big landmarks; parking, bus stops and ATMs appear as you zoom in (or pick their filter)
  const shown = useMemo(() => pins.filter((p) => inGroup(filter, p.kind) && (filter !== 'all' || zoom > 16.9 || !MINOR.includes(p.kind))), [pins, filter, zoom]);

  /** Walk the little figure from where it is to stop i, with the camera following like you're there. */
  const walkTo = useCallback((stops: Pin[], i: number, from?: { lat: number; lng: number } | null) => {
    stopAnim();
    const to = stops[i];
    const a = from ?? stops[i - 1] ?? to;
    const d = distM(a, to);
    const head = d > 3 ? bearing(a, to) : 0;
    const total = Math.min(6000, Math.max(900, d * 14)); // ~70 m a second, so long walks don't drag
    const t0 = Date.now();
    if (i === 0 || !from) setTrail([{ latitude: a.lat, longitude: a.lng }]);
    let last = 0;
    anim.current = setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / total);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const p = { lat: a.lat + (to.lat - a.lat) * e, lng: a.lng + (to.lng - a.lng) * e };
      setWalker(p);
      if (Date.now() - last > 280 || k === 1) {
        last = Date.now();
        setTrail((tr) => [...tr.slice(-200), { latitude: p.lat, longitude: p.lng }]);
        map.current?.animateCamera({ center: { latitude: p.lat, longitude: p.lng }, zoom: k === 1 ? 18.6 : 18.2, pitch: 62, heading: head }, { duration: k === 1 ? 700 : 300 });
      }
      if (k === 1) { if (anim.current) clearInterval(anim.current); anim.current = null; }
    }, 50);
  }, []);

  const startTour = useCallback(() => {
    const c = university?.center_lat ? { lat: university.center_lat, lng: university.center_lng! } : null;
    const pool = pins.filter((p) => TOUR_KINDS.includes(p.kind) && (!c || distM(c, p) < 3000));
    if (pool.length < 2) { Alert.alert(t('ما في أماكن كفاية'), t('لسا ما عنا أماكن كفاية بهاي الجامعة لجولة.')); return; }
    // start at a gate (or the southern-most place) and always go to the closest place not seen yet
    const left = [...pool];
    let cur = left.find((p) => p.kind === 'gate') ?? left.reduce((m, p) => (p.lat < m.lat ? p : m));
    const order: Pin[] = [];
    while (cur && order.length < 30) {
      order.push(cur);
      const c0: Pin = cur;
      // drop anything right next to this stop (a gate and the gate building, say)
      for (let j = left.length - 1; j >= 0; j--) if (left[j] === c0 || distM(c0, left[j]) < 35) left.splice(j, 1);
      const c: Pin = cur;
      cur = left.reduce<Pin | undefined>((m, p) => (!m || distM(c, p) < distM(c, m) ? p : m), undefined)!;
    }
    setSel(null); setRouting(false); setSat(true); setAuto(true);
    setTour({ stops: order, i: 0 });
    walkTo(order, 0, order[0]);
  }, [pins, walkTo, university]);

  const walkHere = useCallback((dest: Pin) => {
    const gate = pins.find((p) => p.kind === 'gate');
    const start: Pin = me ? { id: 'me', kind: 'me', name: t('مكانك'), lat: me.lat, lng: me.lng } : gate ?? pins.reduce((m, p) => (p.lat < m.lat ? p : m), pins[0]);
    const stops = [start, dest];
    setSel(null); setRouting(false); setSat(true); setAuto(false);
    setTour({ stops, i: 1, walk: true });
    setTrail([{ latitude: start.lat, longitude: start.lng }]);
    walkTo(stops, 1, start);
  }, [pins, me, walkTo]);

  const go = useCallback((i: number) => {
    if (!tour || i < 0 || i >= tour.stops.length) return;
    setTour({ ...tour, i });
    walkTo(tour.stops, i, walker);
  }, [tour, walker, walkTo]);

  const endTour = useCallback(() => { stopAnim(); setTour(null); setAuto(false); setWalker(null); setTrail([]); setSat(false); setTimeout(fitAll, 200); }, [fitAll]);

  // auto-play: wait at each stop for a moment, then walk on
  useEffect(() => {
    if (!tour || !auto || tour.walk) return;
    if (tour.i >= tour.stops.length - 1) { setAuto(false); return; }
    const d = distM(tour.stops[Math.max(0, tour.i - 1)], tour.stops[tour.i]);
    next.current = setTimeout(() => go(tour.i + 1), Math.min(6000, Math.max(900, d * 14)) + 2600);
    return () => { if (next.current) clearTimeout(next.current); };
  }, [tour, auto, go]);

  const meters = sel && me ? Math.round(distM(me, sel) * 1.25) : null; // paths are ~25% longer than a straight line
  const walk = meters != null ? Math.max(1, Math.round(meters / 75)) : null;
  const center = university?.center_lat ? { latitude: university.center_lat, longitude: university.center_lng! } : { latitude: 31.95, longitude: 35.91 }; // Amman, until the university has a campus point

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <MapView ref={map} provider={PROVIDER_DEFAULT} style={{ flex: 1 }} showsUserLocation showsCompass={false} showsPointsOfInterests={false} showsBuildings pitchEnabled rotateEnabled
        mapType={sat ? (Platform.OS === 'ios' ? 'hybridFlyover' : 'hybrid') : Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        initialCamera={{ center, zoom: 16, heading: 0, pitch: 0 }} onPress={() => { Keyboard.dismiss(); }}
        onRegionChangeComplete={(r) => { setZoom(Math.log2(360 / r.longitudeDelta)); mid.current = { lat: r.latitude, lng: r.longitude }; }}>
        {shown.map((p) => {
          const on = sel?.id === p.id;
          const { g, icon: Icon } = kindOf(p.kind);
          const small = MINOR.includes(p.kind) && !on;
          const label = on || (p.kind === 'building' ? zoom > 16.6 : zoom > 17.6);
          return (
            <Marker key={p.id + (on ? '-on' : '') + (label ? '-l' : '')} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => focus(p)} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ alignItems: 'center', gap: 3 }}>
                <GlyphTile icon={Icon} colors={on ? ['#2A2F4F', '#0E1430'] : g} size={on ? 40 : small ? 22 : 30} />
                {label && (
                  <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, backgroundColor: on ? C.inverse : C.glass, maxWidth: 150 }, shadow]}>
                    <T v="tiny" numberOfLines={1} color={on ? C.onInverse : C.ink} style={{ fontSize: 11 }}>{p.name}</T>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
        {trail.length > 1 && <Polyline coordinates={trail} strokeColor="#FFFFFF" strokeWidth={6} />}
        {trail.length > 1 && <Polyline coordinates={trail} strokeColor={C.primary} strokeWidth={3} />}
        {walker && (
          <Marker key="walker" coordinate={{ latitude: walker.lat, longitude: walker.lng }} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false} zIndex={999}>
            <View style={[{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, shadow]}>
              <Footprints size={17} color="#FFFFFF" />
            </View>
          </Marker>
        )}
        {Platform.OS === 'web' && me && !walker && (
          <Marker key="me" coordinate={{ latitude: me.lat, longitude: me.lng }} anchor={{ x: 0.5, y: 0.5 }}>
            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#2E7BFF', borderWidth: 3, borderColor: '#FFFFFF' }} />
          </Marker>
        )}
        {routing && sel && me && (
          <Polyline coordinates={[{ latitude: me.lat, longitude: me.lng }, { latitude: sel.lat, longitude: sel.lng }]} strokeColor={C.primary} strokeWidth={5} lineDashPattern={[12, 8]} />
        )}
      </MapView>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 10 }} pointerEvents="box-none">
        <Row gap={8} style={{ marginTop: 6 }}>
        <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel={t('رجوع')}
          style={[{ width: 52, height: 52, borderRadius: 18, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
          <ChevronRight size={22} color={C.ink} style={flip} />
        </Tap>
        <Row gap={8} style={[{ flex: 1, minHeight: 52, borderRadius: 18, backgroundColor: C.card, paddingHorizontal: 16 }, shadow]}>
          <Search size={20} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث عن مبنى، قاعة، أو لقب زي «الكراج»')} placeholderTextColor={C.faint}
            style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta, minHeight: 48 }} accessibilityLabel={t('ابحث بالخريطة')} />
          {q ? <Tap onPress={() => setQ('')} accessibilityLabel={t('مسح')}><X size={18} color={C.muted} /></Tap> : null}
        </Row>
        </Row>
        {hits.length > 0 ? (
          <Animated.View entering={FadeIn} style={[{ backgroundColor: C.card, borderRadius: 18, maxHeight: 280 }, shadow]}>
            <FlatList data={hits} keyExtractor={(h) => h.kind + h.id + h.title} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Tap onPress={() => { setQ(''); setHits([]); Keyboard.dismiss(); focus({ id: item.id, kind: item.kind, name: item.title, sub: item.subtitle, lat: item.lat!, lng: item.lng! }); }}
                  style={{ minHeight: 54, paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <T v="bodyMd">{item.title}</T>
                  {item.subtitle ? <T v="tiny" color={C.muted}>{item.kind === 'alias' ? t('لقب لـ {0}', [item.subtitle]) : item.subtitle}</T> : null}
                </Tap>
              )} />
          </Animated.View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.filter((f) => f.key === 'all' || pins.some((p) => inGroup(f.key, p.kind))).map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} style={shadow} />)}
          </ScrollView>
        )}
      </SafeAreaView>

      {suggest && (
        <>
          <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ alignItems: 'center', marginTop: -44 }}>
              <MapPin size={44} color={C.red} fill={C.red} />
              <View style={{ width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.3)' }} />
            </View>
          </View>
          <Animated.View entering={SlideInDown.springify().damping(18)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 28, padding: 16, gap: 10 }, shadow]}>
            {suggest === 'pin' ? (
              <>
                <T v="h3">{t('اقترح مكان ناقص')}</T>
                <T v="small" color={C.muted}>{t('حرّك الخريطة لحتى يصير الدبوس الأحمر فوق المكان بالضبط.')}</T>
                <Row gap={8}>
                  <Button kind="soft" title={t('إلغاء')} onPress={() => setSuggest(null)} style={{ flex: 1 }} />
                  <Button title={t('هون بالضبط')} onPress={() => setSuggest('form')} style={{ flex: 1.4 }} />
                </Row>
              </>
            ) : (
              <>
                <T v="h3">{t('شو هاد المكان؟')}</T>
                <Field label={t('الاسم')} value={sName} onChangeText={setSName} placeholder={t('مثلاً كشك أبو أحمد، مدرج الحسن')} maxLength={70} autoFocus />
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {['building', 'cafeteria', 'restaurant', 'kiosk', 'print', 'shop', 'parking', 'bus', 'gate', 'mosque', 'library', 'atm', 'clinic', 'sports', 'garden', 'service'].map((k) => (
                    <Chip key={k} label={kindOf(k).label} active={sKind === k} onPress={() => setSKind(k)} />
                  ))}
                </ScrollView>
                <Field label={t('وصف قصير (اختياري)')} value={sDesc} onChangeText={setSDesc} placeholder={t('مثلاً جنب الباب الشمالي، بفتح من 8 لـ 4')} maxLength={160} />
                <Row gap={8}>
                  <Button kind="soft" title={t('رجوع')} onPress={() => setSuggest('pin')} style={{ flex: 1 }} />
                  <Button title={t('ابعت الاقتراح')} loading={sBusy} disabled={sBusy} onPress={sendSuggestion} style={{ flex: 1.4 }} />
                </Row>
              </>
            )}
          </Animated.View>
        </>
      )}

      {!sel && !tour && !suggest && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 12, alignItems: 'center' }}>
          <T v="tiny" color={C.muted} style={{ fontSize: 10, backgroundColor: C.glass, paddingHorizontal: 8, borderRadius: 6, overflow: 'hidden' }}>{t('الأماكن من OpenStreetMap وWikimapia')}</T>
        </View>
      )}

      {!sel && !tour && !suggest && pinsState === 'ok' && pins.filter((p) => TOUR_KINDS.includes(p.kind)).length > 1 && (
        <View pointerEvents="box-none" style={{ position: 'absolute', right: 16, bottom: 40 }}>
          <Tap onPress={startTour} accessibilityLabel={t('تمشّى بالجامعة')}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 52, paddingHorizontal: 18, borderRadius: 26, backgroundColor: C.primary }, shadow]}>
            <Footprints size={20} color={C.white} />
            <T v="bold" color={C.white}>{t('تمشّى بالجامعة')}</T>
          </Tap>
        </View>
      )}

      {!sel && !tour && !suggest && (
        <View style={{ position: 'absolute', left: 16, bottom: 40, gap: 10 }}>
          <Tap onPress={() => setSat((x) => !x)} accessibilityLabel={t('غيّر شكل الخريطة')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: sat ? C.inverse : C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Layers size={21} color={sat ? C.onInverse : C.ink} />
          </Tap>
          <Tap onPress={() => { mid.current ??= { lat: center.latitude, lng: center.longitude }; setSuggest('pin'); }} accessibilityLabel={t('اقترح مكان ناقص')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <MapPinPlus size={21} color={C.ink} />
          </Tap>
          <Tap onPress={fitAll} accessibilityLabel={t('شوف الجامعة كاملة')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Maximize2 size={20} color={C.ink} />
          </Tap>
          {me && (
            <Tap onPress={() => map.current?.animateCamera({ center: { latitude: me.lat, longitude: me.lng }, zoom: 17.5 }, { duration: 600 })} accessibilityLabel={t('موقعي')}
              style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
              <Crosshair size={22} color={C.primary} />
            </Tap>
          )}
        </View>
      )}

      {!sel && pinsState !== 'ok' && (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: 16, right: 16, bottom: 40, alignItems: 'center' }}>
          <View style={[{ backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 320 }, shadow]}>
            {pinsState === 'loading' ? <ActivityIndicator color={C.primary} /> : null}
            <T v="small" style={{ flexShrink: 1 }} color={pinsState === 'error' ? C.red : C.ink2}>
              {pinsState === 'loading' ? t('عم نحمّل أماكن الجامعة…') : pinsState === 'error' ? t('ما قدرنا نحمّل الخريطة، تأكد من الإنترنت.') : t('أماكن جامعتك بتنضاف قريباً.')}
            </T>
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
          <Animated.View entering={SlideInDown.springify().damping(18)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 30, padding: 16, paddingTop: 10, gap: 12 }, shadow]}>
            <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
            <Row gap={12}>
              <GlyphTile icon={k.icon} colors={k.g} size={50} />
              <View style={{ flex: 1 }}>
                <T v="tiny" color={C.primary}>{tour.walk ? t('مشي افتراضي') : t('المحطة {0} من {1}', [String(tour.i + 1), String(tour.stops.length)])}</T>
                <T v="h2" numberOfLines={2}>{s.name}</T>
                <T v="small" color={C.muted}>{m != null ? t('{0} · {1} متر من {2}', [k.label, String(m), prev!.name]) : k.label}</T>
              </View>
              <Tap onPress={endTour} accessibilityLabel={t('إنهاء الجولة')}><X size={22} color={C.muted} /></Tap>
            </Row>
            {tour.walk && m != null && (
              <T v="small" color={C.ink2}>{t('بتوصل مشي بحوالي {0} دقايق.', [String(Math.max(1, Math.round(m / 75)))])}</T>
            )}
            <Row gap={10} style={{ justifyContent: 'center' }}>
              {!tour.walk && (
                <>
                  <Tap onPress={() => { setAuto(false); go(tour.i - 1); }} disabled={tour.i === 0} accessibilityLabel={t('اللي قبل')} style={[btn, { backgroundColor: C.soft, opacity: tour.i === 0 ? 0.4 : 1 }]}>
                    <SkipBack size={20} color={C.ink} style={flip} />
                  </Tap>
                  <Tap onPress={() => { if (!auto && tour.i >= tour.stops.length - 1) { setAuto(true); go(0); } else setAuto((x) => !x); }} accessibilityLabel={auto ? t('وقّف') : t('كمّل')} style={[btn, { width: 62, height: 62, borderRadius: 31, backgroundColor: C.primary }]}>
                    {auto ? <Pause size={24} color={C.white} fill={C.white} /> : <Play size={24} color={C.white} fill={C.white} />}
                  </Tap>
                  <Tap onPress={() => { setAuto(false); go(tour.i + 1); }} disabled={tour.i >= tour.stops.length - 1} accessibilityLabel={t('اللي بعد')} style={[btn, { backgroundColor: C.soft, opacity: tour.i >= tour.stops.length - 1 ? 0.4 : 1 }]}>
                    <SkipForward size={20} color={C.ink} style={flip} />
                  </Tap>
                </>
              )}
              <Tap onPress={() => Linking.openURL(streetView(s)).catch(() => {})} accessibilityLabel={t('صور 360° للمكان')}
                style={[btn, { width: undefined, paddingHorizontal: 14, flexDirection: 'row', gap: 6, backgroundColor: C.primarySoft }]}>
                <Rotate3d size={19} color={C.primary} />
                <T v="small" color={C.primary}>{t('360°')}</T>
              </Tap>
            </Row>
          </Animated.View>
        );
      })()}

      {sel && !tour && (
        <Animated.View entering={SlideInDown.springify().damping(18)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 30, padding: 18, paddingTop: 10, gap: 12 }, shadow]}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <Row gap={12}>
            <GlyphTile icon={kindOf(sel.kind).icon} colors={kindOf(sel.kind).g} size={56} pop />
            <View style={{ flex: 1 }}>
              <T v="h2">{sel.name}</T>
              <T v="small" color={C.muted}>{sel.sub ? `${kindOf(sel.kind).label} · ${sel.sub}` : kindOf(sel.kind).label}</T>
            </View>
            <Tap onPress={() => { setSel(null); setRouting(false); }} accessibilityLabel={t('إغلاق')}><X size={22} color={C.muted} /></Tap>
          </Row>
          {walk != null && (
            <Row gap={10}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.primarySoft, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }} color={C.primary}>{walk}</T><T v="tiny" color={C.ink2}>{t('دقايق مشي (تقريباً)')}</T>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.bg, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }}>{meters}</T><T v="tiny" color={C.ink2}>{t('متر')}</T>
              </View>
            </Row>
          )}
          <Row gap={8}>
            <Tap onPress={() => walkHere(sel)} accessibilityLabel={t('امشي لهون من مكانك')}
              style={{ flex: 1, flexDirection: 'row', gap: 8, minHeight: 46, borderRadius: 16, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Footprints size={18} color={C.ink} />
              <T v="bodyMd">{t('امشي لهون')}</T>
            </Tap>
            <Tap onPress={() => Linking.openURL(streetView(sel)).catch(() => {})} accessibilityLabel={t('صور 360° للمكان')}
              style={{ flex: 1, flexDirection: 'row', gap: 8, minHeight: 46, borderRadius: 16, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
              <Rotate3d size={18} color={C.ink} />
              <T v="bodyMd">{t('صور 360°')}</T>
            </Tap>
          </Row>
          {sel.advertiser_id && (
            <Button kind="soft" title={t('شوف صفحة المحل')} onPress={() => router.push({ pathname: '/advertiser/[id]', params: { id: sel.advertiser_id! } })} style={{ minHeight: 46 }} />
          )}
          <Row gap={8}>
          <View style={{ flex: 1 }}>
          <Button kind={routing ? 'dark' : 'primary'} title={routing ? t('إيقاف') : me ? t('وريني الطريق') : t('فعّل الموقع')}
            icon={<Navigation size={19} color={C.white} />}
            onPress={async () => {
              if (!me) { await startLocation(true); return; }
              setRouting((r) => !r);
              if (!routing) map.current?.fitToCoordinates([{ latitude: me.lat, longitude: me.lng }, { latitude: sel.lat, longitude: sel.lng }], { edgePadding: { top: 160, bottom: 380, left: 60, right: 60 }, animated: true });
            }} />
          </View>
          <Tap onPress={() => {
            const url = Platform.OS === 'ios' ? `maps://?daddr=${sel.lat},${sel.lng}&dirflg=w` : `https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}&travelmode=walking`;
            Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${sel.lat},${sel.lng}&travelmode=walking`));
          }} accessibilityLabel={t('افتح بالخرائط')} style={{ width: 54, minHeight: 54, borderRadius: 18, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <ExternalLink size={20} color={C.primary} />
          </Tap>
          </Row>
        </Animated.View>
      )}
    </View>
  );
}
