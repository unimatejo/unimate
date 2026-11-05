import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react-native';
import { View } from 'react-native';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { C, F, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

import type { HonorRow } from './Podium';

function Move({ v, light }: { v: number | null; light?: boolean }) {
  if (!v) return <Minus size={14} color={light ? 'rgba(255,255,255,0.8)' : C.faint} />;
  const up = v > 0;
  const color = light ? C.onPrimary : up ? C.greenInk : C.red;
  return (
    <View accessible accessibilityLabel={up ? t('طلع {0}', [Math.abs(v)]) : t('نزل {0}', [Math.abs(v)])} style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      {up ? <ArrowUp size={14} color={color} strokeWidth={2.6} /> : <ArrowDown size={14} color={color} strokeWidth={2.6} />}
      <T v="tiny" color={color} style={{ fontFamily: F.bodyBold }}>{Math.abs(v)}</T>
    </View>
  );
}

/** Ranks 4 and down. */
export function HonorList({ rows }: { rows: HonorRow[] }) {
  if (!rows.length) return null;
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 24, paddingVertical: 6 }, shadow]}>
      {rows.map((r, i) => (
        <Tap key={r.user_id} haptic={false} scale={0.99} onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.user_id } })}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 66, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: r.is_me ? C.primarySoft : 'transparent' }}>
          <T style={{ fontFamily: F.display, fontSize: 18, width: 30, textAlign: 'center' }} color={C.ink2}>{r.rank}</T>
          <Avatar id={r.user_id} name={r.full_name} url={r.avatar_url} size={46} />
          <View style={{ flex: 1 }}>
            <T v="bodyMd" numberOfLines={1}>{r.full_name}{r.is_me ? ` · ${t('إنت')}` : ''}</T>
            {!!r.major && <T v="tiny" color={C.muted} numberOfLines={1}>{r.major}</T>}
          </View>
          <Move v={r.move} />
          <T style={{ fontFamily: F.display, fontSize: 19, minWidth: 48, textAlign: 'left' }}>{r.gpa.toFixed(2)}</T>
        </Tap>
      ))}
    </View>
  );
}

/** Sticky "your place" bar with the gap to the person right above. */
export function MyPlace({ me, above, scopeName }: { me: HonorRow; above: HonorRow | null; scopeName: string }) {
  const diff = above ? Math.max(0.01, Math.round((above.gpa - me.gpa) * 100) / 100) : 0;
  const line = me.rank === 1
    ? t('إنت الأول! حافظ على مكانك 👑')
    : above ? t('ضلّك {0} بس وبتتعدّى {1} 🔥', [diff.toFixed(2), above.full_name.split(' ')[0]]) : '';
  return (
    <LinearGradient colors={[C.primary, '#FF9A80']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: 24, padding: 14 }, shadow]}>
      <Row gap={12}>
        <View style={{ alignItems: 'center', minWidth: 48 }}>
          <T style={{ fontFamily: F.display, fontSize: 24, color: C.onPrimary, lineHeight: 28 }}>#{me.rank}</T>
          <Move v={me.move} light />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyMd" color={C.onPrimary} numberOfLines={1}>{t('معدلك {0} · من {1} طالب', [me.gpa.toFixed(2), me.total])}</T>
          {!!line && <T v="tiny" color={C.onPrimary} style={{ opacity: 0.92 }} numberOfLines={1}>{line}</T>}
        </View>
      </Row>
    </LinearGradient>
  );
}
