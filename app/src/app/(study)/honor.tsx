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
import { Card, Chip, Field, Header, Row, Screen, Segmented, T, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { nm, t } from '@/lib/i18n';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/cache';
import { C, F, shadow } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { refreshFrames } from '@/lib/frames';

type Status = { term: string | null; terms: string[]; updated_at: string | null; hidden: boolean | null; has_record: boolean };
const SCOPES = ['major', 'college', 'university'] as const;
const PERIODS = ['term', 'cumulative'] as const;

/**
 * Honor board: students ranked by their official GPA (from the university's records, never typed in by students).
 * Only people who opted in, top 10 per major / college / university, and nobody's GPA but my own (0109).
 */
export default function Honor() {
  const insets = useSafeAreaInsets();
  const { profile, university } = useAuth();
  const [scope, setScope] = useState(1);
  const [period, setPeriod] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [rows, setRows] = useState<HonorRow[] | null>(null);
  const [hide, setHide] = useState(false);
  const [term, setTerm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const key = `honor:${SCOPES[scope]}:${PERIODS[period]}:${term ?? ''}`;
    const [{ data: st0, error: se }, { data: d0, error: be }] = await Promise.all([
      supabase.rpc('honor_status'),
      supabase.rpc('honor_board', { p_scope: SCOPES[scope], p_period: PERIODS[period], p_term: term }),
    ]);
    // without internet: the board as it was last time
    const kept = se || be ? readCache<{ st: unknown; data: unknown }>(key) : null;
    const st = kept ? kept.st : st0, data = kept ? kept.data : d0;
    if (!se && !be) writeCache(key, { st: st0, data: d0 });
    const s = (st ?? null) as Status | null;
    setStatus(s ?? { term: null, terms: [], updated_at: null, hidden: false, has_record: false });
    setHide(!!s?.hidden);
    setRows(((data ?? []) as HonorRow[]).map((r) => ({ ...r, gpa: r.gpa == null ? null : Number(r.gpa) })));
  }, [scope, period, term]);
  useEffect(() => { setRows(null); load().catch(() => setRows([])); }, [load]);

  // taking part is a choice: off by default, and an optional nickname (then no name, photo, major or frame)
  const [alias, setAlias] = useState('');
  useEffect(() => {
    if (!profile) return;
    supabase.from('profiles').select('honor_alias').eq('id', profile.id).maybeSingle()
      .then(({ data }) => setAlias(data?.honor_alias ?? ''), () => {});
  }, [profile]);
  async function saveOptions(next: { show?: boolean }) {
    const show = next.show ?? !hide;
    setHide(!show); setBusy(true);
    await run(supabase.rpc('set_honor_options', { p_show: show, p_alias: alias.trim() || null, p_show_gpa: false }));
    setBusy(false);
    load(); refreshFrames();
  }

  const scopeName = useMemo(() => {
    if (scope === 0) return nm((profile as unknown as { major?: { name_ar?: string; name_en?: string } })?.major) || t('تخصصك');
    if (scope === 1) return nm((profile as unknown as { college?: { name_ar?: string; name_en?: string } })?.college) || t('كليتك');
    return nm(university) || t('الجامعة');
  }, [scope, profile, university]);

  const list = rows ?? [];
  const me = list.find((r) => r.is_me) ?? null;
  const top = list.filter((r) => r.rank <= 10).slice(0, 3);
  const rest = list.filter((r) => r.rank <= 10).slice(3);
  const meOutside = me && me.rank > 10 ? me : null;
  const noData = status && !status.term;

  return (
    <Screen>
      <Header title={t('المتفوقين')}
        subtitle={status?.term ? [status.term, status.updated_at ? t('آخر تحديث {0}', [timeAgo(status.updated_at)]) : null].filter(Boolean).join(' · ') : t('الترتيب من سجل الجامعة الرسمي')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: me ? 130 + insets.bottom : 40 }} refreshControl={<PullRefresh onRefresh={load} />}>
        <Segmented items={[t('تخصصي'), t('كليتي'), t('جامعتي')]} value={scope} onChange={setScope} />
        <Row gap={8}>
          <Chip label={t('معدل الفصل')} active={period === 0} onPress={() => setPeriod(0)} />
          <Chip label={t('التراكمي')} active={period === 1} onPress={() => setPeriod(1)} />
        </Row>
        {(status?.terms.length ?? 0) > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {status!.terms.map((x) => <Chip key={x} label={x} active={(term ?? status!.term) === x} onPress={() => setTerm(x === status!.term ? null : x)} />)}
          </ScrollView>
        )}

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
                hint={t('بالأساس ما حدا بيظهر. اللوحة بتعرض أول 10 بس، ومعدلك ما بيشوفه غيرك أبداً. إذا كنت من العشرة الأوائل بيطلع حوالين صورتك إطار تكريم.')} />
              {!hide && (
                <Field label={t('اسم مستعار (اختياري)')} value={alias} maxLength={24} onChangeText={setAlias} onBlur={() => saveOptions({})}
                  placeholder={t('بيطلع بدل اسمك وصورتك، وبدون إطار')} />
              )}
            </View>
            <T v="tiny" color={C.faint} style={{ textAlign: 'center', fontFamily: F.body }}>{t('الترتيب بيتحدّث كل 24 ساعة من سجل الجامعة الرسمي.')}</T>
          </>
        )}
      </ScrollView>
      {me && !noData && (
        <View style={{ position: 'absolute', left: 14, right: 14, bottom: 14 + insets.bottom }}>
          <MyPlace me={me} />
        </View>
      )}
    </Screen>
  );
}
