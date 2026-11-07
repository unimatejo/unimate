import { ArrowUp, ArrowUpLeft, ArrowUpRight, CornerUpLeft, CornerUpRight, Flag, Footprints, Navigation, Undo2, X, type LucideIcon } from 'lucide-react-native';
import { View } from 'react-native';
import Animated, { FadeIn, FadeInUp, FadeOut, SlideInDown } from 'react-native-reanimated';

import { Row, T, Tap } from '@/components/ui';
import { GlyphTile } from '@/components/ui/Glyph';
import type { Step } from '@/lib/campus/route';
import { t } from '@/lib/i18n';
import { C, F, shadow } from '@/lib/theme';

import { kindOf } from './kinds';

const TURN: Record<Step['turn'], LucideIcon> = {
  start: ArrowUp, left: CornerUpLeft, right: CornerUpRight, 'slight-left': ArrowUpLeft, 'slight-right': ArrowUpRight, back: Undo2, arrive: Flag,
};
const meters = (m: number) => (m >= 1000 ? t('{0} كم', [(m / 1000).toFixed(1)]) : t('{0} م', [Math.max(1, Math.round(m / 5) * 5)]));

/** The big direction at the top while walking: what to do next and in how many metres. */
export function DirectionBanner({ step, toNext, from }: { step: Step; toNext: number; from: 'me' | 'gate' }) {
  const Icon = TURN[step.turn];
  const now = step.turn === 'arrive' ? toNext < 15 : toNext < 8;
  return (
    <Animated.View entering={FadeInUp.duration(220)} accessibilityLiveRegion="polite"
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.primary, borderRadius: 22, padding: 14 }, shadow]}>
      <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={30} color={C.onPrimary} strokeWidth={2.6} />
      </View>
      <View style={{ flex: 1 }}>
        <T style={{ fontFamily: F.display, fontSize: 20, lineHeight: 28 }} color={C.onPrimary} numberOfLines={2}>
          {now ? step.text : t('بعد {0}، {1}', [meters(toNext), step.text])}
        </T>
        {from === 'gate' && <T v="tiny" color={C.onPrimary} style={{ opacity: 0.9 }}>{t('من البوابة الرئيسية · فعّل موقعك عشان يبلّش من مكانك')}</T>}
      </View>
    </Animated.View>
  );
}

/** The card at the bottom: where I'm going (building, floor, room), how far and how long, and the controls. */
/**
 * The walking card. `following` (walking from where I am): the camera rides along above me; moving the map by hand
 * stops that and «إعادة التوسط» appears above the card, like Google Maps, to put the camera back over me.
 */
export function NavCard({ name, kind, building, floor, room, left, minutes, straight, following, onRecenter, onPreview, onEnd }: {
  name: string; kind: string; building?: string | null; floor?: number | null; room?: string | null; left: number; minutes: number; straight: boolean;
  following: boolean | null; onRecenter: () => void; onPreview: () => void; onEnd: () => void;
}) {
  const k = kindOf(kind);
  const where = [building && building !== name ? building : null, floor != null ? (floor === 0 ? t('الطابق الأرضي') : t('الطابق {0}', [floor])) : null, room ? t('قاعة {0}', [room]) : null].filter(Boolean).join(' · ');
  const btn = { flex: 1, flexDirection: 'row', gap: 8, minHeight: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <Animated.View entering={SlideInDown.duration(240)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 30, padding: 16, paddingTop: 10, gap: 12 }, shadow]}>
      {following === false && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(140)} style={{ position: 'absolute', top: -62, alignSelf: 'center' }}>
          <Tap onPress={onRecenter} accessibilityRole="button" accessibilityLabel={t('إعادة التوسط')}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 18, borderRadius: 23, backgroundColor: C.card }, shadow]}>
            <Navigation size={18} color={C.primary} fill={C.primary} /><T v="bodyMd" color={C.primary}>{t('إعادة التوسط')}</T>
          </Tap>
        </Animated.View>
      )}
      <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
      <Row gap={12}>
        <GlyphTile icon={k.icon} colors={k.g} size={52} />
        <View style={{ flex: 1 }}>
          <T v="h2" numberOfLines={2}>{name}</T>
          <T v="small" color={C.muted} numberOfLines={2}>{where || k.label}</T>
        </View>
        <Tap onPress={onEnd} accessibilityLabel={t('إنهاء الطريق')} style={{ padding: 6 }}><X size={22} color={C.muted} /></Tap>
      </Row>
      <Row gap={10}>
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.primarySoft, borderRadius: 16, padding: 10 }}>
          <T style={{ fontFamily: F.display, fontSize: 22 }} color={C.primary}>{minutes}</T>
          <T v="tiny" color={C.ink2}>{t('دقايق مشي')}</T>
        </View>
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: C.soft, borderRadius: 16, padding: 10 }}>
          <T style={{ fontFamily: F.display, fontSize: 22 }}>{meters(left)}</T>
          <T v="tiny" color={C.ink2}>{t('المسافة')}</T>
        </View>
      </Row>
      {straight && <T v="tiny" color={C.muted}>{t('ما في ممرات مرسومة لهون، فهاد خط مباشر تقريبي.')}</T>}
      <Tap onPress={onPreview} accessibilityLabel={t('شوف الطريق مشي')} style={[btn, { flex: undefined, backgroundColor: C.soft }]}>
        <Footprints size={18} color={C.ink} /><T v="bodyMd">{t('شوف الطريق')}</T>
      </Tap>
    </Animated.View>
  );
}
