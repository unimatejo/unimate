import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { supabase } from './supabase';
import { minutesUntil } from './util';
import { t } from './i18n';

export type Meeting = {
  id: string; section_id: string; kind: 'lecture' | 'lab' | 'online' | 'tutorial';
  weekday: number; starts_at: string; ends_at: string; online_url: string | null;
  course_name: string; course_code: string; section_no: string; instructor: string | null;
  room_code: string | null; room_text?: string | null; source?: string; confirmations?: number; room_floor: number | null; room_directions: string | null;
  building_name: string | null; building_id: string | null; lat: number | null; lng: number | null;
};

export type AcademicEvent = {
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
    const { data: enr, error: enrErr } = await supabase
      .from('enrollments')
      .select(`section:sections(id, section_no, instructor,
        course:courses(name_ar, name_en, code),
        meetings:section_meetings(id, kind, weekday, starts_at, ends_at, online_url, room_text, source, confirmations,
          room:rooms(code, floor, directions, building:buildings(id, name_ar, lat, lng))))`)
      .eq('user_id', userId);
    if (enrErr) throw enrErr;

    const ms: Meeting[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const e of (enr ?? []) as any[]) {
      const s = e.section; if (!s) continue;
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
    ms.sort((a, b) => a.weekday - b.weekday || a.starts_at.localeCompare(b.starts_at));
    setMeetings(ms);

    const { data: ev } = await supabase
      .from('academic_events')
      .select('id, section_id, owner_id, kind, title, starts_at, location, section:sections(course:courses(name_ar, name_en))')
      .gte('starts_at', new Date(Date.now() - 86400000).toISOString())
      .order('starts_at');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const next = meetings
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
