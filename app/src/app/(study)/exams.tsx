import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { BookOpenCheck, CalendarPlus, ChevronDown, Clock, GraduationCap, MapPin, MessageCircle, Square, Timer } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/ui/Glyph';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Avatar, Button, Card, Chip, Empty, Header, IconButton, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { scheduleExamReminders } from '@/lib/examReminders';
import { readCache, writeCache } from '@/lib/cache';
import { reportError } from '@/lib/errors';
import { MoodleImport } from '@/components/study/MoodleImport';
import { EventSourceTag } from '@/components/study/EventSourceTag';
import { SectionAsks } from '@/components/study/SectionAsks';
import { EVENT_KIND, preferOfficial } from '@/lib/events';
import { sectionLabel } from '@/lib/sections';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { LOCALE, t } from '@/lib/i18n';

type Ev = { id: string; section_id: string | null; owner_id: string | null; kind: string; title: string; starts_at: string; location: string | null; course_name: string | null; confirmations: number; shared_ask: boolean; source: string };
type Sec = { id: string; name: string; section_no: string };
type Mine = { section_id: string; place: string | null; until: string };
type Mate = { user_id: string; full_name: string; username: string | null; avatar_url: string | null; place: string | null; until: string };

const KIND = EVENT_KIND;
const isExam = (k: string) => k.startsWith('exam') || k === 'quiz';
const PLACES = [t('المكتبة'), t('الكافتيريا'), t('قاعة دراسة'), t('أونلاين'), t('البيت')];
const DAY = 86400000;
const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
/** Sunday-based week, like the timetable */
const weekOf = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - x.getDay()); return x.getTime(); };

function daysLeft(iso: string, now: number) { return Math.round((startOfDay(new Date(iso)).getTime() - startOfDay(new Date(now)).getTime()) / DAY); }
function urgency(d: number): [string, string] {
  if (d <= 1) return [C.redSoft, C.red];
  if (d <= 3) return [C.orangeSoft, C.orangeInk];
  if (d <= 7) return [C.primarySoft, C.primary];
  return [C.soft, C.ink2];
}
const leftLabel = (d: number) => d <= 0 ? t('اليوم') : d === 1 ? t('بكرة') : t('بعد {0} يوم', [d]);

/** Exam mode: what's coming, how long is left, and who from my section is studying right now. */
export default function Exams() {
  const { profile } = useAuth();
  // the last list this phone saw: opens at once, and without internet
  const keptKey = `exams:${profile?.id ?? ''}`;
  const [events, setEvents] = useState<Ev[] | null>(() => readCache<{ events: Ev[] }>(keptKey)?.events ?? null);
  const [secs, setSecs] = useState<Sec[]>(() => readCache<{ secs: Sec[] }>(keptKey)?.secs ?? []);
  const [mine, setMine] = useState<Mine | null>(null);
  const [mates, setMates] = useState<Record<string, Mate[]>>({});
  const [now, setNow] = useState(Date.now());
  const [pastOpen, setPastOpen] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [hours, setHours] = useState(2);
  const [place, setPlace] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    try {
      const [{ data: enr }, { data: ev, error: evError }, { data: st }] = await Promise.all([
        supabase.from('enrollments').select('section:sections(id, section_no, course:courses(name_ar))').eq('user_id', profile.id),
        supabase.rpc('my_events', { p_from: new Date(Date.now() - 14 * DAY).toISOString(), p_to: new Date(Date.now() + 120 * DAY).toISOString() }),
        supabase.from('studying_now').select('section_id, place, until, user_id').gt('until', new Date().toISOString()),
      ]);
       
      if (evError) { setEvents((x) => x ?? []); return; } // offline: what's on screen (the kept list) stays
      const s: Sec[] = ((enr ?? []) as any[]).map((e) => e.section).filter(Boolean).map((x) => ({ id: x.id, name: x.course?.name_ar ?? '', section_no: x.section_no }));
      setSecs(s);
      const list = preferOfficial((ev ?? []) as Ev[]);
      setEvents(list);
      writeCache(keptKey, { events: list, secs: s });
       
      setMine(((st ?? []) as any[]).find((r) => r.user_id === profile.id) ?? null);
      // a list that really came back replaces the reminders (offline they stay on the phone and still ring)
      scheduleExamReminders(list).catch(reportError);
      // classmates studying, for the courses on screen
      const ids = [...new Set(s.map((x) => x.id))].slice(0, 12);
      const res = await Promise.all(ids.map((id) => supabase.rpc('studying_classmates', { p_section: id }).then(({ data }) => [id, (data ?? []) as Mate[]] as const)));
      setMates(Object.fromEntries(res));
    } catch (e) { reportError(e); setEvents((x) => x ?? []); }
  }, [profile, keptKey]);

  useEffect(() => { load(); }, [load]);
  // the countdown ticks every minute; classmates refresh every 2 minutes
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(i); }, []);
  useEffect(() => { const i = setInterval(load, 120000); return () => clearInterval(i); }, [load]);

  const upcoming = useMemo(() => (events ?? []).filter((e) => new Date(e.starts_at).getTime() >= now - 2 * 3600_000), [events, now]);
  const past = useMemo(() => (events ?? []).filter((e) => new Date(e.starts_at).getTime() < now - 2 * 3600_000).reverse(), [events, now]);
  const next = upcoming.find((e) => isExam(e.kind)) ?? upcoming[0];

  const groups = useMemo(() => {
    const thisW = weekOf(new Date(now)); const nextW = thisW + 7 * DAY;
    const out: { label: string; items: Ev[] }[] = [];
    for (const e of upcoming) {
      const w = weekOf(new Date(e.starts_at));
      const label = w === thisW ? t('هالأسبوع') : w === nextW ? t('الأسبوع الجاي')
        : t('أسبوع {0}', [new Date(w).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long' })]);
      const g = out[out.length - 1];
      if (g && g.label === label) g.items.push(e); else out.push({ label, items: [e] });
    }
    return out;
  }, [upcoming, now]);

  // courses with something coming first, then the rest
  const courses = useMemo(() => {
    const soon = new Map<string, Ev>();
    for (const e of upcoming) if (e.section_id && !soon.has(e.section_id)) soon.set(e.section_id, e);
    return [...secs].sort((a, b) => {
      const x = soon.get(a.id), y = soon.get(b.id);
      if (x && y) return x.starts_at.localeCompare(y.starts_at);
      return x ? -1 : y ? 1 : a.name.localeCompare(b.name);
    }).map((s) => ({ ...s, next: soon.get(s.id) }));
  }, [secs, upcoming]);

  async function startStudying(sectionId: string) {
    if (busy) return;
    setBusy(true);
    const until = new Date(Math.min(Date.now() + hours * 3600_000, Date.now() + 6 * 3600_000 - 60_000)).toISOString();
    const { error } = await supabase.from('studying_now').upsert({ section_id: sectionId, place: place ? place.slice(0, 60) : null, until }, { onConflict: 'user_id' });
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط'), t('تأكد من الإنترنت وجرّب كمان مرة.')); return; }
    setMine({ section_id: sectionId, place, until }); setPicking(null);
  }
  async function stopStudying() {
    if (busy || !profile) return;
    setBusy(true);
    const { error } = await supabase.from('studying_now').delete().eq('user_id', profile.id);
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط'), t('تأكد من الإنترنت وجرّب كمان مرة.')); return; }
    setMine(null);
  }
  async function message(id: string) {
    const { data, error } = await supabase.rpc('start_direct', { target: id, context: t('دراسة للامتحان') });
    if (error) { Alert.alert(t('ما بتقدر تراسله'), error.message.includes('not accepting') ? t('هاد الطالب مسكّر الرسائل.') : t('جرّب بعدين.')); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  const open = (e: Ev) => router.push({ pathname: '/event/new', params: { id: e.id } });

  return (
    <Screen>
      <Header title={t('امتحاناتي')} subtitle={t('العد التنازلي ومين عم يدرس معك')}
        right={<IconButton label={t('أضف امتحان أو موعد')} onPress={() => router.push('/event/new')}><CalendarPlus size={21} color={C.ink} /></IconButton>} />
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120, gap: 16 }} refreshControl={<PullRefresh onRefresh={load} />}>
        <SectionAsks onChange={load} />
        <MoodleImport onImported={load} />
        {events === null ? <ListSkeleton n={4} /> : !next ? (
          <Empty icon={<GraduationCap size={28} color={C.primary} />} title={t('ما في امتحانات قريبة')}
            body={t('ضيف امتحاناتك ومواعيد التسليم، وبنذكّرك قبلها بيوم وقبلها بساعة. ولما كم واحد من شعبتك يضيفوا نفس الموعد بيصير عند الكل.')}
            action={<Button title={t('أضف امتحان')} icon={<CalendarPlus size={18} color={C.white} />} onPress={() => router.push('/event/new')} style={{ paddingHorizontal: 22, marginTop: 8 }} />} />
        ) : (
          <>
            <Hero e={next} now={now} onPress={() => open(next)} />

            {groups.map((g, gi) => (
              <Animated.View key={g.label} entering={FadeInDown.delay(gi * 50).duration(220)} style={{ gap: 8 }}>
                <T v="h3">{g.label}</T>
                {g.items.map((e) => <Row1 key={e.id} e={e} now={now} onPress={() => open(e)} />)}
              </Animated.View>
            ))}
          </>
        )}

        {courses.length > 0 && (
          <View style={{ gap: 10 }}>
            <View style={{ gap: 2 }}>
              <T v="h3">{t('عم بدرس هلأ')}</T>
              <T v="tiny" color={C.muted}>{t('خلّي زملاءك بشعبتك يعرفوا إنك عم تدرس، ويمكن تدرسوا سوا. بيطفى لحاله.')}</T>
            </View>
            {courses.map((c) => {
              const on = mine?.section_id === c.id;
              const list = mates[c.id] ?? [];
              return (
                <Card key={c.id} pad={14} style={{ gap: 12 }}>
                  <Row gap={12}>
                    <GlyphTile icon={BookOpenCheck} colors={on ? GRAD.green : GRAD.indigo} size={42} live={on} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <T v="bold" numberOfLines={1}>{c.name}</T>
                      <T v="tiny" color={C.muted} numberOfLines={1}>
                        {c.next ? `${KIND[c.next.kind] ?? c.next.title} · ${leftLabel(daysLeft(c.next.starts_at, now))}` : sectionLabel(c.section_no)}
                      </T>
                    </View>
                    {on ? (
                      <Tap onPress={stopStudying} disabled={busy} accessibilityLabel={t('وقّف')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.greenSoft }}>
                        <Square size={13} color={C.greenInk} fill={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('وقّف')}</T>
                      </Tap>
                    ) : (
                      <Tap onPress={() => { setPicking(picking === c.id ? null : c.id); setPlace(null); setHours(2); }} accessibilityLabel={t('عم بدرس هلأ')}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 12, backgroundColor: C.primarySoft }}>
                        <Timer size={15} color={C.primary} /><T v="tiny" color={C.primary}>{t('بدرس هلأ')}</T>
                      </Tap>
                    )}
                  </Row>

                  {on && mine && (
                    <T v="tiny" color={C.greenInk}>
                      {t('شغّال لحد {0}', [new Date(mine.until).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })])}{mine.place ? ` · ${mine.place}` : ''}
                    </T>
                  )}

                  {picking === c.id && !on && (
                    <Animated.View entering={FadeIn.duration(180)} style={{ gap: 10 }}>
                      <T v="tiny" color={C.muted}>{t('لكم ساعة؟')}</T>
                      <Row gap={8}>{[1, 2, 3].map((h) => <Chip key={h} label={h === 1 ? t('ساعة') : h === 2 ? t('ساعتين') : t('3 ساعات')} active={hours === h} onPress={() => setHours(h)} />)}</Row>
                      <T v="tiny" color={C.muted}>{t('وين؟ (اختياري)')}</T>
                      <Row gap={8} style={{ flexWrap: 'wrap' }}>{PLACES.map((p) => <Chip key={p} label={p} active={place === p} onPress={() => setPlace(place === p ? null : p)} />)}</Row>
                      <Button title={mine ? t('انقل الدراسة لهالمادة') : t('يلا، بلّش')} loading={busy} onPress={() => startStudying(c.id)} />
                    </Animated.View>
                  )}

                  {list.length > 0 && (
                    <View style={{ gap: 8 }}>
                      <T v="tiny" color={C.muted}>{list.length === 1 ? t('زميل وحد عم يدرس هلأ') : t('{0} من زملائك عم يدرسوا هلأ', [list.length])}</T>
                      {list.slice(0, 6).map((m) => (
                        <Row key={m.user_id} gap={10}>
                          <Tap haptic={false} scale={0.97} onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.user_id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={{ padding: 2, borderRadius: 22, borderWidth: 2, borderColor: C.green }}><Avatar id={m.user_id} name={m.full_name} url={m.avatar_url} size={34} /></View>
                            <View style={{ flex: 1 }}>
                              <T v="small" numberOfLines={1}>{m.full_name}</T>
                              <T v="tiny" color={C.muted} numberOfLines={1}>
                                {[m.place, t('لحد {0}', [new Date(m.until).toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })])].filter(Boolean).join(' · ')}
                              </T>
                            </View>
                          </Tap>
                          <Tap onPress={() => message(m.user_id)} accessibilityLabel={t('راسل {0}', [m.full_name])}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 32, paddingHorizontal: 10, borderRadius: 10, backgroundColor: C.soft }}>
                            <MessageCircle size={14} color={C.ink} /><T v="tiny">{t('راسل')}</T>
                          </Tap>
                        </Row>
                      ))}
                    </View>
                  )}
                </Card>
              );
            })}
          </View>
        )}

        {past.length > 0 && (
          <View style={{ gap: 8 }}>
            <Tap haptic={false} onPress={() => setPastOpen(!pastOpen)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}>
              <T v="h3" style={{ flex: 1 }}>{t('خلصت ({0})', [past.length])}</T>
              <ChevronDown size={18} color={C.muted} style={{ transform: [{ rotate: pastOpen ? '180deg' : '0deg' }] }} />
            </Tap>
            {pastOpen && past.map((e) => <Row1 key={e.id} e={e} now={now} onPress={() => open(e)} past />)}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Hero({ e, now, onPress }: { e: Ev; now: number; onPress: () => void }) {
  const ms = Math.max(0, new Date(e.starts_at).getTime() - now);
  const d = Math.floor(ms / DAY), h = Math.floor((ms % DAY) / 3600_000), m = Math.floor((ms % 3600_000) / 60000);
  const started = ms === 0;
  const unit = (n: number, label: string) => (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 16, paddingVertical: 10 }}>
      <T style={{ fontFamily: F.display, fontSize: 30, lineHeight: 36 }} color={C.white}>{String(n)}</T>
      <T v="tiny" color={C.white} style={{ opacity: 0.85 }}>{label}</T>
    </View>
  );
  return (
    <Animated.View entering={FadeIn.duration(240)}>
      <Tap haptic={false} scale={0.985} onPress={onPress} accessibilityLabel={`${KIND[e.kind] ?? e.title} ${e.course_name ?? ''}`} style={[{ borderRadius: 28, overflow: 'hidden' }, shadow]}>
        <LinearGradient colors={(isExam(e.kind) ? GRAD.violet : GRAD.orange) as unknown as [string, string]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18, gap: 14 }}>
          <View style={{ position: 'absolute', top: -50, left: -40, width: 170, height: 170, borderRadius: 85, backgroundColor: 'rgba(255,255,255,0.14)' }} />
          <View style={{ gap: 4 }}>
            <T v="tiny" color={C.white} style={{ opacity: 0.85 }}>{t('الجاي')} · {KIND[e.kind] ?? t('موعد')}</T>
            <T v="h2" color={C.white} numberOfLines={2} style={{ fontFamily: F.display, fontSize: 23 }}>{e.course_name ?? e.title}</T>
          </View>
          {started ? (
            <T v="bold" color={C.white}>{t('بلّش هلأ. بالتوفيق! 🤞')}</T>
          ) : (
            <Row gap={8}>{unit(d, d === 1 ? t('يوم') : t('أيام'))}{unit(h, t('ساعة'))}{unit(m, t('دقيقة'))}</Row>
          )}
          <Row gap={14} style={{ flexWrap: 'wrap' }}>
            <Row gap={6}><Clock size={14} color={C.white} /><T v="tiny" color={C.white}>{new Date(e.starts_at).toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}</T></Row>
            {e.location ? <Row gap={6}><MapPin size={14} color={C.white} /><T v="tiny" color={C.white} numberOfLines={1}>{e.location}</T></Row> : null}
          </Row>
        </LinearGradient>
      </Tap>
    </Animated.View>
  );
}

function Row1({ e, now, onPress, past }: { e: Ev; now: number; onPress: () => void; past?: boolean }) {
  const d = daysLeft(e.starts_at, now);
  const [bg, fg] = past ? [C.soft, C.muted] : urgency(d);
  const date = new Date(e.starts_at);
  return (
    <Tap haptic={false} scale={0.985} onPress={onPress} accessibilityLabel={`${KIND[e.kind] ?? e.title} ${e.course_name ?? ''}`}
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 20, padding: 12, opacity: past ? 0.6 : 1 }, shadow]}>
      <View style={{ width: 50, height: 54, borderRadius: 16, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
        <T style={{ fontFamily: F.display, fontSize: 19, lineHeight: 22 }} color={fg}>{String(date.getDate())}</T>
        <T v="tiny" color={fg} style={{ fontSize: 10 }}>{date.toLocaleDateString(LOCALE, { month: 'short' })}</T>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="bold" numberOfLines={1}>{e.course_name ?? e.title}</T>
        <T v="tiny" color={C.muted} numberOfLines={1}>
          {[KIND[e.kind] ?? e.title, date.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' }), e.location].filter(Boolean).join(' · ')}
        </T>
        <EventSourceTag e={e} />
      </View>
      {!past && (
        <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
          <T v="tiny" color={fg} style={{ fontFamily: F.bodyBold }}>{leftLabel(d)}</T>
        </View>
      )}
    </Tap>
  );
}
