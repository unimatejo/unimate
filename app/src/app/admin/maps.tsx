import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Act, AdminScreen, Filters, Muted, Panel, Pill, State, confirm, done, fmtDate, fmtNum, go, useLoad } from '@/components/admin/kit';
import { Row, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { nm, t } from '@/lib/i18n';

type Stats = { buildings?: number; approx?: number; paths?: number; trees?: number; green?: number; outline?: boolean };
type U = { id: string; name_ar: string; name_en: string | null; has_center: boolean; buildings: number; places: number; pending: number;
  stats: Stats | null; error: string | null; fetched_at: string | null; version: number };
type Level = 'ready' | 'mid' | 'thin' | 'none';

/** How complete a campus map is, from what students will actually see: named buildings, real 3D outlines, places. */
function level(u: U): Level {
  if (!u.has_center || !u.version) return 'none';
  const real = (u.stats?.buildings ?? 0) - (u.stats?.approx ?? 0);
  if (u.buildings >= 15 && u.places >= 8 && real >= u.buildings / 2) return 'ready';
  if (u.buildings <= 4 && u.places <= 5) return 'thin';
  return 'mid';
}
const LEVEL: Record<Level, { label: string; tone: string }> = {
  ready: { label: t('جاهزة'), tone: 'green' }, mid: { label: t('متوسطة'), tone: 'orange' }, thin: { label: t('ناقصة'), tone: 'red' }, none: { label: t('ما إلها خريطة'), tone: '' },
};

/** Every university's campus map: how complete it is, open it as its students see it, or rebuild it now. */
export default function AdminMaps() {
  const { data, loading, error, reload } = useLoad<U[]>(() => supabase.rpc('admin_campus_overview') as never, []);
  const [f, setF] = useState<'all' | Level>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const rows = useMemo(() => (data ?? []).map((u) => ({ ...u, lv: level(u) })), [data]);
  const count = (l: Level) => rows.filter((u) => u.lv === l).length;
  const shown = rows.filter((u) => f === 'all' || u.lv === f);

  async function rebuild(u: U) {
    if (!(await confirm(t('تبني خريطة «{0}» من جديد؟', [nm(u)]), t('بتاخد دقيقة تقريباً. الطلاب بيشوفوا الخريطة الجديدة أول ما تخلص.'), t('ابنيها')))) return;
    setBusy(u.id);
    const { error: e } = await supabase.rpc('admin_campus_rebuild', { p_university: u.id });
    setBusy(null);
    if (!e) { done(); setTimeout(reload, 60000); }
  }

  return (
    <AdminScreen title={t('خرائط الجامعات')} subtitle={t('اكبس على أي جامعة وشوف خريطتها زي ما بيشوفها طلابها')}>
      <Filters items={[['all', t('الكل · {0}', [fmtNum(rows.length)])], ['ready', t('جاهزة · {0}', [fmtNum(count('ready'))])], ['mid', t('متوسطة · {0}', [fmtNum(count('mid'))])],
        ['thin', t('ناقصة · {0}', [fmtNum(count('thin'))])], ['none', t('بدون خريطة · {0}', [fmtNum(count('none'))])]]} value={f} onChange={setF} />
      <State loading={loading} error={error} empty={!shown.length}>
        <View style={{ gap: 10 }}>
          {shown.map((u) => {
            const s = u.stats ?? {};
            const real = (s.buildings ?? 0) - (s.approx ?? 0);
            return (
              <Panel key={u.id} onPress={u.lv === 'none' ? undefined : () => go(`/map?uni=${u.id}`)}>
                <Row gap={8}>
                  <T v="bold" style={{ flex: 1 }} numberOfLines={2}>{nm(u)}</T>
                  <Pill label={LEVEL[u.lv].label} tone={LEVEL[u.lv].tone} />
                </Row>
                {u.lv === 'none' ? (
                  <Muted>{u.has_center ? t('لسا ما انبنت خريطتها.') : t('ما إلها مركز حرم. ضيفه من «الجامعات والخرائط» وبعدين ابني الخريطة.')}</Muted>
                ) : (
                  <T v="small" color={C.ink2}>
                    {t('{0} مبنى بالاسم · {1} مبنى ثلاثي الأبعاد · {2} تقريبي · {3} مكان وخدمة', [fmtNum(u.buildings), fmtNum(real), fmtNum(s.approx ?? 0), fmtNum(u.places)])}
                  </T>
                )}
                {u.lv !== 'none' && (
                  <Muted>
                    {[t('{0} ممر وطريق', [fmtNum(s.paths ?? 0)]), s.trees ? t('{0} شجرة', [fmtNum(s.trees)]) : null, s.outline ? t('حدود الحرم معروفة') : t('حدود الحرم مش معروفة'),
                      u.pending ? t('{0} اقتراح بستنى', [fmtNum(u.pending)]) : null, t('آخر بناء {0}', [fmtDate(u.fetched_at)])].filter(Boolean).join(' · ')}
                  </Muted>
                )}
                {u.error ? <T v="tiny" color={C.red}>{t('آخر محاولة فشلت: {0}', [u.error])}</T> : null}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  {u.lv !== 'none' && <Act label={t('افتح الخريطة')} kind="primary" onPress={() => go(`/map?uni=${u.id}`)} />}
                  {u.has_center && <Act label={busy === u.id ? t('بيبني…') : t('ابنيها من جديد')} loading={busy === u.id} onPress={() => rebuild(u)} />}
                </Row>
              </Panel>
            );
          })}
        </View>
      </State>
    </AdminScreen>
  );
}
