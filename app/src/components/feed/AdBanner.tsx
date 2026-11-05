import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { Row, T, Tap, Tag } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Ad = { campaign_id: string; advertiser_id: string; advertiser_name: string; title: string; body: string | null; image_url: string | null; offer: string | null };

/** First-party sponsored card. Always labelled t('ممول'). Opens the advertiser page inside the app. */
export function AdBanner({ placement }: { placement: 'home_banner' | 'feed_card' | 'market_banner' }) {
  const [ad, setAd] = useState<Ad | null>(null);
  const tracked = useRef(false);

  useEffect(() => {
    supabase.rpc('live_ads', { placement_filter: placement }).then(({ data }) => {
      const a = (data as Ad[] | null)?.[0] ?? null;
      setAd(a);
      if (a && !tracked.current) { tracked.current = true; supabase.rpc('track_ad', { campaign: a.campaign_id, what: 'impression' }).then(() => {}, () => {}); }
    });
  }, [placement]);

  if (!ad) return null;
  return (
    <Tap
      accessibilityLabel={t('إعلان ممول: {0}', [ad.advertiser_name])}
      onPress={() => { supabase.rpc('track_ad', { campaign: ad.campaign_id, what: 'click' }).then(() => {}, () => {}); router.push({ pathname: '/advertiser/[id]', params: { id: ad.advertiser_id, campaign: ad.campaign_id } }); }}
      style={[{ backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' }, shadow]}
    >
      {ad.image_url ? <Image source={{ uri: ad.image_url }} style={{ height: 120, width: '100%' }} contentFit="cover" /> : null}
      <Row gap={10} style={{ padding: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}><Tag label={t('ممول')} bg={C.soft} fg={C.muted} /><T v="tiny" color={C.muted}>{ad.advertiser_name}</T></Row>
          <T v="bold">{ad.title}</T>
          {ad.offer ? <T v="small" color={C.greenInk}>{ad.offer}</T> : ad.body ? <T v="small" color={C.muted}>{ad.body}</T> : null}
        </View>
        <View style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center' }}>
          <T v="bold" color={C.primary} style={{ fontSize: 13 }}>{t('شوف')}</T>
        </View>
      </Row>
    </Tap>
  );
}
