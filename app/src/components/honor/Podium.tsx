import { Image } from 'expo-image';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { FRAME_COLORS, FRAME_GLOW, type FrameLevel } from '@/lib/frames';
import { C, F, isDark, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

/** One line of honor_board (0109). user_id is null for someone on a nickname; gpa is only ever mine. */
export type HonorRow = {
  rank: number; user_id: string | null; full_name: string; username: string | null; avatar_url: string | null;
  major: string | null; gpa: number | null; move: number | null; is_me: boolean; total: number; frame: FrameLevel | null;
};

export const openHonorRow = (r: HonorRow) => { if (r.user_id) router.push({ pathname: '/user/[id]', params: { id: r.user_id } }); };

export const HONOR_EMOJI = {
  crown: require('../../../assets/emoji3d/crown_3d.png'),
  sparkles: require('../../../assets/emoji3d/sparkles_3d.png'),
  trophy: require('../../../assets/emoji3d/trophy_3d.png'),
  m1: require('../../../assets/emoji3d/1st_place_medal_3d.png'),
  m2: require('../../../assets/emoji3d/2nd_place_medal_3d.png'),
  m3: require('../../../assets/emoji3d/3rd_place_medal_3d.png'),
};

// the same metals as the frames on avatars everywhere else
const METAL: FrameLevel[] = ['gold', 'silver', 'bronze'];
const GLOW = [FRAME_GLOW, 'rgba(200,210,225,0.45)', 'rgba(214,132,72,0.45)'];
const MEDAL = [HONOR_EMOJI.m1, HONOR_EMOJI.m2, HONOR_EMOJI.m3];
const ring = (i: number) => FRAME_COLORS[METAL[Math.min(i, 2)]];

function Framed({ r, place }: { r: HonorRow; place: number }) {
  const i = place - 1;
  const first = place === 1;
  const size = first ? 100 : 78;
  return (
    <View style={{ alignItems: 'center', width: size + 40 }}>
      <Image source={HONOR_EMOJI.crown} style={{ width: first ? 54 : 34, height: first ? 54 : 34, marginBottom: first ? -18 : -12, zIndex: 3 }} contentFit="contain" />
      {first && <Image source={HONOR_EMOJI.sparkles} style={{ position: 'absolute', top: 18, right: 2, width: 30, height: 30, zIndex: 3 }} />}
      {first && <Image source={HONOR_EMOJI.sparkles} style={{ position: 'absolute', top: 70, left: 0, width: 22, height: 22, zIndex: 3, transform: [{ scaleX: -1 }] }} />}
      <View style={{ shadowColor: GLOW[i], shadowOpacity: 1, shadowRadius: first ? 22 : 14, shadowOffset: { width: 0, height: 0 }, elevation: 10, borderRadius: size }}>
        <LinearGradient colors={ring(i)} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={{ padding: first ? 5 : 4, borderRadius: size }}>
          <View style={{ padding: 3, borderRadius: size, backgroundColor: C.card }}>
            <Avatar id={r.user_id} name={r.full_name} url={r.avatar_url} size={size} frame={null} />
          </View>
        </LinearGradient>
      </View>
      <Image source={MEDAL[i]} style={{ width: first ? 46 : 38, height: first ? 46 : 38, marginTop: -26, zIndex: 3 }} contentFit="contain" />
    </View>
  );
}

/** Top three on a podium: silver · gold · bronze (ties keep their real rank, colours follow the place). No GPAs. */
export function Podium({ rows, title }: { rows: HonorRow[]; title: string }) {
  const top = rows.slice(0, 3);
  if (!top.length) return null;
  const order = top.length === 1 ? [0] : top.length === 2 ? [1, 0] : [1, 0, 2];
  return (
    <LinearGradient colors={isDark ? ['#1E2556', '#121636'] : ['#FFF8E6', '#FFFFFF']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
      style={[{ borderRadius: 30, paddingTop: 18, paddingHorizontal: 6, overflow: 'hidden' }, shadow]}>
      <Row gap={6} style={{ alignSelf: 'center', marginBottom: 4, paddingHorizontal: 12 }}>
        <Image source={HONOR_EMOJI.trophy} style={{ width: 22, height: 22 }} />
        <T v="small" numberOfLines={1} color={isDark ? '#FFD34D' : '#9A6700'} style={{ fontFamily: F.bodyBold, flexShrink: 1 }}>{title}</T>
      </Row>
      <Row gap={0} center={false} style={{ alignItems: 'flex-end', justifyContent: 'space-around', marginTop: 8 }}>
        {order.map((idx) => {
          const r = top[idx]; const place = idx + 1;
          return (
            <Tap key={`${r.rank}-${r.full_name}`} haptic={false} scale={0.97} onPress={() => openHonorRow(r)} disabled={!r.user_id}
              accessibilityLabel={t('المركز {0}: {1}', [r.rank, r.full_name])}
              style={{ alignItems: 'center', width: '33%' }}>
              <Framed r={r} place={place} />
              <T v="bodyMd" numberOfLines={1} style={{ marginTop: 4, maxWidth: '96%' }}>{r.full_name.split(' ').slice(0, 2).join(' ')}</T>
              <T v="tiny" color={C.muted} numberOfLines={1} style={{ maxWidth: '96%' }}>{r.major ?? ' '}</T>
              <LinearGradient colors={ring(idx)} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={{ marginTop: 10, width: '92%', height: place === 1 ? 96 : place === 2 ? 74 : 60, borderTopLeftRadius: 18, borderTopRightRadius: 18, alignItems: 'center', paddingTop: 10, gap: 2 }}>
                <T style={{ fontFamily: F.display, fontSize: place === 1 ? 30 : 24, color: '#2A1B00', lineHeight: place === 1 ? 34 : 28 }}>{r.rank}</T>
              </LinearGradient>
            </Tap>
          );
        })}
      </Row>
    </LinearGradient>
  );
}
