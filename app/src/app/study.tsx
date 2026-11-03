import { router } from 'expo-router';
import { BookOpen, Check, MessageCircle, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, RefreshControl, ScrollView, View } from 'react-native';

import { Avatar, Button, Chip, Field, Header, Row, Screen, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type Course = { id: string; name_ar: string; code: string };
type Intent = { user_id: string; course_id: string; place_pref: string | null; time_pref: string | null; note: string | null; active: boolean };
type Person = Intent & { p: { full_name: string; avatar_url: string | null; major: { name_ar: string } | null } | null };
type SR = { id: string; from_id: string; to_id: string; course_id: string; status: string };

const PLACES = ['المكتبة', 'الكافتيريا', 'قاعة فاضية', 'أونلاين'];
const TIMES = ['الصبح', 'بين المحاضرات', 'العصر', 'بالليل'];

export default function Study() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [course, setCourse] = useState<string | null>(null);
  const [mine, setMine] = useState<Record<string, Intent>>({});
  const [people, setPeople] = useState<Person[]>([]);
  const [reqs, setReqs] = useState<SR[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: enr } = await supabase.from('enrollments').select('section:sections(course:courses(id, name_ar, code))').eq('user_id', (profile?.id ?? ''));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cs = ((enr ?? []) as any[]).map((e) => e.section?.course).filter(Boolean) as Course[];
    setCourses(cs);
    setCourse((c) => c ?? cs[0]?.id ?? null);
    const { data: my } = await supabase.from('study_intents').select('*').eq('user_id', (profile?.id ?? ''));
    setMine(Object.fromEntries(((my ?? []) as Intent[]).map((i) => [i.course_id, i])));
    const { data: r } = await supabase.from('study_requests').select('*').or(`from_id.eq.${(profile?.id ?? '')},to_id.eq.${(profile?.id ?? '')}`);
    setReqs((r ?? []) as SR[]);
    setLoading(false);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!course || !profile) return;
    supabase.from('study_intents').select('*, p:profiles!study_intents_user_id_fkey(full_name, avatar_url, major:majors(name_ar))')
      .eq('course_id', course).eq('active', true).neq('user_id', (profile?.id ?? '')).limit(50)
      .then(({ data }) => setPeople((data ?? []) as unknown as Person[]));
  }, [course, profile]);

  const my = course ? mine[course] : undefined;

  async function saveIntent(p: Partial<Intent>) {
    if (!course) return;
    const next = { user_id: (profile?.id ?? ''), course_id: course, place_pref: null, time_pref: null, note: null, active: true, ...my, ...p };
    setMine((m) => ({ ...m, [course]: next }));
    await supabase.from('study_intents').upsert({ ...next, updated_at: new Date().toISOString() }, { onConflict: 'user_id,course_id' });
  }

  async function ask(to: string) {
    const { error } = await supabase.from('study_requests').insert({ from_id: (profile?.id ?? ''), to_id: to, course_id: course });
    if (error) { Alert.alert('بعتله قبل'); return; }
    load();
  }
  async function answer(r: SR, accept: boolean) {
    await supabase.from('study_requests').update({ status: accept ? 'accepted' : 'declined' }).eq('id', r.id);
    if (accept) talk(r.from_id); else load();
  }
  async function talk(other: string) {
    const name = courses.find((c) => c.id === course)?.name_ar ?? '';
    const { data } = await supabase.rpc('start_direct', { target: other, context: `ندرس سوا · ${name}` });
    if (data) router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  const incoming = reqs.filter((r) => r.to_id === profile?.id && r.status === 'pending');
  const stateWith = (uid: string) => reqs.find((r) => r.course_id === course && (r.from_id === uid || r.to_id === uid));

  return (
    <Screen>
      <Header title="ندرس سوا" subtitle="لاقي حدا من مادتك يدرس معك" />
      <ScrollView refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />} contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}>
        {incoming.map((r) => (
          <Row key={r.id} gap={10} style={{ backgroundColor: C.violetSoft, borderRadius: 20, padding: 12 }}>
            <UserPlus size={20} color={C.violet} />
            <T v="small" style={{ flex: 1 }}>في حدا بدّه يدرس معك {courses.find((c) => c.id === r.course_id)?.name_ar ?? ''}</T>
            <Button title="يلا" onPress={() => answer(r, true)} style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: 12 }} />
            <Button kind="soft" title="لا" onPress={() => answer(r, false)} style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 12 }} />
          </Row>
        ))}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {courses.map((c) => <Chip key={c.id} label={c.name_ar} active={course === c.id} onPress={() => setCourse(c.id)} />)}
        </ScrollView>
        {courses.length === 0 && !loading && <T v="small" color={C.muted}>لما توصل موادك بتقدر تدوّر على حدا يدرس معك.</T>}

        {course && (
          <View style={{ gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <Toggle icon={<BookOpen size={20} color={C.primary} />} label="بدي حدا أدرس معه هالمادة" hint="بتبيّن لطلاب نفس المادة بجامعتك" value={!!my?.active} onChange={(v) => saveIntent({ active: v })} />
            {my?.active && (
              <>
                <T v="small" color={C.muted}>وين؟</T>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>{PLACES.map((x) => <Chip key={x} label={x} active={my.place_pref === x} onPress={() => saveIntent({ place_pref: x })} />)}</Row>
                <T v="small" color={C.muted}>إمتى؟</T>
                <Row gap={8} style={{ flexWrap: 'wrap' }}>{TIMES.map((x) => <Chip key={x} label={x} active={my.time_pref === x} onPress={() => saveIntent({ time_pref: x })} />)}</Row>
                <Field value={my.note ?? ''} onChangeText={(t) => setMine((m) => ({ ...m, [course]: { ...my, note: t } }))} onEndEditing={() => saveIntent({ note: my.note?.slice(0, 200) ?? null })} placeholder="ملاحظة (مثلاً: بدي أراجع الفصل 3 قبل الفيرست)" maxLength={200} />
              </>
            )}
          </View>
        )}

        {course && <T v="h3">بدهم يدرسوا هالمادة</T>}
        {course && people.length === 0 && <T v="small" color={C.muted}>لسا ما حدا. فعّلها إنت وبيشوفوك.</T>}
        {people.map((p) => {
          const s = stateWith(p.user_id);
          return (
            <View key={p.user_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 12 }}>
              <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.user_id } })}><Avatar id={p.user_id} name={p.p?.full_name} url={p.p?.avatar_url} size={46} /></Tap>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bodyMd">{p.p?.full_name}</T>
                <T v="tiny" color={C.muted} numberOfLines={1}>{[p.p?.major?.name_ar, p.place_pref, p.time_pref].filter(Boolean).join(' · ')}</T>
                {p.note ? <T v="tiny" color={C.ink2} numberOfLines={2}>{p.note}</T> : null}
              </View>
              {s?.status === 'accepted' ? <Button kind="green" title="راسل" icon={<MessageCircle size={16} color={C.white} />} onPress={() => talk(p.user_id)} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 12 }} />
                : s ? <Row gap={4}><Check size={16} color={C.muted} /><T v="tiny" color={C.muted}>انبعت</T></Row>
                : <Button title="ندرس سوا؟" onPress={() => ask(p.user_id)} style={{ minHeight: 38, paddingHorizontal: 12, borderRadius: 12 }} />}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}
