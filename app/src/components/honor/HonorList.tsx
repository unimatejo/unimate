import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react-native';
import { View } from 'react-native';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { C, F, shadow } from '@/lib/theme';
import { t } from '@/lib/i18n';

import { openHonorRow, type HonorRow } from './Podium';

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

/** Ranks 4 to 10 (and me, if I'm further down). Names and frames only, never a GPA. */
export function HonorList({ rows }: { rows: HonorRow[] }) {
  if (!rows.length) return null;
  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 24, paddingVertical: 6 }, shadow]}>
      {rows.map((r, i) => (
        <Tap key={`${r.rank}-${r.full_name}`} haptic={false} scale={0.99} onPress={() => openHonorRow(r)} disabled={!r.user_id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 66, borderTopWidth: i ? 1 : 0, borderTopColor: C.line, backgroundColor: r.is_me ? C.primarySoft : 'transparent' }}>
          <T style={{ fontFamily: F.display, fontSize: 18, width: 30, textAlign: 'center' }} color={C.ink2}>{r.rank}</T>
          <Avatar id={r.user_id} name={r.full_name} url={r.avatar_url} size={46} frame={r.frame} />
          <View style={{ flex: 1 }}>
            <T v="bodyMd" numberOfLines={1}>{r.full_name}{r.is_me ? ` · ${t('إنت')}` : ''}</T>
            {!!r.major && <T v="tiny" color={C.muted} numberOfLines={1}>{r.major}</T>}
          </View>
          <Move v={r.move} />
        </Tap>
      ))}
    </View>
  );
}

/** Sticky "your place" card: my rank, my own GPA (only I see it), and nothing about anybody else. */
export function MyPlace({ me }: { me: HonorRow }) {
  const line = me.rank === 1 ? t('إنت الأول! حافظ على مكانك 👑')
    : me.rank <= 3 ? t('إنت من أول 3 🔥') : me.rank <= 10 ? t('إنت من العشرة الأوائل ✨') : t('كمّل، العشرة الأوائل بيطلعوا هون');
  return (
    <LinearGradient colors={[C.primary, '#FF9A80']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[{ borderRadius: 24, padding: 14 }, shadow]}>
      <Row gap={12}>
        <View style={{ alignItems: 'center', minWidth: 48 }}>
          <T style={{ fontFamily: F.display, fontSize: 24, color: C.onPrimary, lineHeight: 28 }}>#{me.rank}</T>
          <Move v={me.move} light />
        </View>
        <View style={{ flex: 1 }}>
          <T v="bodyMd" color={C.onPrimary} numberOfLines={1}>{t('مكانك من {0} طالب', [me.total])}{me.gpa != null ? ` · ${t('معدلك {0}', [me.gpa.toFixed(2)])}` : ''}</T>
          <T v="tiny" color={C.onPrimary} style={{ opacity: 0.92 }} numberOfLines={1}>{line}</T>
        </View>
      </Row>
    </LinearGradient>
  );
}
