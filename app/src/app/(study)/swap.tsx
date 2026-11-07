import { router } from 'expo-router';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { ArrowLeftRight, CheckCircle2, Clock, MessageCircle, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { Button, Chip, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { sectionKnown, sectionLabel } from '@/lib/sections';
import { supabase } from '@/lib/supabase';
import { run } from '@/lib/run';
import { toast } from '@/lib/toast';
import { C } from '@/lib/theme';
import { clock, WEEKDAYS_SHORT } from '@/lib/util';
import { nm, t } from '@/lib/i18n';

type Sec = { id: string; section_no: string; instructor: string | null; meetings: { weekday: number; starts_at: string }[] };
type Mine = { section: Sec & { course: { id: string; name_ar: string; code: string } } };
type Req = { id: string; course_id: string; from_section_id: string; to_section_id: string; status: string; matched_with: string | null; created_at: string };

const when = (s?: Sec) => s?.meetings?.length ? s.meetings.map((m) => `${WEEKDAYS_SHORT[m.weekday]} ${clock(m.starts_at)}`).join(' · ') : t('سيُحدَّد الوقت لاحقاً');

/** Section swaps: offer your section of a course for another one, matched automatically. */
export default function Swap() {
  const { profile } = useAuth();
  const [mine, setMine] = useState<Mine[]>([]);
  const [others, setOthers] = useState<Record<string, Sec[]>>({});
  const [reqs, setReqs] = useState<Req[]>([]);
  const [partners, setPartners] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
    const { data: enr } = await supabase.from('enrollments')
      .select('section:sections(id, section_no, instructor, meetings:section_meetings(weekday, starts_at), course:courses(id, name_ar, name_en, code))').eq('user_id', (profile?.id ?? ''));
    const m = ((enr ?? []) as unknown as Mine[]).filter((x) => x.section);
    setMine(m);
    const courseIds = m.map((x) => x.section.course.id);
    if (courseIds.length) {
      const { data: secs } = await supabase.from('sections').select('id, course_id, section_no, instructor, meetings:section_meetings(weekday, starts_at)').in('course_id', courseIds).order('section_no');
      const by: Record<string, Sec[]> = {};
       
      // only real sections: one whose number isn't known yet can't be swapped into
      for (const s of (secs ?? []) as any[]) if (sectionKnown(s.section_no)) (by[s.course_id] ??= []).push(s);
      setOthers(by);
    }
    const { data: r } = await supabase.from('swap_requests').select('*').eq('user_id', (profile?.id ?? '')).neq('status', 'closed').order('created_at', { ascending: false });
    const rs = (r ?? []) as Req[];
    setReqs(rs);
    const matchedIds = rs.filter((x) => x.matched_with).map((x) => x.matched_with!) ;
    if (matchedIds.length) {
      const { data: p } = await supabase.from('swap_requests').select('id, user_id').in('id', matchedIds);
      setPartners(Object.fromEntries((p ?? []).map((x) => [x.id, x.user_id])));
    }
    } catch { toast(t('تعذّر التحميل، اسحب للأسفل وحاول مرة أخرى.')); }
    finally { setLoading(false); }
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  const [busy, setBusy] = useState(false);
  async function request(mm: Mine) {
    const to = pick[mm.section.id];
    if (!to || !profile || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('swap_requests').insert({ user_id: profile.id, course_id: mm.section.course.id, from_section_id: mm.section.id, to_section_id: to });
      if (error) { Alert.alert(t('تعذّر ذلك'), error.code === '23505' ? t('لديك طلب للشعبة نفسها.') : t('حاول مرة أخرى.')); return; }
      setPick((p) => ({ ...p, [mm.section.id]: '' }));
      toast(t('تم إرسال الطلب'));
      await load();
    } finally { setBusy(false); }
  }

  function close(id: string) {
    Alert.alert(t('إغلاق الطلب؟'), t('لن نبحث لك عن تبديل لهذه الشعبة بعد ذلك.'), [
      { text: t('إلغاء'), style: 'cancel' },
      { text: t('إغلاق'), style: 'destructive', onPress: async () => {
        const prev = reqs;
        setReqs((r) => r.filter((x) => x.id !== id));
        const r = await run(supabase.from('swap_requests').update({ status: 'closed' }).eq('id', id));
        if (!r.ok) setReqs(prev);
      } },
    ]);
  }

  async function talk(partner: string, course: string) {
    const { data, error } = await supabase.rpc('start_direct', { target: partner, context: t('تبديل شعبة · {0}', [course]) });
    if (error || !data) { Alert.alert(t('تعذّر فتح المحادثة')); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  const courseName = (id: string) => mine.find((x) => x.section.course.id === id)?.section.course.name_ar ?? '';
  const secNo = (course: string, id: string) => others[course]?.find((s) => s.id === id)?.section_no ?? t('؟');

  return (
    <Screen>
      <Header title={t('تبديل الشعب')} subtitle={t('سنجد لك شخصاً يريد التبديل المعاكس')} />
      <ScrollView refreshControl={<PullRefresh onRefresh={load} />} contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        {reqs.length > 0 && <T v="h3">{t('طلباتك')}</T>}
        {reqs.map((r) => {
          const partner = r.matched_with ? partners[r.matched_with] : null;
          return (
            <Animated.View key={r.id} entering={FadeIn.duration(220)} style={{ gap: 10, backgroundColor: r.status === 'matched' ? C.greenSoft : C.card, borderRadius: 22, padding: 14 }}>
              <Row gap={10}>
                {r.status === 'matched' ? <CheckCircle2 size={20} color={C.green} /> : <Clock size={20} color={C.orange} />}
                <T v="bold" style={{ flex: 1 }}>{courseName(r.course_id)}</T>
                <Tap onPress={() => close(r.id)} accessibilityLabel={t('إغلاق الطلب')} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
              </Row>
              <Row gap={8}>
                <T v="bodyMd">{t('شعبة')} {secNo(r.course_id, r.from_section_id)}</T>
                <ArrowLeftRight size={16} color={C.ink2} />
                <T v="bodyMd">{t('شعبة')} {secNo(r.course_id, r.to_section_id)}</T>
              </Row>
              {r.status === 'matched' && partner
                ? <Button kind="green" title={t('تحدّث مع من يريد التبديل')} icon={<MessageCircle size={18} color={C.white} />} onPress={() => talk(partner, courseName(r.course_id))} />
                : <T v="tiny" color={C.muted}>{t('سنبلغك فور أن يطلب أحد التبديل المعاكس.')}</T>}
            </Animated.View>
          );
        })}

        <T v="h3">{t('اطلب تبديل')}</T>
        {mine.length === 0 && !loading && <Empty title={t('لم يصل جدولك بعد')} body={t('عند وصول شعبك يمكنك طلب تبديل.')} />}
        {mine.map((mm) => {
          const alts = (others[mm.section.course.id] ?? []).filter((s) => s.id !== mm.section.id);
          return (
            <View key={mm.section.id} style={{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
              <T v="bold">{nm(mm.section.course)}</T>
              <T v="tiny" color={C.muted}>{sectionLabel(mm.section.section_no)} · {when(mm.section)}</T>
              {alts.length === 0 ? <T v="small" color={C.muted}>{t('لا توجد شعب أخرى مسجلة لهذه المادة حتى الآن.')}</T> : (
                <>
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    {alts.map((s) => <Chip key={s.id} label={t('شعبة {0}', [s.section_no])} active={pick[mm.section.id] === s.id} onPress={() => setPick((p) => ({ ...p, [mm.section.id]: s.id }))} />)}
                  </Row>
                  {pick[mm.section.id] ? (
                    <>
                      <T v="tiny" color={C.ink2}>{when(alts.find((s) => s.id === pick[mm.section.id]))}</T>
                      <Button title={t('اطلب التبديل')} onPress={() => request(mm)} loading={busy} disabled={busy} />
                    </>
                  ) : null}
                </>
              )}
            </View>
          );
        })}
        <T v="tiny" color={C.muted} style={{ textAlign: 'center' }}>{t('يتم التبديل الرسمي عبر نظام التسجيل في الجامعة، ويقتصر دور يونيميت على الجمع بينكم.')}</T>
      </ScrollView>
    </Screen>
  );
}
