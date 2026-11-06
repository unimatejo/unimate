import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { CircleAlert, Clock, MapPin, Phone } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';

import { Button, Empty, Header, Loading, Row, Screen, T, Tag } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Adv = {
  id: string; name: string; category: string; description: string | null; phone: string | null; hours: string | null;
  menu: { name: string; price_jod?: number; photo_url?: string }[]; photos: string[]; logo_url: string | null; lat: number | null; lng: number | null;
};
const CAT: Record<string, string> = { restaurant: t('مطعم'), cafe: t('كافيه'), bookshop: t('مكتبة'), print: t('طباعة'), housing: t('سكن'), courses: t('دورات'), shop: t('محل'), other: t('خدمة') };

/** An advertiser's public page with its current offers. */
export default function Advertiser() {
  const { id, campaign } = useLocalSearchParams<{ id: string; campaign?: string }>();
  const [a, setA] = useState<Adv | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading');

  const load = () => {
    setState('loading');
    supabase.rpc('advertiser_page', { adv: id }).then(({ data, error }) => {
      if (error) { setState('error'); return; }
      const row = ((data ?? []) as Adv[])[0] ?? null;
      if (!row) { setState('missing'); return; }
      setA({ ...row, photos: row.photos ?? [], menu: row.menu ?? [] }); setState('ok');
    }, () => setState('error'));
  };
   
  useEffect(load, [id]);

  function call() {
    if (!a?.phone) return;
    if (campaign) supabase.rpc('track_ad', { campaign, what: 'call' }).then(() => {}, () => {});
    Linking.openURL(`tel:${a.phone.replace(/[^\d+]/g, '')}`).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط')));
  }

  if (state !== 'ok' || !a) return (
    <Screen><Header title="" />
      {state === 'loading' ? <Loading /> : <Empty icon={<CircleAlert size={28} color={C.muted} />} title={state === 'missing' ? t('هالصفحة مش متوفرة') : t('ما قدرنا نحمّل')}
        body={state === 'missing' ? t('يمكن الإعلان خلص.') : t('تأكد من الإنترنت وجرّب كمان مرة.')}
        action={state === 'error' ? <Button kind="soft" title={t('جرّب مرة ثانية')} onPress={load} style={{ paddingHorizontal: 24 }} /> : undefined} />}
    </Screen>
  );
  const cover = a.photos[0];

  return (
    <Screen>
      <Header title={a.name} subtitle={CAT[a.category]} right={<Tag label={t('ممول')} bg={C.orangeSoft} fg={C.orange} />} />
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
          {a.phone ? <Button kind="green" title={t('اتصل')} icon={<Phone size={17} color={C.white} />} onPress={call} style={{ minHeight: 46 }} /> : null}
        </Row>

        {a.menu.length > 0 && (
          <View style={{ gap: 8 }}>
            <T v="h3">{t('القائمة')}</T>
            {a.menu.map((m, i) => (
              <Row key={i} gap={12} style={{ backgroundColor: C.card, borderRadius: 18, padding: 10 }}>
                {m.photo_url ? <Image source={{ uri: m.photo_url }} style={{ width: 54, height: 54, borderRadius: 14 }} /> : null}
                <T v="bodyMd" style={{ flex: 1 }}>{m.name}</T>
                {m.price_jod != null ? <T v="bold" color={C.primary}>{m.price_jod} {t('د.أ')}</T> : null}
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
            <Row gap={6}><MapPin size={18} color={C.red} /><T v="h3">{t('الموقع')}</T></Row>
            <View style={{ height: 180, borderRadius: 22, overflow: 'hidden' }}>
              <MapView style={{ flex: 1 }} initialRegion={{ latitude: a.lat, longitude: a.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }} scrollEnabled={false} zoomEnabled={false}>
                <Marker coordinate={{ latitude: a.lat, longitude: a.lng }} title={a.name} />
              </MapView>
            </View>
            <Button kind="soft" title={t('شوفه على خريطة الجامعة')} onPress={() => router.push({ pathname: '/map', params: { advertiser: a.id } })} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
