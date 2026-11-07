// The owner's own texts (the home greeting, the banner, a notification) in English for students who use the app in
// English. Admins only, a few short texts at a time; the owner sees the English and can change it before saving.
import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const PROMPT = `Translate each Arabic text in the JSON array below into natural, friendly English for a university students' app.
Keep emoji, numbers, links and the placeholder {name} exactly as they are. Keep it as short as the original.
Return ONLY a JSON array of strings, in the same order and the same length.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: admin } = await sb.rpc('is_admin');
    if (!admin) return json({ error: 'admins_only' }, 403);
    const key = Deno.env.get('GEMINI_API_KEY');
    if (!key) return json({ error: 'not_configured' }, 503);

    const { texts } = await req.json().catch(() => ({}));
    if (!Array.isArray(texts) || !texts.length || texts.length > 12 || texts.some((x) => typeof x !== 'string' || x.length > 600)) return json({ error: 'bad_input' }, 400);

    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: `${PROMPT}\n\n${JSON.stringify(texts)}` }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
    });
    for (const model of [...new Set([Deno.env.get('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean) as string[])]) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, body, signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      if (!r?.ok) continue;
      const out = await r.json();
      const text: string = (out.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('');
      try {
        const en = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? '');
        if (Array.isArray(en) && en.length === texts.length) return json({ texts: en.map((x) => String(x).slice(0, 600)) });
      } catch { /* the next model */ }
    }
    return json({ error: 'failed' }, 502);
  } catch (e) {
    console.error(e);
    return json({ error: 'failed' }, 500);
  }
});
