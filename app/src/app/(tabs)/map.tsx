import * as Location from 'expo-location';
import { useLocalSearchParams } from 'expo-router';
import { Building2, Coffee, Crosshair, MapPin, Navigation, Search, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Keyboard, ScrollView, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Chip, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';

type Pin = { id: string; kind: string; name: string; sub?: string | null; lat: number; lng: number; advertiser_id?: string | null };
type Hit = { kind: string; id: string; title: string; subtitle: string; lat: number | null; lng: number | null };

const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'building', label: 'المباني' },
  { key: 'food', label: 'أكل وقهوة' },
  { key: 'service', label: 'خدمات' },
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

  useEffect(() => {
    if (!university) return;
    (async () => {
      const [{ data: b }, { data: p }] = await Promise.all([
        supabase.from('buildings').select('id, name_ar, code, lat, lng').eq('university_id', university.id).not('lat', 'is', null),
        supabase.from('places').select('id, kind, name_ar, description, lat, lng, advertiser_id').eq('university_id', university.id).eq('state', 'approved'),
      ]);
      setPins([
        ...(b ?? []).map((x) => ({ id: x.id, kind: 'building', name: x.name_ar, sub: x.code, lat: x.lat!, lng: x.lng! })),
        ...(p ?? []).map((x) => ({ id: x.id, kind: x.kind, name: x.name_ar, sub: x.description, lat: x.lat, lng: x.lng, advertiser_id: x.advertiser_id })),
      ]);
    })();
  }, [university]);

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
    map.current?.animateCamera({ center: { latitude: p.lat, longitude: p.lng }, zoom: 18 }, { duration: 600 });
  }, []);

  const shown = useMemo(() => pins.filter((p) =>
    filter === 'all' || (filter === 'building' ? p.kind === 'building' : filter === 'food' ? FOOD.includes(p.kind) : SERVICE.includes(p.kind))), [pins, filter]);

  const meters = sel && me ? Math.round(distM(me, sel) * 1.25) : null; // paths are ~25% longer than a straight line
  const walk = meters != null ? Math.max(1, Math.round(meters / 75)) : null;
  const center = university?.center_lat ? { latitude: university.center_lat, longitude: university.center_lng! } : { latitude: 32.1, longitude: 36.18 };

  return (
    <View style={{ flex: 1, backgroundColor: '#ECEFE7' }}>
      <MapView ref={map} provider={PROVIDER_DEFAULT} style={{ flex: 1 }} showsUserLocation showsCompass={false} showsPointsOfInterests={false}
        initialCamera={{ center, zoom: 16, heading: 0, pitch: 0 }} onPress={() => { Keyboard.dismiss(); }}>
        {shown.map((p) => (
          <Marker key={p.id} coordinate={{ latitude: p.lat, longitude: p.lng }} onPress={() => focus(p)} tracksViewChanges={false}>
            <View style={[{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: sel?.id === p.id ? C.ink : C.white, flexDirection: 'row', alignItems: 'center', gap: 5 }, shadow]}>
              {p.kind === 'building' ? <Building2 size={13} color={sel?.id === p.id ? C.white : C.primary} /> : FOOD.includes(p.kind) ? <Coffee size={13} color={sel?.id === p.id ? C.white : C.orange} /> : <MapPin size={13} color={sel?.id === p.id ? C.white : C.green} />}
              <T v="tiny" color={sel?.id === p.id ? C.white : C.ink}>{p.name}</T>
            </View>
          </Marker>
        ))}
        {routing && sel && me && (
          <Polyline coordinates={[{ latitude: me.lat, longitude: me.lng }, { latitude: sel.lat, longitude: sel.lng }]} strokeColor={C.primary} strokeWidth={5} lineDashPattern={[12, 8]} />
        )}
      </MapView>

      <SafeAreaView edges={['top']} style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: 16, gap: 10 }} pointerEvents="box-none">
        <Row gap={8} style={[{ minHeight: 52, borderRadius: 18, backgroundColor: C.white, paddingHorizontal: 16, marginTop: 6 }, shadow]}>
          <Search size={20} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="ابحث عن مبنى، قاعة، أو لقب زي «الكراج»" placeholderTextColor={C.faint}
            style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: 'right', minHeight: 48 }} accessibilityLabel="ابحث بالخريطة" />
          {q ? <Tap onPress={() => setQ('')} accessibilityLabel="مسح"><X size={18} color={C.muted} /></Tap> : null}
        </Row>
        {hits.length > 0 ? (
          <Animated.View entering={FadeIn} style={[{ backgroundColor: C.white, borderRadius: 18, maxHeight: 280 }, shadow]}>
            <FlatList data={hits} keyExtractor={(h) => h.kind + h.id + h.title} keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Tap onPress={() => { setQ(''); setHits([]); Keyboard.dismiss(); focus({ id: item.id, kind: item.kind, name: item.title, sub: item.subtitle, lat: item.lat!, lng: item.lng! }); }}
                  style={{ minHeight: 54, paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: C.line }}>
                  <T v="bodyMd">{item.title}</T>
                  {item.subtitle ? <T v="tiny" color={C.muted}>{item.kind === 'alias' ? `لقب لـ ${item.subtitle}` : item.subtitle}</T> : null}
                </Tap>
              )} />
          </Animated.View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {FILTERS.map((f) => <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} style={shadow} />)}
          </ScrollView>
        )}
      </SafeAreaView>

      {me && (
        <Tap onPress={() => map.current?.animateCamera({ center: { latitude: me.lat, longitude: me.lng }, zoom: 17 }, { duration: 500 })} accessibilityLabel="موقعي"
          style={[{ position: 'absolute', left: 16, bottom: sel ? 250 : 24, width: 48, height: 48, borderRadius: 16, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' }, shadow]}>
          <Crosshair size={22} color={C.ink} />
        </Tap>
      )}

      {sel && (
        <Animated.View entering={SlideInDown.springify().damping(18)} style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingTop: 10, gap: 12 }, shadow]}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#DCE1EE' }} />
          <Row gap={12}>
            <View style={{ width: 60, height: 60, borderRadius: 20, backgroundColor: sel.kind === 'building' ? C.primarySoft : C.orangeSoft, alignItems: 'center', justifyContent: 'center' }}>
              {sel.kind === 'building' ? <Building2 size={28} color={C.primary} /> : <MapPin size={28} color={C.orange} />}
            </View>
            <View style={{ flex: 1 }}>
              <T v="h2">{sel.name}</T>
              {sel.sub ? <T v="small" color={C.muted}>{sel.sub}</T> : null}
            </View>
            <Tap onPress={() => { setSel(null); setRouting(false); }} accessibilityLabel="إغلاق"><X size={22} color={C.muted} /></Tap>
          </Row>
          {walk != null && (
            <Row gap={10}>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.primarySoft, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }} color={C.primary}>{walk}</T><T v="tiny" color={C.ink2}>دقايق مشي</T>
              </View>
              <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.bg, borderRadius: 16, padding: 10 }}>
                <T style={{ fontFamily: F.display, fontSize: 20 }}>{meters}</T><T v="tiny" color={C.ink2}>متر</T>
              </View>
            </Row>
          )}
          <Button kind={routing ? 'dark' : 'primary'} title={routing ? 'إيقاف التوجيه' : me ? 'ابدأ التوجيه' : 'فعّل الموقع للتوجيه'}
            icon={<Navigation size={19} color={C.white} />}
            onPress={async () => {
              if (!me) { await Location.requestForegroundPermissionsAsync(); return; }
              setRouting((r) => !r);
              if (!routing) map.current?.fitToCoordinates([{ latitude: me.lat, longitude: me.lng }, { latitude: sel.lat, longitude: sel.lng }], { edgePadding: { top: 160, bottom: 320, left: 60, right: 60 }, animated: true });
            }} />
        </Animated.View>
      )}
    </View>
  );
}
