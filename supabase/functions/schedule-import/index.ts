// Read a student's timetable from a screenshot or photo with Claude, and give back courses with their times.
// The app shows the result for review before anything is saved.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = `This image is a university student's class timetable from Jordan (a screenshot of the registration portal, a printed schedule, or a photo). It may be in Arabic or English.
Read every course and every weekly meeting. Return ONLY JSON, no prose, in this shape:
{"courses":[{"name":"course name exactly as written","code":"course code or null","section":"section number as text or null","instructor":"or null",
"meetings":[{"days":[0-6],"start":"HH:MM","end":"HH:MM","room":"room/building as written or null","kind":"lecture|lab|online|tutorial"}]}]}
Days: 0=Sunday(الأحد/ح) 1=Monday(الإثنين/ن) 2=Tuesday(الثلاثاء/ث) 3=Wednesday(الأربعاء/ر) 4=Thursday(الخميس/خ) 5=Friday 6=Saturday(السبت/س).
Times in 24h: Jordanian classes run 08:00-20:00, so "2:00" or "2:00 م" is 14:00. If a row lists several days (e.g. "ح ث خ" or "Sun Tue Thu"), put them all in days.
Use kind "lab" for عملي/مختبر/Lab, "online" for عن بعد/online/Teams. If the image is not a timetable, return {"courses":[],"error":"not_schedule"}.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'auth' }, 401);
    const key = Deno.env.get('ANTHROPIC_API_KEY');
    if (!key) return json({ error: 'not_configured' }, 503);

    const { image, mime } = await req.json();
    if (typeof image !== 'string' || image.length < 100) return json({ error: 'no_image' }, 400);
    if (image.length > 7_000_000) return json({ error: 'too_big' }, 413);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('SCHEDULE_MODEL') ?? 'claude-sonnet-5-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mime === 'image/png' ? 'image/png' : 'image/jpeg', data: image } },
          { type: 'text', text: PROMPT },
        ] }],
      }),
    });
    if (!r.ok) { console.error('anthropic', r.status, (await r.text()).slice(0, 300)); return json({ error: 'ai_failed' }, 502); }
    const out = await r.json();
    const text: string = (out.content ?? []).map((c: { text?: string }) => c.text ?? '').join('');
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return json({ error: 'unreadable' }, 422);
    const parsed = JSON.parse(m[0]);
    const hhmm = (s: unknown) => (typeof s === 'string' && /^\d{1,2}:\d{2}$/.test(s.trim()) ? s.trim().padStart(5, '0') : null);
    const courses = (Array.isArray(parsed.courses) ? parsed.courses : []).slice(0, 15).map((c: Record<string, unknown>) => ({
      name: String(c.name ?? '').slice(0, 120), code: c.code ? String(c.code).slice(0, 20) : null,
      section: c.section ? String(c.section).replace(/[^0-9A-Za-z٠-٩]/g, '').slice(0, 6) || null : null,
      instructor: c.instructor ? String(c.instructor).slice(0, 80) : null,
      meetings: (Array.isArray(c.meetings) ? c.meetings : []).slice(0, 8).map((x: Record<string, unknown>) => ({
        days: (Array.isArray(x.days) ? x.days : []).map(Number).filter((d: number) => d >= 0 && d <= 6),
        start: hhmm(x.start), end: hhmm(x.end), room: x.room ? String(x.room).slice(0, 80) : null,
        kind: ['lecture', 'lab', 'online', 'tutorial'].includes(String(x.kind)) ? x.kind : 'lecture',
      })).filter((x: { days: number[]; start: string | null; end: string | null }) => x.days.length && x.start && x.end && x.end > x.start),
    })).filter((c: { name: string }) => c.name.length >= 2);
    return json({ courses, error: parsed.error ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: 'failed' }, 500);
  }
});
