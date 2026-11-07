import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Row, T, Tap, Tag } from '@/components/ui';
import { adAction, ctaText, liveAds, openAdvertiser, trackAd, type Ad } from '@/lib/ads';
import { C, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

/**
 * A sponsored card between posts and in the market (Home has its own banners, HomeAds). Always labelled «ممول».
 * A banner photo already carries the shop's words, so then only its name, «ممول» and the button go under it.
 */
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
  const text = ad.show_text || !ad.image_url;
  const cta = ctaText(ad);
  return (
    <Tap accessibilityLabel={t('إعلان ممول: {0}', [ad.advertiser_name])} onPress={() => openAdvertiser(ad)}
      style={[{ backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' }, shadow]}>
      {ad.image_url ? <Image source={{ uri: ad.image_url }} style={{ width: '100%', aspectRatio: 2 }} contentFit="cover" transition={200} /> : null}
      <Row gap={10} style={{ padding: 14 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Row gap={6}><Tag label={t('ممول')} bg={C.soft} fg={C.muted} /><T v="tiny" color={C.muted}>{ad.advertiser_name}</T></Row>
          {text ? <T v="bold">{ad.title}</T> : null}
          {!text ? null : ad.offer ? <T v="small" color={C.greenInk}>{ad.offer}</T> : ad.body ? <T v="small" color={C.muted}>{ad.body}</T> : null}
        </View>
        <Tap onPress={ad.cta_kind ? () => adAction(ad) : () => openAdvertiser(ad)}
          style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primarySoft, justifyContent: 'center' }}>
          <T v="bold" color={C.primary} style={{ fontSize: 13 }}>{cta ?? t('عرض')}</T>
        </Tap>
      </Row>
    </Tap>
  );
}
