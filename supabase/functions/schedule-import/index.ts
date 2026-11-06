// Read a student's timetable from a screenshot or photo, and give back courses with their times.
// The app shows the result for review before anything is saved.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = `This image is a university student's class timetable from Jordan (a screenshot of the registration portal, a printed schedule, or a photo). It may be in Arabic or English.
Read EVERY row and EVERY weekly meeting exactly as written. Return ONLY JSON, no prose, in this shape:
{"courses":[{"name":"course name exactly as written","code":"course code or null","section":"section number as text or null","instructor":"or null",
"meetings":[{"days":[0-6],"start":"HH:MM","end":"HH:MM","room":"building and room as written, or null","kind":"lecture|lab|online|blended|tutorial"}]}]}
Days: 0=Sunday(الأحد/ح) 1=Monday(الإثنين/ن) 2=Tuesday(الثلاثاء/ث) 3=Wednesday(الأربعاء/ر) 4=Thursday(الخميس/خ) 5=Friday 6=Saturday(السبت/س).
Times in 24h: Jordanian classes run 08:00-20:00, so "2:00" or "2:00 م" is 14:00. If a row lists several days (e.g. "ح ث خ" or "Sun Tue Thu"), put them all in days.
If the same course has rows with different days, times or rooms, give each its own meeting with ITS OWN room. Never move a meeting to another day, never merge or repeat meetings.
kind: "lab" for عملي/مختبر/Lab; "online" ONLY when the course is fully remote (عن بعد / تعليم إلكتروني بالكامل); "blended" for مدمج / blended / hybrid (on campus some weeks and online others); otherwise "lecture".
room: copy the building and room (e.g. "مجمع قاعات ابن خلدون 115", "مبنى الكيمياء ك 229") even when a note is written next to it. If the room cell holds only a note (like "المادة تدرس بشكل مدمج في منصة مايكروسوفت تيمز" or "عن بعد") and no building or room, set room to null and use the note for kind.
Copy the section number exactly; if none is shown, use null. If the image is not a timetable, return {"courses":[],"error":"not_schedule"}.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const auth = req.headers.get('Authorization') ?? '';
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return json({ error: 'auth' }, 401);
    // paid reading service: a daily limit per account so nobody can run up the bill
    const { data: allowed } = await sb.rpc('take_ai_quota', { p_kind: 'schedule_import' });
    if (allowed === false) return json({ error: 'quota' }, 429);
    const gemini = Deno.env.get('GEMINI_API_KEY');
    if (!gemini) return json({ error: 'not_configured' }, 503);

    const { image, mime } = await req.json();
    if (typeof image !== 'string' || image.length < 100) return json({ error: 'no_image' }, 400);
    if (image.length > 7_000_000) return json({ error: 'too_big' }, 413);

    // Google retires model names and is sometimes overloaded: try a short list with a time limit on each,
    // then ask Google which Flash models this key has today and try those.
    const started = Date.now();
    const call = (model: string) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': gemini },
      signal: AbortSignal.timeout(Math.max(5000, Math.min(30000, 55000 - (Date.now() - started)))),
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime === 'image/png' ? 'image/png' : 'image/jpeg', data: image } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0 },
      }),
    }).catch((e) => { console.error('gemini', model, String(e)); return null; });
    async function available(): Promise<string[]> {
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': gemini! }, signal: AbortSignal.timeout(6000) });
        const d = await r.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
        return (d.models ?? []).filter((m) => /flash/.test(m.name) && !/image|tts|audio|live|thinking|exp/.test(m.name) && (m.supportedGenerationMethods ?? []).includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, '')).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
      } catch { return []; }
    }
    const tried = new Set<string>();
    let last: Response | null = null;
    const attempt = async (list: string[]): Promise<Response | null> => {
      for (const model of list) {
        if (tried.has(model) || Date.now() - started > 50000) continue;
        tried.add(model);
        const r = await call(model);
        if (r?.ok) return r;
        if (r) { last = r; console.error('gemini', model, r.status, (await r.text()).slice(0, 200)); }
      }
      return null;
    };
    const first = [Deno.env.get('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[];
    let g = await attempt(first);
    if (!g) g = await attempt((await available()).slice(0, 4));
    // one more go at the main model if Google was only busy
    if (!g && Date.now() - started < 40000) { tried.delete(first[0]); await new Promise((r) => setTimeout(r, 1500)); g = await attempt([first[0]]); }
    if (!g) return json({ error: (last as Response | null)?.status === 429 || (last as Response | null)?.status === 503 ? 'busy' : 'read_failed' }, 502);
    const go = await g.json();
    const text: string = (go.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('');
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
        kind: ['lecture', 'lab', 'online', 'blended', 'tutorial'].includes(String(x.kind)) ? x.kind : 'lecture',
      })).filter((x: { days: number[]; start: string | null; end: string | null }) => x.days.length && x.start && x.end && x.end > x.start),
    })).filter((c: { name: string }) => c.name.length >= 2);
    return json({ courses, error: parsed.error ?? null });
  } catch (e) {
    console.error(e);
    return json({ error: 'failed' }, 500);
  }
});
