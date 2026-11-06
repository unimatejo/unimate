import { Image } from 'expo-image';
import { Info } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HonorList, MyPlace } from '@/components/honor/HonorList';
import { HONOR_EMOJI, Podium, type HonorRow } from '@/components/honor/Podium';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Card, Chip, Header, Row, Screen, Segmented, T, Toggle, Field } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { nm, t } from '@/lib/i18n';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { timeAgo } from '@/lib/util';

type Status = { term: string | null; updated_at: string | null; hidden: boolean | null; has_record: boolean };
const SCOPES = ['major', 'college', 'university'] as const;
const PERIODS = ['term', 'cumulative'] as const;

/** Honor board: students ranked by their official GPA (from the university's records, never typed in by students). */
export default function Honor() {
  const insets = useSafeAreaInsets();
  const { profile, university } = useAuth();
  const [scope, setScope] = useState(1);
  const [period, setPeriod] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<HonorRow[] | null>(null);
  const [hide, setHide] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: st }, { data }] = await Promise.all([
      supabase.rpc('honor_status'),
      supabase.rpc('honor_board', { p_scope: SCOPES[scope], p_period: PERIODS[period] }),
    ]);
    const s = (st ?? null) as Status | null;
    setStatus(s ?? { term: null, updated_at: null, hidden: false, has_record: false });
    setHide(!!s?.hidden);
    setRows(((data ?? []) as HonorRow[]).map((r) => ({ ...r, gpa: r.gpa == null ? null : Number(r.gpa) })));
  }, [scope, period]);
  useEffect(() => { setRows(null); load().catch(() => setRows([])); }, [load]);

  // taking part is a choice: off by default, an optional nickname, and the GPA shows only if allowed
  const [alias, setAlias] = useState('');
  const [showGpa, setShowGpa] = useState(false);
  useEffect(() => {
    if (!profile) return;
    supabase.from('profiles').select('honor_alias, honor_show_gpa').eq('id', profile.id).maybeSingle()
      .then(({ data }) => { setAlias(data?.honor_alias ?? ''); setShowGpa(!!data?.honor_show_gpa); }, () => {});
  }, [profile]);
  async function saveOptions(next: { show?: boolean; alias?: string; gpa?: boolean }) {
    const show = next.show ?? !hide, a = next.alias ?? alias, g = next.gpa ?? showGpa;
    setHide(!show); setShowGpa(g); setBusy(true);
    const r = await run(supabase.rpc('set_honor_options', { p_show: show, p_alias: a.trim() || null, p_show_gpa: g }));
    setBusy(false);
    if (!r.ok) { load(); return; }
    load();
  }

  const scopeName = useMemo(() => {
    if (scope === 0) return nm((profile as unknown as { major?: { name_ar?: string; name_en?: string } })?.major) || t('تخصصك');
    if (scope === 1) return nm((profile as unknown as { college?: { name_ar?: string; name_en?: string } })?.college) || t('كليتك');
    return nm(university) || t('الجامعة');
  }, [scope, profile, university]);

  const list = rows ?? [];
  const me = list.find((r) => r.is_me) ?? null;
  // the person right above me (better GPA), for the "gap" line
  const above = me && me.gpa != null ? [...list].filter((r) => !r.is_me && r.gpa != null && r.gpa > me.gpa!).sort((a, b) => a.gpa! - b.gpa!)[0] ?? null : null;
  const top = list.filter((r) => r.rank <= 10).slice(0, 3);
  const rest = list.filter((r) => r.rank <= 10).slice(3);
  const meOutside = me && me.rank > 10 ? me : null;
  const noData = status && !status.term;

  return (
    <Screen>
      <Header title={t('المتفوقين')}
        subtitle={status?.term ? [status.term, status.updated_at ? t('آخر تحديث {0}', [timeAgo(status.updated_at)]) : null].filter(Boolean).join(' · ') : t('الترتيب من سجل الجامعة الرسمي')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: me ? 130 + insets.bottom : 40 }} refreshControl={<PullRefresh onRefresh={load} />}>
        <Segmented items={[t('تخصصي'), t('كليتي'), t('الجامعة')]} value={scope} onChange={setScope} />
        <Row gap={8}>
          <Chip label={t('هالفصل')} active={period === 0} onPress={() => setPeriod(0)} />
          <Chip label={t('التراكمي')} active={period === 1} onPress={() => setPeriod(1)} />
        </Row>

        {rows === null || status === null ? <ListSkeleton n={6} />
        : noData ? (
          <Animated.View entering={FadeIn.duration(220)}>
            <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 30 }}>
              <Image source={HONOR_EMOJI.trophy} style={{ width: 96, height: 96 }} contentFit="contain" />
              <T v="h3" style={{ textAlign: 'center' }}>{t('لوحة المتفوقين بتشتغل أول ما توصل علامات الجامعة')}</T>
              <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('الترتيب بيجي من سجل الجامعة الرسمي، مش من حاسبة المعدل.')}</T>
            </Card>
          </Animated.View>
        ) : (
          <>
            {!status.has_record && !hide && (
              <Row gap={8} style={{ backgroundColor: C.soft, borderRadius: 16, padding: 12 }}>
                <Info size={16} color={C.muted} /><T v="small" color={C.ink2} style={{ flex: 1 }}>{t('ما لقينا علاماتك بسجل الجامعة لهلأ')}</T>
              </Row>
            )}
            {top.length ? (
              <Animated.View entering={FadeIn.duration(220)}>
                <Podium rows={top} title={t('أوائل {0}', [scopeName])} />
              </Animated.View>
            ) : (
              <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
                <Image source={HONOR_EMOJI.trophy} style={{ width: 72, height: 72 }} contentFit="contain" />
                <T v="bodyMd" style={{ textAlign: 'center' }}>{t('ما في ترتيب هون لهلأ')}</T>
                <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('جرّب «الجامعة» أو «التراكمي».')}</T>
              </Card>
            )}
            <HonorList rows={meOutside ? [...rest, meOutside] : rest} />
            <View style={[{ backgroundColor: C.card, borderRadius: 22, padding: 14, gap: 10 }, shadow]}>
              <Toggle value={!hide} onChange={(v) => { if (!busy) saveOptions({ show: v }); }} label={t('شارك بلوحة المتفوقين')}
                hint={t('بالأساس ما حدا بيظهر. اللوحة بتعرض أول 10 بس، ومعدلك ما بيطلع إلا إذا سمحت.')} />
              {!hide && (
                <>
                  <Field label={t('اسم مستعار (اختياري)')} value={alias} maxLength={24} onChangeText={setAlias} onBlur={() => saveOptions({})}
                    placeholder={t('بيطلع بدل اسمك وصورتك')} />
                  <Toggle value={showGpa} onChange={(v) => { if (!busy) saveOptions({ gpa: v }); }} label={t('اظهر معدلي')}
                    hint={t('إذا طفّيتها، بيطلع ترتيبك بس بدون الرقم.')} />
                </>
              )}
            </View>
            <T v="tiny" color={C.faint} style={{ textAlign: 'center', fontFamily: F.body }}>{t('الترتيب بيتحدّث كل 24 ساعة من سجل الجامعة الرسمي.')}</T>
          </>
        )}
      </ScrollView>
      {me && !noData && (
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 + insets.bottom }}>
          <MyPlace me={me} above={above} />
        </View>
      )}
    </Screen>
  );
}
