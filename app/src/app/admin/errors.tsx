import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { explain, errorKey, type Explained, type Weight } from '@/components/admin/errorText';
import { AdminScreen, Filters, Muted, Panel, Pill, Section, State, fmtDate, fmtNum, useLoad } from '@/components/admin/kit';
import { T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type E = { id: number; fatal: boolean; message: string; stack: string | null; screen: string | null; platform: string | null; app_version: string | null; created_at: string; user: { full_name: string } | null };
type PerfGroup = { kind: 'screen' | 'query'; name: string; n: number; p50: number; p90: number };
type PerfSlow = { kind: string; name: string; ms: number; platform: string | null; at: string };
type Perf = { groups: PerfGroup[]; slowest: PerfSlow[] };

const SCREEN: Record<string, string> = { home: t('الرئيسية'), feed: t('المجتمع'), inbox: t('الرسائل'), chat: t('المحادثة'), profile: t('الملف الشخصي'), schedule: t('الجدول') };
const sec = (ms: number) => `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${t('ث')}`;
// green under 1.5s, orange under 3s, red above
const tone = (ms: number) => (ms < 1500 ? 'green' : ms < 3000 ? 'orange' : 'red');

const WEIGHT: Record<Weight, [string, string]> = { fix: [t('يحتاج إصلاحًا'), 'red'], watch: [t('للمتابعة'), 'orange'], fine: [t('يُحل تلقائيًا'), 'green'] };
const ORDER: Record<Weight, number> = { fix: 0, watch: 1, fine: 2 };
/** where it happened, in words: the screen and the kind of phone */
const PLACE: Record<string, string> = {
  '(tabs)': t('الشاشات الرئيسية'), '(auth)/login': t('تسجيل الدخول'), 'post/[id]': t('صفحة منشور'), 'story/[id]': t('القصص'),
  '(chat)/messages/[id]': t('محادثة'), '(chat)/messages': t('الرسائل'), '(campus)/map': t('الخريطة'), 'post/new': t('إنشاء منشور'),
};
const DEVICE: Record<string, string> = { ios: t('آيفون'), android: t('أندرويد'), web: t('المتصفح') };

/**
 * Errors from students' phones, the same problem counted once: its plain Arabic name, what it means, and whether
 * it needs fixing. The technical text (English) opens with a tap, for whoever fixes it.
 */
function Errors() {
  const { data, loading, error } = useLoad<E[]>(() => supabase.from('client_errors').select('*, user:profiles!client_errors_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(300) as never, []);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const m = new Map<string, { key: string; ex: Explained; rows: E[] }>();
    for (const e of data ?? []) {
      const key = errorKey(e.message);
      const g = m.get(key) ?? { key, ex: explain(e.message), rows: [] };
      g.rows.push(e); m.set(key, g);
    }
    return [...m.values()].sort((a, b) => Number(b.rows.some((r) => r.fatal)) - Number(a.rows.some((r) => r.fatal)) || ORDER[a.ex.weight] - ORDER[b.ex.weight] || b.rows.length - a.rows.length);
  }, [data]);
  return (
    <State loading={loading} error={error} empty={groups.length === 0}>
      <View style={{ gap: 8 }}>
        {groups.map(({ key, ex, rows }) => {
          const last = rows[0];
          const where = [...new Set(rows.map((r) => r.screen).filter(Boolean))].slice(0, 3).map((x) => PLACE[x!] ?? x).join('، ');
          const on = [...new Set(rows.map((r) => r.platform).filter(Boolean))].map((x) => DEVICE[x!] ?? x).join('، ');
          return (
            <Tap key={key} onPress={() => setOpen(open === key ? null : key)} scale={0.99} haptic={false}>
              <Panel>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  {rows.some((r) => r.fatal) && <Pill label={t('أغلق التطبيق')} tone="red" />}
                  <Pill label={WEIGHT[ex.weight][0]} tone={WEIGHT[ex.weight][1]} />
                  <Pill label={t('{0} مرة', [fmtNum(rows.length)])} tone="blue" />
                </View>
                <T v="bodyMd">{ex.title}</T>
                <T v="small" color={C.muted}>{ex.what}</T>
                <Muted>{[t('آخر مرة {0}', [fmtDate(last.created_at)]), where && t('في {0}', [where]), on].filter(Boolean).join(' · ')}</Muted>
                {open === key && (
                  <View style={{ gap: 6, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.line }}>
                    <T v="tiny" color={C.muted}>{t('التفاصيل التقنية')}</T>
                    <T v="small" style={{ writingDirection: 'ltr', textAlign: 'left' }} selectable>{last.message}</T>
                    {last.stack ? <T v="tiny" color={C.muted} selectable style={{ writingDirection: 'ltr', textAlign: 'left' }}>{last.stack.slice(0, 1500)}</T> : null}
                    <Muted>{[last.user?.full_name, last.app_version && t('النسخة {0}', [last.app_version])].filter(Boolean).join(' · ')}</Muted>
                  </View>
                )}
              </Panel>
            </Tap>
          );
        })}
      </View>
    </State>
  );
}

/** How fast the app feels for students: time until each key screen shows its data, and slow requests. */
function Performance() {
  const [hours, setHours] = useState<'24' | '168'>('24');
  const { data, loading, error } = useLoad<Perf>(() => supabase.rpc('admin_perf_summary', { hours: Number(hours) }) as never, [hours]);
  const screens = (data?.groups ?? []).filter((g) => g.kind === 'screen');
  const queries = (data?.groups ?? []).filter((g) => g.kind === 'query');
  return (
    <View style={{ gap: 10 }}>
      <Filters items={[['24', t('آخر 24 ساعة')], ['168', t('آخر 7 أيام')]]} value={hours} onChange={setHours} />
      <State loading={loading} error={error} empty={!screens.length && !queries.length}>
        <Section title={t('وقت تحميل الشاشات')} />
        <Panel>
          {screens.map((g) => (
            <View key={g.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
              <T v="bodyMd" style={{ flex: 1 }}>{SCREEN[g.name] ?? g.name}</T>
              <Pill label={`${t('عادة')} ${sec(g.p50)}`} tone={tone(g.p50)} />
              <Pill label={`${t('أبطأ 10%')} ${sec(g.p90)}`} tone={tone(g.p90)} />
              <Muted>{fmtNum(g.n)}</Muted>
            </View>
          ))}
        </Panel>
        {queries.length > 0 && (
          <>
            <Section title={t('طلبات بطيئة (أكثر من ثانيتين)')} />
            <Panel>
              {queries.map((g) => (
                <View key={g.name} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}>
                  <T v="small" style={{ flex: 1, writingDirection: 'ltr', textAlign: 'left' }}>{g.name}</T>
                  <Pill label={sec(g.p50)} tone={tone(g.p50)} />
                  <Muted>{t('{0} مرة', [fmtNum(g.n)])}</Muted>
                </View>
              ))}
            </Panel>
          </>
        )}
        <Section title={t('أبطأ الحالات')} />
        <Panel>
          {(data?.slowest ?? []).map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}>
              <T v="small" style={{ flex: 1 }}>{SCREEN[s.name] ?? s.name}</T>
              <Pill label={sec(s.ms)} tone={tone(s.ms)} />
              <Muted>{[s.platform, fmtDate(s.at)].filter(Boolean).join(' · ')}</Muted>
            </View>
          ))}
        </Panel>
      </State>
    </View>
  );
}

export default function ErrorsAndPerformance() {
  const [tab, setTab] = useState<'errors' | 'perf'>('errors');
  return (
    <AdminScreen ownerOnly title={t('أخطاء التطبيق')} subtitle={t('كل خطأ أو بطء على هواتف الطلاب يصل إلى هنا مشروحًا، ويصلك إشعار فوري إذا أُغلق التطبيق عند أحدهم')}>
      <Filters items={[['errors', t('الأخطاء')], ['perf', t('الأداء')]]} value={tab} onChange={setTab} />
      {tab === 'errors' ? <Errors /> : <Performance />}
    </AdminScreen>
  );
}
