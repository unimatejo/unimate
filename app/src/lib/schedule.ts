import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { timed } from './perf';
import { supabase } from './supabase';
import { minutesUntil } from './util';
import { t } from './i18n';

export type Meeting = {
  id: string; section_id: string; kind: 'lecture' | 'lab' | 'online' | 'tutorial';
  weekday: number; starts_at: string; ends_at: string; online_url: string | null;
  course_name: string; course_code: string; section_no: string; instructor: string | null;
  room_code: string | null; room_text?: string | null; source?: string; confirmations?: number; room_floor: number | null; room_directions: string | null;
  building_name: string | null; building_id: string | null; lat: number | null; lng: number | null;
  /** this week only: the doctor cancelled it, or it's a lecture moved here from another day */
  changed?: 'cancelled' | 'moved'; note?: string | null; change_id?: string;
};

export type MeetingChange = {
  id: string; section_id: string; meeting_id: string | null; on_date: string; new_date: string | null;
  starts_at: string | null; ends_at: string | null; room_text: string | null; cancelled: boolean; note: string | null; user_id: string | null; created_by: string;
};

export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Sunday of the week the schedule shows (after Thursday it shows next week). */
function weekStart(now = new Date()) {
  const dow = now.getDay();
  const sun = new Date(now); sun.setHours(0, 0, 0, 0); sun.setDate(now.getDate() - dow + (dow > 4 ? 7 : 0));
  return sun;
}

type AcademicEvent = {
  id: string; section_id: string | null; owner_id: string | null; kind: string; title: string;
  starts_at: string; location: string | null; course_name?: string | null;
};

export function useSchedule(userId?: string) {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [events, setEvents] = useState<AcademicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
    const { data: enr, error: enrErr } = await timed('schedule.enrollments', supabase
      .from('enrollments')
      .select(`section:sections(id, section_no, instructor,
        course:courses(name_ar, name_en, code),
        meetings:section_meetings(id, kind, weekday, starts_at, ends_at, online_url, room_text, source, confirmations,
          room:rooms(code, floor, directions, building:buildings(id, name_ar, lat, lng))))`)
      .eq('user_id', userId));
    if (enrErr) throw enrErr;

    const ms: Meeting[] = [];
    const secs = new Map<string, { course_name: string; course_code: string; section_no: string; instructor: string | null }>();
     
    for (const e of (enr ?? []) as any[]) {
      const s = e.section; if (!s) continue;
      secs.set(s.id, { course_name: s.course?.name_ar ?? '', course_code: s.course?.code ?? '', section_no: s.section_no, instructor: s.instructor });
      for (const m of s.meetings ?? []) {
        ms.push({
          id: m.id, section_id: s.id, kind: m.kind, weekday: m.weekday, starts_at: m.starts_at, ends_at: m.ends_at,
          online_url: m.online_url, course_name: s.course?.name_ar ?? '', course_code: s.course?.code ?? '',
          section_no: s.section_no, instructor: s.instructor,
          room_code: m.room?.code ?? null, room_text: m.room_text ?? null, source: m.source, confirmations: m.confirmations, room_floor: m.room?.floor ?? null, room_directions: m.room?.directions ?? null,
          building_name: m.room?.building?.name_ar ?? null, building_id: m.room?.building?.id ?? null,
          lat: m.room?.building?.lat ?? null, lng: m.room?.building?.lng ?? null,
        });
      }
    }
    // a Teams group can hold several real sections, so classmates' times pile up on one "section".
    // If I told the app my own times (photo of my timetable, or added them), I only see those for that section.
    const { data: mine } = await supabase.from('meeting_reports').select('section_id, weekday, starts_at').eq('user_id', userId);
    const myTimes = new Map<string, Set<string>>();
    for (const r of (mine ?? []) as { section_id: string; weekday: number; starts_at: string }[]) {
      if (!myTimes.has(r.section_id)) myTimes.set(r.section_id, new Set());
      myTimes.get(r.section_id)!.add(`${r.weekday}-${r.starts_at.slice(0, 5)}`);
    }
    for (let i = ms.length - 1; i >= 0; i--) {
      const own = myTimes.get(ms[i].section_id);
      if (own && !own.has(`${ms[i].weekday}-${ms[i].starts_at.slice(0, 5)}`)) ms.splice(i, 1);
    }
    // my own changes (internal transfer, a moved lecture just for me): hide or replace section times, add my own
    const { data: pm } = await supabase.from('personal_meetings').select('*').eq('user_id', userId);
    const personal = (pm ?? []) as { id: string; section_id: string; replaces: string | null; hidden: boolean; kind: Meeting['kind']; weekday: number | null; starts_at: string | null; ends_at: string | null; room_text: string | null }[];
    const replaced = new Set(personal.filter((p) => p.replaces).map((p) => p.replaces));
    const out = ms.filter((m) => !replaced.has(m.id));
    for (const p of personal) {
      if (p.hidden || p.weekday == null || !p.starts_at || !p.ends_at) continue;
      const sec = secs.get(p.section_id);
      if (!sec) continue;
      out.push({ ...sec, section_id: p.section_id, id: p.id, kind: p.kind, weekday: p.weekday, starts_at: p.starts_at, ends_at: p.ends_at, room_text: p.room_text, room_code: null, room_floor: null, room_directions: null, building_name: null, building_id: null, lat: null, lng: null, source: 'personal', confirmations: 0, online_url: null });
    }
    // one-off changes for the week on screen: a cancelled lecture, or one moved to another day/time
    const ws = weekStart(); const we = new Date(ws); we.setDate(ws.getDate() + 6);
    const secIds = [...secs.keys()];
    if (secIds.length) {
      const { data: ch } = await supabase.from('meeting_changes').select('*').in('section_id', secIds)
        .or(`and(on_date.gte.${ymd(ws)},on_date.lte.${ymd(we)}),and(new_date.gte.${ymd(ws)},new_date.lte.${ymd(we)})`);
      const inWeek = (d: string | null) => !!d && d >= ymd(ws) && d <= ymd(we);
      const dayOf = (d: string) => new Date(`${d}T12:00:00`).getDay();
      // a personal change wins over a section one for the same lecture
      const list = ((ch ?? []) as MeetingChange[]).sort((a, b) => Number(!!a.user_id) - Number(!!b.user_id));
      for (const c of list) {
        const orig = c.meeting_id ? out.find((m) => m.id === c.meeting_id && m.weekday === dayOf(c.on_date)) : undefined;
        if (inWeek(c.on_date) && orig) {
          if (c.cancelled) { orig.changed = 'cancelled'; orig.note = c.note; orig.change_id = c.id; }
          else out.splice(out.indexOf(orig), 1);
        }
        if (!c.cancelled && inWeek(c.new_date) && c.starts_at && c.ends_at) {
          const sec = secs.get(c.section_id); const base = c.meeting_id ? ms.find((m) => m.id === c.meeting_id) : undefined;
          if (sec) out.push({ ...(base ?? {} as Meeting), ...sec, section_id: c.section_id, id: `chg-${c.id}`, kind: base?.kind ?? 'lecture', weekday: dayOf(c.new_date!), starts_at: c.starts_at, ends_at: c.ends_at,
            room_text: c.room_text ?? base?.room_text ?? null, room_code: c.room_text ? null : base?.room_code ?? null, online_url: base?.online_url ?? null,
            room_floor: base?.room_floor ?? null, room_directions: base?.room_directions ?? null, building_name: c.room_text ? null : base?.building_name ?? null, building_id: base?.building_id ?? null, lat: base?.lat ?? null, lng: base?.lng ?? null,
            changed: 'moved', note: c.note, change_id: c.id, source: 'change', confirmations: 0 });
        }
      }
    }
    out.sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at));
    setMeetings(out);

    const { data: ev } = await supabase
      .from('academic_events')
      .select('id, section_id, owner_id, kind, title, starts_at, location, section:sections(course:courses(name_ar, name_en))')
      .gte('starts_at', new Date(Date.now() - 86400000).toISOString())
      .order('starts_at');
     
    setEvents(((ev ?? []) as any[]).map((x) => ({ ...x, course_name: x.section?.course?.name_ar ?? null })));
    setError(false);
    } catch { setError(true); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);
  // keep "next lecture" / "today" fresh: re-render every minute, reload when the app comes back to the front
  useEffect(() => {
    const iv = setInterval(() => setNow(new Date()), 60000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { setNow(new Date()); load(); } });
    return () => { clearInterval(iv); sub.remove(); };
  }, [load]);

  const next = meetings.filter((m) => m.changed !== 'cancelled')
    .map((m) => ({ m, mins: minutesUntil(m.weekday, m.starts_at, now) }))
    .sort((a, b) => a.mins - b.mins)[0];

  return { meetings, events, loading, error, reload: load, next, now };
}

export function placeLine(m: Pick<Meeting, 'kind' | 'building_name' | 'room_floor' | 'room_code'> & { room_text?: string | null }): string {
  if (m.kind === 'online') return t('أونلاين على التيمز');
  if (!m.room_code && m.room_text) return m.room_text;
  const parts = [m.building_name, m.room_floor != null ? (m.room_floor === 0 ? t('الطابق الأرضي') : t('الطابق {0}', [m.room_floor])) : null, m.room_code ? t('قاعة {0}', [m.room_code]) : null];
  return parts.filter(Boolean).join(t('، ')) || t('القاعة بتنضاف لما يأكدها زملاؤك');
}
