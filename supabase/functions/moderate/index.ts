// Checks a new photo (post photo, story, profile photo) with Gemini. If it shows nudity, sexual content,
// graphic violence or hate symbols, the item is hidden and put in moderation_queue for an admin.
// Called by database triggers (0051_moderation.sql) with a shared secret kept in the database (private.push_cfg).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

const PROMPT = `You moderate photos for a university students' social app in Jordan.
Answer ONLY JSON: {"flag": boolean, "category": "nudity"|"sexual"|"violence"|"hate"|"none", "reason": "short English reason"}.
flag=true only for: nudity or sexual content (including underwear/lingerie focus), graphic violence/gore or weapons aimed at people,
hate symbols or extremist content. Normal selfies, friends, campus, food, notes, screenshots, memes without those → flag=false.`;

const b64 = (buf: ArrayBuffer) => {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

async function load(bucket: string, path: string): Promise<{ data: string; mime: string } | null> {
  let buf: ArrayBuffer; let mime = 'image/jpeg';
  if (/^https?:/.test(path)) {
    const r = await fetch(path); if (!r.ok) return null;
    mime = r.headers.get('content-type') ?? mime; buf = await r.arrayBuffer();
  } else {
    const { data, error } = await db.storage.from(bucket).download(path);
    if (error || !data) return null;
    mime = data.type || mime; buf = await data.arrayBuffer();
  }
  if (!mime.startsWith('image/') || buf.byteLength > 6_000_000) return null;
  return { data: b64(buf), mime: mime === 'image/png' || mime === 'image/webp' ? mime : 'image/jpeg' };
}

// Google retires model names and is sometimes busy: a short list with a time limit on each, then the Flash models
// this key has today (same approach as schedule-import).
async function flashModels(key: string): Promise<string[]> {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(6000) });
    const d = await r.json() as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
    return (d.models ?? []).filter((m) => /flash/.test(m.name) && !/image|tts|audio|live|thinking|exp/.test(m.name) && (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => m.name.replace(/^models\//, '')).sort((a, b) => b.localeCompare(a, 'en', { numeric: true })).slice(0, 3);
  } catch { return []; }
}

async function judge(img: { data: string; mime: string }): Promise<{ flag: boolean; category?: string; reason?: string } | null> {
  const key = env('GEMINI_API_KEY'); if (!key) return null;
  const tried = new Set<string>();
  const ask = async (model: string) => {
    tried.add(model);
    const g = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': key }, signal: AbortSignal.timeout(25000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: img.mime, data: img.data } }, { text: PROMPT }] }], generationConfig: { responseMimeType: 'application/json', temperature: 0 } }),
    }).catch(() => null);
    if (!g?.ok) { if (g) console.error('moderate', model, g.status); return undefined; }
    const j = await g.json();
    const text = (j.candidates?.[0]?.content?.parts ?? []).map((x: { text?: string }) => x.text ?? '').join('');
    try { return JSON.parse(text) as { flag: boolean; category?: string; reason?: string }; } catch { return null; }
  };
  for (const model of [env('GEMINI_MODEL'), 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean)) {
    const v = await ask(model); if (v !== undefined) return v;
  }
  for (const model of await flashModels(key)) {
    if (tried.has(model)) continue;
    const v = await ask(model); if (v !== undefined) return v;
  }
  return null;
}

async function queue(target_type: string, target_id: string, author_id: string | null, verdict: { category?: string; reason?: string }, media_url: string | null, excerpt: string | null) {
  await db.from('moderation_queue').insert({ target_type, target_id, author_id, reason: 'image', matched: `${verdict.category ?? ''}: ${verdict.reason ?? ''}`.slice(0, 200), media_url, excerpt });
  await db.rpc('mod_alert'); // one throttled push to the admins
}

Deno.serve(async (req) => {
  const sec = req.headers.get('x-mod-secret') ?? '';
  const { data: ok } = sec ? await db.rpc('mod_secret_ok', { s: sec }) : { data: false };
  if (ok !== true) return new Response('no', { status: 401 });
  const { type, id, dry } = await req.json().catch(() => ({}));
  try {
    if (type === 'post_media') {
      const { data: m } = await db.from('post_media').select('id, post_id, url, kind, post:posts(author_id, body)').eq('id', id).maybeSingle();
      if (!m || m.kind !== 'image') return Response.json({ skipped: true });
      const img = await load('posts', m.url); if (!img) return Response.json({ skipped: 'no_image' });
      const v = await judge(img); if (!v) return Response.json({ skipped: 'no_verdict' });
      if (v.flag && !dry) {
        await db.from('posts').update({ is_hidden: true }).eq('id', m.post_id);
        // deno-lint-ignore no-explicit-any
        await queue('post_media', m.id, (m.post as any)?.author_id ?? null, v, m.url, (m.post as any)?.body ?? null);
      }
      return Response.json(v);
    }
    if (type === 'story') {
      const { data: s } = await db.from('stories').select('id, author_id, media_url, kind, caption').eq('id', id).maybeSingle();
      if (!s || s.kind !== 'image' || !s.media_url) return Response.json({ skipped: true });
      const img = await load('stories', s.media_url); if (!img) return Response.json({ skipped: 'no_image' });
      const v = await judge(img); if (!v) return Response.json({ skipped: 'no_verdict' });
      if (v.flag && !dry) {
        await db.from('stories').update({ is_hidden: true }).eq('id', s.id);
        await queue('story', s.id, s.author_id, v, s.media_url, s.caption);
      }
      return Response.json(v);
    }
    if (type === 'avatar') {
      const { data: p } = await db.from('profiles').select('id, avatar_url').eq('id', id).maybeSingle();
      if (!p?.avatar_url) return Response.json({ skipped: true });
      const img = await load('avatars', p.avatar_url);
      if (!img) return Response.json({ skipped: 'no_image' });
      const v = await judge(img); if (!v) return Response.json({ skipped: 'no_verdict' });
      if (v.flag && !dry) {
        await db.from('profiles').update({ avatar_url: null }).eq('id', p.id);
        await queue('avatar', p.id, p.id, v, p.avatar_url, null);
      }
      return Response.json(v);
    }
    return Response.json({ skipped: 'type' });
  } catch (e) {
    return Response.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
});
