import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Row, T, Tap, Tag } from '@/components/ui';
import { CTA_DEFAULT, adAction, liveAds, openAdvertiser, trackAd, type Ad } from '@/lib/ads';
import { C, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** A sponsored card between posts and in the market (Home has its own banners, HomeAds). Always labelled «ممول». */
export function AdBanner({ placement }: { placement: 'feed_card' | 'market_banner' }) {
  const [ad, setAd] = useState<Ad | null>(null);

  useEffect(() => {
    let live = true;
    liveAds(placement).then((a) => {
      const first = a[0] ?? null;
      if (!live) return;
      setAd(first);
      if (first) trackAd(first.campaign_id, 'impression');
    });
    return () => { live = false; };
  }, [placement]);

  if (!ad) return null;
  return (
    <Tap accessibilityLabel={t('إعلان ممول: {0}', [ad.advertiser_name])} onPress={() => openAdvertiser(ad)}
      style={[{ backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' }, shadow]}>
      {ad.image_url ? <Image source={{ uri: ad.image_url }} style={{ height: 120, width: '100%' }} contentFit="cover" /> : null}
      <Row gap={10} style={{ padding: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}><Tag label={t('ممول')} bg={C.soft} fg={C.muted} /><T v="tiny" color={C.muted}>{ad.advertiser_name}</T></Row>
          <T v="bold">{ad.title}</T>
          {ad.offer ? <T v="small" color={C.greenInk}>{ad.offer}</T> : ad.body ? <T v="small" color={C.muted}>{ad.body}</T> : null}
        </View>
        <Tap onPress={ad.cta_kind ? () => adAction(ad) : () => openAdvertiser(ad)}
          style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center' }}>
          <T v="bold" color={C.primary} style={{ fontSize: 13 }}>{ad.cta_kind ? ad.cta_label || CTA_DEFAULT[ad.cta_kind] : t('شوف')}</T>
        </Tap>
      </Row>
    </Tap>
  );
}
