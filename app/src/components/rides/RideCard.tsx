import { Image } from 'expo-image';
import { BadgeCheck, Armchair, ChevronLeft } from 'lucide-react-native';
import { View } from 'react-native';

import { TitleBadge, titledName } from '@/components/profile/TitleBadge';
import { Avatar, Row, T, Tap } from '@/components/ui';
import { EMOJI, priceLabel, routeLabel, seatsLeft, timeLabel, type Ride } from '@/lib/rides';
import { C, F, shadow } from '@/lib/theme';
import { flip, t } from '@/lib/i18n';

/** Filled seats in the app's ink, free ones in the brand colour: "how full is it" at a glance. */
export function SeatIcons({ total, taken, size = 16 }: { total: number; taken: number; size?: number }) {
  return (
    <View accessible accessibilityLabel={t('{0} مقاعد فاضية من {1}', [String(Math.max(0, total - taken)), String(total)])} style={{ flexDirection: 'row', gap: 3 }}>
      {Array.from({ length: total }, (_, i) => (
        <Armchair key={i} size={size} color={i < taken ? C.faint : C.primary} fill={i < taken ? 'transparent' : C.primarySoft} strokeWidth={2.2} />
      ))}
    </View>
  );
}

/** A ride in the feed (or a "بدي توصيلة" ask). `action` is the button / status on the right edge (ask, pending, my requests…). */
export function RideCard({ ride, mine, onPress, action }: { ride: Ride; mine: boolean; onPress: () => void; action?: React.ReactNode }) {
  const need = ride.kind === 'need';
  const free = seatsLeft(ride);
  const route = routeLabel(ride);
  return (
    <Tap haptic={false} scale={0.985} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${need ? t('بدي توصيلة') : ''} ${route} ${timeLabel(ride.depart_at)}`}
      style={[{ backgroundColor: C.card, borderRadius: 26, padding: 14, gap: 12 }, shadow]}>
      <Row gap={12} center={false}>
        <View style={{ alignItems: 'center', minWidth: 64, paddingTop: 2 }}>
          <T style={{ fontFamily: F.display, fontSize: 22, lineHeight: 28 }}>{timeLabel(ride.depart_at)}</T>
          {need
            ? <T v="tiny" color={free ? C.orangeInk : C.greenInk}>{free ? t('بدو توصيلة') : t('لقى حدا')}</T>
            : <T v="tiny" color={free ? C.greenInk : C.muted}>{free ? t('{0} فاضي', [String(free)]) : t('مليانة')}</T>}
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Row gap={6}>
            <Image source={EMOJI.pin} style={{ width: 20, height: 20 }} contentFit="contain" />
            <T v="bold" numberOfLines={2} style={{ flexShrink: 1, fontSize: 16 }}>{route}</T>
          </Row>
          {ride.campus_spot ? <T v="small" color={C.ink2} numberOfLines={1}>{t('بالجامعة: {0}', [ride.campus_spot])}</T> : null}
          {ride.meet_point ? <T v="small" color={C.ink2} numberOfLines={1}>{t('نقطة التجمّع: {0}', [ride.meet_point])}</T> : null}
          <Row gap={10}>
            {need ? <T v="tiny" color={C.ink2}>{t('{0} أشخاص', [String(ride.seats_total)])}</T> : <SeatIcons total={ride.seats_total} taken={ride.seats_taken} />}
            <View style={{ backgroundColor: Number(ride.price_jod) > 0 ? C.orangeSoft : C.greenSoft, borderRadius: 999, paddingHorizontal: 9, height: 22, justifyContent: 'center' }}>
              <T v="tiny" color={Number(ride.price_jod) > 0 ? C.orangeInk : C.greenInk} style={{ fontFamily: F.bodyBold }}>{priceLabel(ride.price_jod)}</T>
            </View>
          </Row>
        </View>
        <ChevronLeft size={18} color={C.faint} style={[{ marginTop: 6 }, flip]} />
      </Row>
      <Row gap={10} style={{ borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
        <Avatar id={ride.driver_id} name={ride.driver_name} url={ride.driver_avatar} size={34} />
        <View style={{ flex: 1 }}>
          <Row gap={4}>
            <T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1 }}>{mine ? (need ? t('طلبك') : t('توصيلتك')) : titledName(ride.driver_name, ride.driver_title, ride.driver_title_verified)}</T>
            {!mine && ride.driver_verified && <BadgeCheck size={14} color={C.white} fill={C.verified} />}
            {!mine && <TitleBadge title={ride.driver_title} verified={ride.driver_title_verified} />}
          </Row>
          {!mine && ride.driver_username ? <T v="tiny" color={C.muted}>{`⁦@${ride.driver_username}⁩`}</T> : null}
        </View>
        {action}
      </Row>
    </Tap>
  );
}
