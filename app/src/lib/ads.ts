import { router } from 'expo-router';
import { Linking } from 'react-native';

import { reportError } from './errors';
import { t } from './i18n';
import { supabase } from './supabase';

/**
 * First-party ads (restaurants, cafés, print shops near the campus). Every ad is labelled «ممول», nothing tracks a
 * student across apps: the server counts one view a day per student, and taps, so advertisers see honest numbers.
 */
type Placement = 'home_banner' | 'feed_card' | 'market_banner';
export type Ad = {
  campaign_id: string; advertiser_id: string; advertiser_name: string; title: string; body: string | null; image_url: string | null;
  offer: string | null; logo_url: string | null; cta_url: string | null; cta_label: string | null; priority: number;
  /** what the button does (0136): the advertiser's site, the walk to them on the campus map, or a call; null = no button */
  cta_kind: CtaKind | null;
  /** false: the picture already carries the writing, so only «ممول» and the button go on top */
  show_text: boolean;
  building_id: string | null;
  phone: string | null;
};
export type CtaKind = 'link' | 'map' | 'call';
type Event = 'impression' | 'click' | 'call' | 'order' | 'directions';

/** The button's words when the owner leaves them empty, by what it does. */
export const CTA_DEFAULT: Record<CtaKind, string> = { link: t('اطلب الآن'), map: t('الاتجاهات'), call: t('اتصل الآن') };

/** The packages the owner sells: a higher one shows first, ads in the same package take turns. */
export const PACKAGES = { 30: t('ذهبية'), 20: t('فضية'), 10: t('عادية') } as const;
export type PackageKey = keyof typeof PACKAGES;
export const packageOf = (priority: number): PackageKey => (priority >= 30 ? 30 : priority >= 20 ? 20 : 10);

/** Live ads for this student's university (and college) now, best package first (at most 5). */
export async function liveAds(placement: Placement): Promise<Ad[]> {
  // signed out (the login screen can sit on top of Home): there are no ads to ask for
  if (!(await supabase.auth.getSession()).data.session) return [];
  const { data, error } = await supabase.rpc('live_ads', { placement_filter: placement });
  if (error) { reportError(error); return []; }
  return (data ?? []) as Ad[];
}

export function trackAd(campaign: string, what: Event) {
  supabase.rpc('track_ad', { campaign, what }).then(() => {}, () => {});
}

/** The advertiser's page inside the app. */
export function openAdvertiser(ad: Ad) {
  trackAd(ad.campaign_id, 'click');
  router.push({ pathname: '/advertiser/[id]', params: { id: ad.advertiser_id, campaign: ad.campaign_id } });
}

/**
 * The banner's button: the advertiser's own site or ordering app (https only, checked on the server too), the walk to
 * them on the campus map, or a call.
 */
export function adAction(ad: Ad) {
  if (ad.cta_kind === 'link') {
    const url = ad.cta_url?.trim();
    if (!url || !/^https:\/\/\S+$/i.test(url)) return;
    trackAd(ad.campaign_id, 'order');
    Linking.openURL(url).catch(reportError);
  } else if (ad.cta_kind === 'map') {
    trackAd(ad.campaign_id, 'directions');
    router.push({ pathname: '/map', params: ad.building_id ? { building: ad.building_id, go: '1' } : { advertiser: ad.advertiser_id } });
  } else if (ad.cta_kind === 'call' && ad.phone) {
    trackAd(ad.campaign_id, 'call');
    Linking.openURL(`tel:${ad.phone.replace(/[^\d+]/g, '')}`).catch(reportError);
  }
}
