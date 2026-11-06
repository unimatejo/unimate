// Moodle → timetable. Reads the student's own Moodle calendar export link (iCal) and adds each upcoming deadline
// (assignments, quizzes, exams) to their events, once per Moodle event. It writes AS the student, so the same rules
// as typing it in apply (0102): their own rows, and a course they're enrolled in counts toward the section's quorum.
// Safety: only https links on the student's own university domain, Moodle's export path, no redirects elsewhere,
// 10 s and 2 MB at most.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = { 'Access-Control-Allow-Origin': 'https://app.unimate.my', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const DAY = 86400000;

type Ics = { uid: string; summary: string; start: Date; categories: string; description: string };

/** iCal date → Date. "…Z" is UTC; a TZID or floating time is Jordan time (UTC+3 all year since 2022). */
export function icsDate(v: string, params: string): Date | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '23', mi = '59', s = '00', z] = m;
  const utc = z || /TZID=(UTC|GMT|Etc\/UTC)/i.test(params);
  const iso = `${y}-${mo}-${d}T${h}:${mi}:${s}${utc ? 'Z' : '+03:00'}`;
  const t = new Date(iso);
  return isNaN(t.getTime()) ? null : t;
}

export function parseIcs(text: string): Ics[] {
  const lines = text.replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const out: Ics[] = [];
  let cur: Record<string, { v: string; p: string }> | null = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur) {
        const when = cur.DTEND ?? cur.DTSTART; // a deadline is when it closes
        const start = when ? icsDate(when.v, when.p) : null;
        const uid = cur.UID?.v;
        if (start && uid) out.push({ uid, start, summary: unesc(cur.SUMMARY?.v ?? ''), categories: unesc(cur.CATEGORIES?.v ?? ''), description: unesc(cur.DESCRIPTION?.v ?? '') });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 1) continue;
    const head = line.slice(0, i), [name, ...params] = head.split(';');
    cur[name.toUpperCase()] = { v: line.slice(i + 1), p: params.join(';') };
  }
  return out;
}
const unesc = (s: string) => s.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').replace(/\s+/g, ' ').trim();

/** What kind of deadline, from Moodle's own wording (English or Arabic). */
export function kindOf(s: string): 'assignment' | 'quiz' | 'exam_mid' | 'exam_final' | 'project' {
  const x = s.toLowerCase();
  if (/final|نهائي/.test(x)) return 'exam_final';
  if (/mid|نصفي/.test(x)) return 'exam_mid';
  if (/quiz|كويز|اختبار قصير|اختبار/.test(x)) return 'quiz';
  if (/project|مشروع/.test(x)) return 'project';
  return 'assignment';
}

// Arabic spelled loosely the same way: no diacritics, one alef, ya, ta marbuta
const arNorm = (s: string) => s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/\s+/g, ' ').trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const base = Deno.env.get('SUPABASE_URL')!, anon = Deno.env.get('SUPABASE_ANON_KEY')!;
  const auth = req.headers.get('Authorization') ?? '';
  // every read and write below is the student's own, under the database rules
  const db = createClient(base, anon, { global: { headers: { Authorization: auth } } });
  const { data: u } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ''));
  const user = u?.user;
  if (!user) return json({ error: 'not_signed_in' }, 401);

  const body = await req.json().catch(() => ({})) as { url?: string; forget?: boolean };
  if (body.forget) { await db.from('moodle_links').delete().eq('user_id', user.id); return json({ ok: true }); }
  let link = typeof body.url === 'string' ? body.url.trim() : '';
  if (!link) {
    const { data: saved } = await db.from('moodle_links').select('url').eq('user_id', user.id).maybeSingle();
    link = saved?.url ?? '';
  }
  if (!link) return json({ error: 'no_link' }, 400);

  // the link must be the student's own university's Moodle export
  let target: URL;
  try { target = new URL(link); } catch { return json({ error: 'bad_link' }, 400); }
  const { data: prof } = await db.from('profiles').select('university:universities(email_domains)').eq('id', user.id).maybeSingle();
  const roots = (((prof as { university?: { email_domains?: string[] } } | null)?.university?.email_domains) ?? [])
    .map((d) => d.toLowerCase().replace(/^(std|sta|st|ses|stu|student|students)\./, ''));
  const host = target.hostname.toLowerCase();
  const onCampus = roots.some((r) => host === r || host.endsWith(`.${r}`));
  if (target.protocol !== 'https:' || !onCampus || /^\d+\.\d+\.\d+\.\d+$/.test(host) || target.port) return json({ error: 'not_university' }, 400);
  if (!/\/calendar\/export_execute\.php$/.test(target.pathname) || !target.searchParams.get('authtoken')) return json({ error: 'not_export_link' }, 400);

  let text = '';
  try {
    const r = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { Accept: 'text/calendar' } });
    if (r.status >= 300 && r.status < 400) return json({ error: 'moodle_refused' }, 400);
    if (!r.ok) return json({ error: 'moodle_refused', status: r.status }, 400);
    const buf = new Uint8Array(await r.arrayBuffer());
    if (buf.byteLength > 2_000_000) return json({ error: 'too_big' }, 400);
    text = new TextDecoder().decode(buf);
  } catch { return json({ error: 'moodle_unreachable' }, 400); }
  if (!text.includes('BEGIN:VCALENDAR')) return json({ error: 'not_calendar' }, 400);

  const now = Date.now();
  const items = parseIcs(text).filter((e) => e.start.getTime() > now - DAY && e.start.getTime() < now + 150 * DAY).slice(0, 200);

  // match each deadline to one of my courses: by code first, then by the course name
  const { data: enr } = await db.from('enrollments').select('section:sections(id, course:courses(code, name_ar, name_en))').eq('user_id', user.id);
  const secs = ((enr ?? []) as { section: { id: string; course: { code: string; name_ar: string; name_en: string | null } } | null }[])
    .map((e) => e.section).filter((s): s is NonNullable<typeof s> => !!s?.course);
  const sectionFor = (e: Ics) => {
    const hay = `${e.categories} ${e.summary} ${e.description}`;
    const flat = hay.replace(/\s+/g, '').toLowerCase();
    const byCode = secs.find((s) => s.course.code && !/^X[0-9A-F]{6,}$/.test(s.course.code) && flat.includes(s.course.code.replace(/\s+/g, '').toLowerCase()));
    if (byCode) return byCode.id;
    const h = arNorm(hay);
    return secs.find((s) => [s.course.name_ar, s.course.name_en].some((n) => n && arNorm(n).length >= 4 && h.includes(arNorm(n))))?.id ?? null;
  };

  const { data: had } = await db.from('academic_events').select('id, ext_uid, starts_at, title').eq('owner_id', user.id).eq('source', 'moodle');
  const known = new Map(((had ?? []) as { id: string; ext_uid: string; starts_at: string; title: string }[]).map((x) => [x.ext_uid, x]));
  let added = 0, updated = 0, matched = 0;
  for (const e of items) {
    const title = (e.summary || 'Moodle').replace(/\s+(is due|is due to be graded|closes|opens|يغلق|يفتح|مستحق|يستحق)$/i, '').slice(0, 80);
    const section = sectionFor(e);
    if (section) matched++;
    const old = known.get(e.uid);
    if (old) {
      if (new Date(old.starts_at).getTime() !== e.start.getTime() || old.title !== title) {
        await db.from('academic_events').update({ starts_at: e.start.toISOString(), title }).eq('id', old.id);
        updated++;
      }
      continue;
    }
    const { error } = await db.from('academic_events').insert({
      owner_id: user.id, created_by: user.id, section_id: section, kind: kindOf(`${e.summary} ${e.description}`), title,
      starts_at: e.start.toISOString(), source: 'moodle', ext_uid: e.uid, shared_ask: !!section,
    });
    if (!error) added++;
  }
  await db.from('moodle_links').upsert({ user_id: user.id, url: target.toString(), synced_at: new Date().toISOString(), last_count: items.length });
  return json({ ok: true, found: items.length, added, updated, matched });
});
