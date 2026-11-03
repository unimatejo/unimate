import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Clock, MapPin, Phone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Button, Header, Loading, Row, Screen, T, Tag } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type Adv = {
  id: string; name: string; category: string; description: string | null; phone: string | null; hours: string | null;
  menu: { name: string; price_jod?: number; photo_url?: string }[]; photos: string[]; logo_url: string | null; lat: number | null; lng: number | null;
};
const CAT: Record<string, string> = { restaurant: 'مطعم', cafe: 'كافيه', bookshop: 'مكتبة', print: 'طباعة', housing: 'سكن', courses: 'دورات', shop: 'محل', other: 'خدمة' };

export default function Advertiser() {
  const { id, campaign } = useLocalSearchParams<{ id: string; campaign?: string }>();
  const [a, setA] = useState<Adv | null>(null);

  useEffect(() => {
    supabase.rpc('advertiser_page', { adv: id }).then(({ data }) => setA(((data ?? []) as Adv[])[0] ?? null));
  }, [id]);

  function call() {
    if (!a?.phone) return;
    if (campaign) supabase.rpc('track_ad', { campaign, what: 'call' });
    Linking.openURL(`tel:${a.phone}`);
  }

  if (!a) return <Screen><Header title="" /><Loading /></Screen>;
  const cover = a.photos[0];

  return (
    <Screen>
      <Header title={a.name} subtitle={CAT[a.category]} right={<Tag label="ممول" bg={C.orangeSoft} fg={C.orange} />} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        {cover ? <Image source={{ uri: cover }} style={{ width: '100%', aspectRatio: 16 / 10, borderRadius: 24 }} contentFit="cover" transition={200} /> : null}
        <Row gap={12}>
          {a.logo_url ? <Image source={{ uri: a.logo_url }} style={{ width: 56, height: 56, borderRadius: 18 }} /> : null}
          <View style={{ flex: 1 }}>
            <T v="h2">{a.name}</T>
            {a.description ? <T v="small" color={C.ink2}>{a.description}</T> : null}
          </View>
        </Row>
        <Row gap={10}>
          {a.hours ? <Row gap={6} style={{ flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 12 }}><Clock size={17} color={C.green} /><T v="small">{a.hours}</T></Row> : null}
          {a.phone ? <Button kind="green" title="اتصل" icon={<Phone size={17} color={C.white} />} onPress={call} style={{ minHeight: 46 }} /> : null}
        </Row>

        {a.menu.length > 0 && (
          <View style={{ gap: 8 }}>
            <T v="h3">القائمة</T>
            {a.menu.map((m, i) => (
              <Row key={i} gap={12} style={{ backgroundColor: C.card, borderRadius: 18, padding: 10 }}>
                {m.photo_url ? <Image source={{ uri: m.photo_url }} style={{ width: 54, height: 54, borderRadius: 14 }} /> : null}
                <T v="bodyMd" style={{ flex: 1 }}>{m.name}</T>
                {m.price_jod != null ? <T v="bold" color={C.primary}>{m.price_jod} د.أ</T> : null}
              </Row>
            ))}
          </View>
        )}

        {a.photos.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {a.photos.slice(1).map((p) => <Image key={p} source={{ uri: p }} style={{ width: 150, height: 110, borderRadius: 16 }} contentFit="cover" />)}
          </ScrollView>
        )}

        {a.lat != null && a.lng != null && (
          <View style={{ gap: 8 }}>
            <Row gap={6}><MapPin size={18} color={C.red} /><T v="h3">الموقع</T></Row>
            <View style={{ height: 180, borderRadius: 22, overflow: 'hidden' }}>
              <MapView style={{ flex: 1 }} initialRegion={{ latitude: a.lat, longitude: a.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }} scrollEnabled={false} zoomEnabled={false}>
                <Marker coordinate={{ latitude: a.lat, longitude: a.lng }} title={a.name} />
              </MapView>
            </View>
            <Button kind="soft" title="شوفه على خريطة الجامعة" onPress={() => router.push({ pathname: '/map', params: { advertiser: a.id } })} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
