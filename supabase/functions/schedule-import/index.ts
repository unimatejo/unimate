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

    // Google retires model names and its "latest" aliases are the busiest: ask which Flash models this key has today
    // (the exact names first), start the best one, and if it hasn't answered in a few seconds start the next one too.
    // The first good reading wins. A reading with no courses counts as a miss, so a weaker model can't end the search.
    const started = Date.now();
    const left = () => 55000 - (Date.now() - started);
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime === 'image/png' ? 'image/png' : 'image/jpeg', data: image } }, { text: PROMPT }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    let busy = false;
    async function read(model: string): Promise<Record<string, unknown> | null> {
      if (left() < 4000) return null;
      try {
        const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': gemini! }, body, signal: AbortSignal.timeout(Math.min(35000, left())),
        });
        if (!r.ok) { if (r.status === 429 || r.status === 503) busy = true; console.error('gemini', model, r.status, (await r.text()).slice(0, 160)); return null; }
        const go = await r.json();
        const text: string = (go.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('');
        const m = text.match(/\{[\s\S]*\}/);
        const parsed = m ? JSON.parse(m[0]) : null;
        if (!parsed || (!(Array.isArray(parsed.courses) && parsed.courses.length) && parsed.error !== 'not_schedule')) { console.error('gemini', model, 'empty'); return null; }
        return parsed;
      } catch (e) { console.error('gemini', model, String(e).slice(0, 120)); return null; }
    }
    async function models(): Promise<string[]> {
      try {
        const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': gemini! }, signal: AbortSignal.timeout(5000) });
        const d = await r.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
        const all = (d.models ?? []).filter((m) => /flash/.test(m.name) && !/image|tts|audio|live|thinking|exp|preview/.test(m.name) && (m.supportedGenerationMethods ?? []).includes('generateContent'))
          .map((m) => m.name.replace(/^models\//, '')).filter((n) => !/latest/.test(n)).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
        return [...all.filter((n) => !/lite/.test(n)), ...all.filter((n) => /lite/.test(n))];
      } catch { return []; }
    }
    const order = [...new Set([Deno.env.get('GEMINI_MODEL'), ...(await models()).slice(0, 3), 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[])];
    let parsed: Record<string, unknown> | null = null;
    await new Promise<void>((done) => {
      let i = 0, running = 0, finished = false;
      const finish = () => { if (!finished) { finished = true; done(); } };
      const next = () => {
        if (finished) return;
        if (i >= order.length || left() < 4000) { if (!running) finish(); return; }
        const model = order[i++]; running++;
        // a model that hasn't answered in 9 seconds gets company; a failed one is replaced at once
        const hedge = setTimeout(next, 9000);
        read(model).then((p) => { running--; clearTimeout(hedge); if (p && !parsed) { parsed = p; finish(); } else if (!finished) next(); });
      };
      next();
    });
    if (!parsed) return json({ error: busy ? 'busy' : 'read_failed' }, 502);
    parsed = parsed as Record<string, unknown>;
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
