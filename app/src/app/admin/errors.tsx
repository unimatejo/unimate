import { useState } from 'react';
import { View } from 'react-native';

import { AdminScreen, Filters, Muted, Panel, Pill, Section, State, fmtDate, fmtNum, useLoad } from '@/components/admin/kit';
import { T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type E = { id: number; fatal: boolean; message: string; stack: string | null; screen: string | null; platform: string | null; app_version: string | null; created_at: string; user: { full_name: string } | null };
type PerfGroup = { kind: 'screen' | 'query'; name: string; n: number; p50: number; p90: number };
type PerfSlow = { kind: string; name: string; ms: number; platform: string | null; at: string };
type Perf = { groups: PerfGroup[]; slowest: PerfSlow[] };

const SCREEN: Record<string, string> = { home: t('الرئيسية'), feed: t('المجتمع'), inbox: t('الرسائل'), chat: t('المحادثة'), profile: t('البروفايل'), schedule: t('الجدول') };
const sec = (ms: number) => `${(ms / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} ${t('ث')}`;
// green under 1.5s, orange under 3s, red above
const tone = (ms: number) => (ms < 1500 ? 'green' : ms < 3000 ? 'orange' : 'red');

function Errors() {
  const { data, loading, error } = useLoad<E[]>(() => supabase.from('client_errors').select('*, user:profiles!client_errors_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(200) as never, []);
  const [open, setOpen] = useState<number | null>(null);
  return (
    <State loading={loading} error={error} empty={data?.length === 0}>
      <View style={{ gap: 8 }}>
        {(data ?? []).map((e) => (
          <Tap key={e.id} onPress={() => setOpen(open === e.id ? null : e.id)} scale={0.99} haptic={false}>
            <Panel>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {e.fatal && <Pill label={t('خطير')} tone="red" />}
                {e.screen ? <Pill label={e.screen} /> : null}
                {e.platform ? <Pill label={`${e.platform} ${e.app_version ?? ''}`} tone="blue" /> : null}
              </View>
              <T v="small" style={{ writingDirection: 'ltr', textAlign: 'left' }} selectable numberOfLines={open === e.id ? undefined : 3}>{e.message}</T>
              <Muted>{[fmtDate(e.created_at), e.user?.full_name].filter(Boolean).join(' · ')}</Muted>
              {open === e.id && e.stack ? <T v="tiny" color={C.muted} selectable style={{ writingDirection: 'ltr', textAlign: 'left' }}>{e.stack.slice(0, 1500)}</T> : null}
            </Panel>
          </Tap>
        ))}
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
        <Section title={t('وقت فتح الشاشات')} />
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
    <AdminScreen ownerOnly title={t('أخطاء التطبيق')} subtitle={t('أي خطأ أو بطء بيصير على تلفونات الطلاب بيوصل هون لحاله')}>
      <Filters items={[['errors', t('الأخطاء')], ['perf', t('الأداء')]]} value={tab} onChange={setTab} />
      {tab === 'errors' ? <Errors /> : <Performance />}
    </AdminScreen>
  );
}
