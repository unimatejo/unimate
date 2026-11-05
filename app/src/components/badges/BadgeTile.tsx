import { Image } from 'expo-image';
import { View } from 'react-native';

import { T } from '../ui';
import { BADGES, EMOJI, progressLabel, progressPct, type BadgeState } from '@/lib/badges';
import { C, F } from '@/lib/theme';

/** One badge as a 3D emoji in a soft circle. Locked = faded with a small lock; `showProgress` adds a bar. */
export function BadgeIcon({ b, size = 52 }: { b: BadgeState; size?: number }) {
  const info = BADGES[b.key];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: b.earned ? C.orangeSoft : C.soft, alignItems: 'center', justifyContent: 'center' }}>
      <Image source={info.img} style={{ width: size * 0.66, height: size * 0.66, opacity: b.earned ? 1 : 0.35 }} contentFit="contain" />
      {!b.earned && (
        <View style={{ position: 'absolute', bottom: -2, end: -2, width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={EMOJI.locked} style={{ width: size * 0.28, height: size * 0.28 }} contentFit="contain" />
        </View>
      )}
    </View>
  );
}

export function BadgeLine({ b, showProgress }: { b: BadgeState; showProgress?: boolean }) {
  const info = BADGES[b.key];
  const pl = progressLabel(b);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.field, borderRadius: 18, padding: 10 }}>
      <BadgeIcon b={b} size={54} />
      <View style={{ flex: 1, gap: 4 }}>
        <T v="bold" color={b.earned ? C.ink : C.ink2}>{info.name}</T>
        <T v="tiny" color={C.muted}>{info.how}</T>
        {showProgress && !b.earned && pl ? (
          <View style={{ gap: 3 }}>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: C.soft, overflow: 'hidden' }}>
              <View style={{ width: `${Math.round(progressPct(b) * 100)}%`, height: 6, borderRadius: 3, backgroundColor: C.orange }} />
            </View>
            <T v="tiny" color={C.muted} style={{ fontFamily: F.bodyBold }}>{pl}</T>
          </View>
        ) : null}
      </View>
    </View>
  );
}
