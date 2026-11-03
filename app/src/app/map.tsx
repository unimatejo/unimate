import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { Building2, ChevronRight, Coffee, Crosshair, ExternalLink, Layers, MapPin, Maximize2, Navigation, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, Linking, Platform, ScrollView, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GlyphTile, GRAD } from '@/components/Glyph';
import { Button, Chip, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import { flip, nm, t, ta } from '@/lib/i18n';

type Pin = { id: string; kind: string; name: string; sub?: string | null; lat: number; lng: number; advertiser_id?: string | null };
type Hit = { kind: string; id: string; title: string; subtitle: string; lat: number | null; lng: number | null };

const FILTERS = [
  { key: 'all', label: t('الكل') },
  { key: 'building', label: t('المباني') },
  { key: 'food', label: t('أكل وقهوة') },
  { key: 'service', label: t('خدمات') },
] as const;
const FOOD = ['cafeteria', 'restaurant'];
const SERVICE = ['mosque', 'library', 'parking', 'gate', 'clinic', 'bank', 'print', 'service', 'sports'];

function distM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000, r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function CampusMap() {
  const { university } = useAuth();
  const params = useLocalSearchParams<{ building?: string; advertiser?: string }>();
  const map = useRef<MapView>(null);
  const [pins, setPins] = useState<Pin[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('all');
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [sel, setSel] = useState<Pin | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [routing, setRouting] = useState(false);
  const [sat, setSat] = useState(false);
  const [zoom, setZoom] = useState(16);

  useEffect(() => {
    if (!university) return;
    (async () => {
      const [{ data: b }, { data: p }] = await Promise.all([
        supabase.from('buildings').select('id, name_ar, code, lat, lng').eq('university_id', university.id).not('lat', 'is', null),
        supabase.from('places').select('id, kind, name_ar, description, lat, lng, advertiser_id').eq('university_id', university.id).eq('state', 'approved'),
      ]);
      setPins([
        ...(b ?? []).map((x) => ({ id: x.id, kind: 'building', name: nm(x), sub: x.code, lat: x.lat!, lng: x.lng! })),
        ...(p ?? []).map((x) => ({ id: x.id, kind: x.kind, name: nm(x), sub: x.description, lat: x.lat, lng: x.lng, advertiser_id: x.advertiser_id })),
      ]);
    })();
  }, [university]);

  const fitAll = useCallback(() => {
    if (pins.length < 2) return;
    map.current?.fitToCoordinates(pins.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: { top: 170, bottom: 80, left: 40, right: 40 }, animated: true });
  }, [pins]);
  useEffect(() => { if (pins.length && !params.building && !params.advertiser) setTimeout(fitAll, 400); }, [pins, fitAll, params.building, params.advertiser]);

  useEffect(() => {
    if ((params.building || params.advertiser) && pins.length) {
      const p = pins.find((x) => (params.building && x.id === params.building) || (params.advertiser && x.advertiser_id === params.advertiser));
      if (p) focus(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.building, params.advertiser, pins]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    })().catch(() => {});
  }, []);

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

  const shown = useMemo(() => pins.filter((p) =>
    filter === 'all' || (filter === 'building' ? p.kind === 'building' : filter === 'food' ? FOOD.includes(p.kind) : SERVICE.includes(p.kind))), [pins, filter]);

  const meters = sel && me ? Math.round(distM(me, sel) * 1.25) : null; // paths are ~25% longer than a straight line
  const walk = meters != null ? Math.max(1, Math.round(meters / 75)) : null;
  const center = university?.center_lat ? { latitude: university.center_lat, longitude: university.center_lng! } : { latitude: 32.1, longitude: 36.18 };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <MapView ref={map} provider={PROVIDER_DEFAULT} style={{ flex: 1 }} showsUserLocation showsCompass={false} showsPointsOfInterests={false} showsBuildings pitchEnabled rotateEnabled
        mapType={sat ? (Platform.OS === 'ios' ? 'hybridFlyover' : 'hybrid') : Platform.OS === 'ios' ? 'mutedStandard' : 'standard'}
        initialCamera={{ center, zoom: 16, heading: 0, pitch: 0 }} onPress={() => { Keyboard.dismiss(); }}
        onRegionChangeComplete={(r) => setZoom(Math.log2(360 / r.longitudeDelta))}>
        {shown.map((p) => {
          const on = sel?.id === p.id;
          const g = p.kind === 'building' ? GRAD.blue : FOOD.includes(p.kind) ? GRAD.orange : GRAD.green;
          const Icon = p.kind === 'building' ? Building2 : FOOD.includes(p.kind) ? Coffee : MapPin;
          return (
            <Marker key={p.id + (on ? '-on' : '') + (zoom > 16.6 ? '-l' : '')} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => focus(p)} tracksViewChanges={false} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={{ alignItems: 'center', gap: 3 }}>
                <GlyphTile icon={Icon} colors={on ? ['#2A2F4F', '#0E1430'] : g} size={on ? 40 : 30} />
                {(on || zoom > 16.6) && (
                  <View style={[{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 9, backgroundColor: on ? C.inverse : C.glass, maxWidth: 150 }, shadow]}>
                    <T v="tiny" numberOfLines={1} color={on ? C.onInverse : C.ink} style={{ fontSize: 11 }}>{p.name}</T>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
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
            {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} style={shadow} />)}
          </ScrollView>
        )}
      </SafeAreaView>

      {!sel && (
        <View style={{ position: 'absolute', left: 16, bottom: 40, gap: 10 }}>
          <Tap onPress={() => setSat((x) => !x)} accessibilityLabel={t('غيّر شكل الخريطة')}
            style={[{ width: 48, height: 48, borderRadius: 16, backgroundColor: sat ? C.inverse : C.card, alignItems: 'center', justifyContent: 'center' }, shadow]}>
            <Layers size={21} color={sat ? C.onInverse : C.ink} />
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

      {sel && (
        <Animated.View entering={SlideInDown.springify().damping(18)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 30, padding: 18, paddingTop: 10, gap: 12 }, shadow]}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <Row gap={12}>
            <GlyphTile icon={sel.kind === 'building' ? Building2 : FOOD.includes(sel.kind) ? Coffee : MapPin} colors={sel.kind === 'building' ? GRAD.blue : FOOD.includes(sel.kind) ? GRAD.orange : GRAD.green} size={56} pop />
            <View style={{ flex: 1 }}>
              <T v="h2">{sel.name}</T>
              {sel.sub ? <T v="small" color={C.muted}>{sel.sub}</T> : null}
            </View>
            <Tap onPress={() => { setSel(null); setRouting(false); }} accessibilityLabel={t('إغلاق')}><X size={22} color={C.muted} /></Tap>
          </Row>
          {walk != null && (
            <Row gap={10}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.primarySoft, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }} color={C.primary}>{walk}</T><T v="tiny" color={C.ink2}>{t('دقايق مشي')}</T>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.bg, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }}>{meters}</T><T v="tiny" color={C.ink2}>{t('متر')}</T>
              </View>
            </Row>
          )}
          <Row gap={8}>
          <View style={{ flex: 1 }}>
          <Button kind={routing ? 'dark' : 'primary'} title={routing ? t('إيقاف') : me ? t('وريني الطريق') : t('فعّل الموقع')}
            icon={<Navigation size={19} color={C.white} />}
            onPress={async () => {
              if (!me) { await Location.requestForegroundPermissionsAsync(); return; }
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
