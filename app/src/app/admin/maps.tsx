import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Filters, Muted, Panel, Pill, Sheet, State, audit, confirm, done, fmtDate, fmtNum, go, useAdminRole, useLoad } from '@/components/admin/kit';
import { kindOf } from '@/components/map/kinds';
import { Row, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { nm, t } from '@/lib/i18n';

type Stats = { buildings?: number; approx?: number; paths?: number; trees?: number; green?: number; outline?: boolean; outlines?: number };
type U = { id: string; name_ar: string; name_en: string | null; has_center: boolean; buildings: number; places: number; pending: number;
  stats: Stats | null; error: string | null; fetched_at: string | null; version: number };
type Level = 'ready' | 'mid' | 'thin' | 'none';
type Suggestion = { id: string; name_ar: string; kind: string; description: string | null; lat: number; lng: number; created_at: string; by: { full_name: string } | null };

/** One university's places suggested by its students: look at each on its own map, then accept or reject (owner). */
function Suggestions({ u, onChanged }: { u: U; onChanged: () => void }) {
  const owner = useAdminRole() === 'owner';
  const { data, loading, error, reload } = useLoad<Suggestion[]>(() => supabase.from('places').select('id, name_ar, kind, description, lat, lng, created_at, by:profiles!places_created_by_fkey(full_name)')
    .eq('university_id', u.id).eq('state', 'pending').order('created_at') as never, [u.id]);
  async function decide(id: string, state: 'approved' | 'rejected') {
    const { error: e } = await supabase.from('places').update({ state }).eq('id', id);
    if (e) return;
    await audit(`${state}_places`, 'places', id, { university: u.id }); done(); reload(); onChanged();
  }
  return (
    <State loading={loading} error={error} empty={!data?.length}>
      <View style={{ gap: 10 }}>
        {(data ?? []).map((p) => (
          <Panel key={p.id}>
            <Row gap={8}><T v="bold" style={{ flex: 1 }}>{p.name_ar}</T><Pill label={kindOf(p.kind).label} /></Row>
            {p.description ? <T v="small" color={C.ink2}>{p.description}</T> : null}
            <Muted>{[p.by?.full_name, fmtDate(p.created_at)].filter(Boolean).join(' · ')}</Muted>
            <Actions>
              <Act label={t('شوف عالخريطة')} onPress={() => go(`/map?uni=${u.id}&lat=${p.lat}&lng=${p.lng}&name=${encodeURIComponent(p.name_ar)}`)} />
              {owner && <Act label={t('اقبل')} kind="green" onPress={() => decide(p.id, 'approved')} />}
              {owner && <Act label={t('ارفض')} onPress={() => decide(p.id, 'rejected')} />}
            </Actions>
          </Panel>
        ))}
        {!owner && <Muted>{t('القبول والرفض للمالك بس.')}</Muted>}
      </View>
    </State>
  );
}

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

/** One number of a campus: red when it's far from enough, orange on the way, green when it's there. */
function Gauge({ n, label, good, ok, invert }: { n: number; label: string; good: number; ok: number; invert?: boolean }) {
  const tone = invert ? (n > 0 ? [C.greenSoft, C.greenInk] : [C.soft, C.muted]) : n >= good ? [C.greenSoft, C.greenInk] : n >= ok ? [C.orangeSoft, C.orangeInk] : [C.redSoft, C.red];
  return (
    <View style={{ flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 8, backgroundColor: tone[0] }}>
      <T v="h3" color={tone[1]}>{fmtNum(n)}</T>
      <T v="tiny" color={tone[1]}>{label}</T>
    </View>
  );
}

/** Every university's campus map: how complete it is, open it as its students see it, or rebuild it now. */
export default function AdminMaps() {
  const { data, loading, error, reload } = useLoad<U[]>(() => supabase.rpc('admin_campus_overview') as never, []);
  const [f, setF] = useState<'all' | Level>('all');
  const [order, setOrder] = useState<'missing' | 'name'>('missing');
  const [busy, setBusy] = useState<string | null>(null);
  const [review, setReview] = useState<U | null>(null);
  const rows = useMemo(() => (data ?? []).map((u) => ({ ...u, lv: level(u) })), [data]);
  const count = (l: Level) => rows.filter((u) => u.lv === l).length;
  // the emptiest campuses first, so it's clear who still needs buildings and places
  const shown = rows.filter((u) => f === 'all' || u.lv === f)
    .sort((a, b) => (order === 'name' ? 0 : a.buildings + a.places - (b.buildings + b.places)));

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
      <Filters items={[['missing', t('الأنقص أولاً')], ['name', t('بالاسم')]]} value={order} onChange={setOrder} />
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
                <Row gap={8}>
                  <Gauge n={u.buildings} label={t('مبنى')} good={15} ok={5} />
                  <Gauge n={u.places} label={t('مكان وخدمة')} good={20} ok={8} />
                  <Gauge n={u.pending} label={t('اقتراح بيستنى')} good={1} ok={1} invert />
                </Row>
                {u.lv === 'none' ? (
                  <Muted>{u.has_center ? t('لسا ما انبنت خريطتها.') : t('ما إلها مركز حرم. ضيفه من «الجامعات والخرائط» وبعدين ابني الخريطة.')}</Muted>
                ) : (
                  <T v="small" color={C.ink2}>{t('{0} مبنى ثلاثي الأبعاد · {1} تقريبي', [fmtNum(real), fmtNum(s.approx ?? 0)])}</T>
                )}
                {u.lv !== 'none' && (
                  <Muted>
                    {[t('{0} ممر وطريق', [fmtNum(s.paths ?? 0)]), s.trees ? t('{0} شجرة', [fmtNum(s.trees)]) : null, s.outline ? ((s.outlines ?? 1) > 1 ? t('{0} حدود حرم معروفة', [fmtNum(s.outlines ?? 1)]) : t('حدود الحرم معروفة')) : t('حدود الحرم مش معروفة'),
                      t('آخر بناء {0}', [fmtDate(u.fetched_at)])].filter(Boolean).join(' · ')}
                  </Muted>
                )}
                {u.error ? <T v="tiny" color={C.red}>{t('آخر محاولة فشلت: {0}', [u.error])}</T> : null}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  {u.lv !== 'none' && <Act label={t('افتح الخريطة')} kind="primary" onPress={() => go(`/map?uni=${u.id}`)} />}
                  {u.pending > 0 && <Act label={t('اقتراحات الطلاب · {0}', [fmtNum(u.pending)])} kind="green" onPress={() => setReview(u)} />}
                  {u.has_center && <Act label={busy === u.id ? t('بيبني…') : t('ابنيها من جديد')} loading={busy === u.id} onPress={() => rebuild(u)} />}
                </Row>
              </Panel>
            );
          })}
        </View>
      </State>
      <Sheet open={!!review} onClose={() => setReview(null)} title={review ? t('اقتراحات طلاب {0}', [nm(review)]) : undefined}>
        {review && <Suggestions u={review} onChanged={reload} />}
      </Sheet>
    </AdminScreen>
  );
}
