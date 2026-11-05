// Sends a push to every device of the people a new notification / message is for.
// Called by database triggers (0038_push.sql) with the shared secret PUSH_SECRET.
// Web push uses VAPID_PUBLIC / VAPID_PRIVATE. Android (FCM) is used when FCM_SERVICE_ACCOUNT (the Firebase JSON) is set.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import webpush from 'npm:web-push@3.6.7';

const env = (k: string) => Deno.env.get(k) ?? '';
const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));
webpush.setVapidDetails('mailto:shannik@unimate.my', env('VAPID_PUBLIC'), env('VAPID_PRIVATE'));

type Push = { user_id: string; title: string; body: string; url: string; tag: string; icon?: string };
type Tok = { token: string; user_id: string; platform: string; keys: { p256dh: string; auth: string } | null };

const PREVIEW: Record<string, string> = {
  image: '📷 صورة', view_once: '📷 صورة لمرة وحدة', voice: '🎤 رسالة صوتية', file: '📎 ملف', sticker: 'ستيكر',
  location: '📍 موقع', contact: '👤 جهة اتصال', poll: '📊 استطلاع رأي', post_share: 'شارك منشور', story_reply: 'رد على الستوري', social_share: 'شارك رابط',
};
const SOCIAL = new Set(['like', 'comment', 'follow', 'follow_request', 'mention', 'story_like']);

async function forMessage(id: string): Promise<Push[]> {
  const { data: m } = await db.from('messages').select('id, conversation_id, sender_id, kind, body').eq('id', id).maybeSingle();
  if (!m) return [];
  const [{ data: c }, { data: who }, { data: mem }] = await Promise.all([
    db.from('conversations').select('kind, title, vanish').eq('id', m.conversation_id).maybeSingle(),
    db.from('profiles').select('full_name, avatar_url').eq('id', m.sender_id).maybeSingle(),
    db.from('conversation_members').select('user_id, state, muted').eq('conversation_id', m.conversation_id),
  ]);
  if (!c || !['direct', 'group'].includes(c.kind)) return [];
  const to = (mem ?? []).filter((x) => x.user_id !== m.sender_id && x.state !== 'left' && !x.muted).map((x) => x.user_id);
  if (!to.length) return [];
  const { data: prefs } = await db.from('notification_prefs').select('user_id, messages, preview').in('user_id', to);
  const off = new Set((prefs ?? []).filter((p) => p.messages === false).map((p) => p.user_id));
  // "show message text" off: the lock screen only says there's a new message
  const hidden = new Set((prefs ?? []).filter((p) => p.preview === false).map((p) => p.user_id));
  const name = who?.full_name || 'حدا';
  const text = c.vanish ? 'رسالة جديدة' : (m.kind === 'text' ? (m.body ?? '') : PREVIEW[m.kind] ?? 'رسالة جديدة').slice(0, 140);
  const group = c.kind === 'group';
  return to.filter((u) => !off.has(u)).map((u) => ({
    user_id: u,
    title: group ? (c.title || 'مجموعة') : (hidden.has(u) ? 'يونيميت' : name),
    body: hidden.has(u) ? 'رسالة جديدة' : group ? `${name}: ${text}` : text,
    url: `/messages/${m.conversation_id}`,
    tag: `c-${m.conversation_id}`,
    icon: hidden.has(u) ? undefined : who?.avatar_url ?? undefined,
  }));
}

async function forNotification(id: string): Promise<Push[]> {
  const { data: n } = await db.from('notifications').select('id, user_id, kind, actor_id, title, body, data').eq('id', id).maybeSingle();
  if (!n) return [];
  const { data: p } = await db.from('notification_prefs').select('social, community, ads').eq('user_id', n.user_id).maybeSingle();
  if (p && SOCIAL.has(n.kind) && p.social === false) return [];
  if (p && n.kind === 'offer' && p.ads === false) return [];
  const d = (n.data ?? {}) as Record<string, string>;
  const url = n.kind === 'announcement' ? '/announcements'
    : n.kind === 'ride' ? (d.ride_id ? `/rides/${d.ride_id}` : '/rides')
    : d.conversation_id ? `/messages/${d.conversation_id}`
    : d.post_id ? `/post/${d.post_id}`
    : d.user_id ? `/user/${d.user_id}`
    : n.actor_id && SOCIAL.has(n.kind) ? `/user/${n.actor_id}` : '/notifications';
  return [{ user_id: n.user_id, title: n.title, body: n.body ?? '', url, tag: `n-${n.id}` }];
}

// ---------- FCM (Android) ----------
let fcm: { token: string; exp: number } | null = null;
const b64u = (b: ArrayBuffer | string) => btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
async function fcmAuth(sa: { client_email: string; private_key: string }) {
  if (fcm && fcm.exp > Date.now() + 60_000) return fcm.token;
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = b64u(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${claim}`)));
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${head}.${claim}.${sig}` });
  const j = await r.json();
  fcm = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
  return fcm.token;
}

const why: string[] = [];
async function send(t: Tok, p: Push): Promise<'ok' | 'gone' | 'fail'> {
  try {
    if (t.platform === 'web' && t.keys) {
      await webpush.sendNotification({ endpoint: t.token, keys: t.keys }, JSON.stringify({ title: p.title, body: p.body, url: p.url, tag: p.tag, icon: p.icon }), { TTL: 86400, urgency: 'high' });
      return 'ok';
    }
    if (t.platform === 'android' && env('FCM_SERVICE_ACCOUNT')) {
      const sa = JSON.parse(env('FCM_SERVICE_ACCOUNT'));
      const r = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
        method: 'POST', headers: { Authorization: `Bearer ${await fcmAuth(sa)}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: { token: t.token, notification: { title: p.title, body: p.body }, data: { url: p.url }, android: { priority: 'high', notification: { tag: p.tag, channel_id: 'messages', sound: 'default' } } } }),
      });
      if (r.status === 404 || r.status === 400) return 'gone';
      if (!r.ok) why.push(`fcm ${r.status} ${(await r.text()).slice(0, 160)}`);
      return r.ok ? 'ok' : 'fail';
    }
    return 'fail';
  } catch (e) {
    const s = (e as { statusCode?: number }).statusCode;
    why.push(`${t.platform} ${s ?? ''} ${String((e as Error).message ?? e).slice(0, 120)}`);
    return s === 404 || s === 410 ? 'gone' : 'fail';
  }
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== env('PUSH_SECRET') || !env('PUSH_SECRET')) return new Response('no', { status: 401 });
  const { type, id } = await req.json().catch(() => ({}));
  const pushes = type === 'message' ? await forMessage(id) : type === 'notification' ? await forNotification(id) : [];
  if (!pushes.length) return Response.json({ sent: 0 });
  const { data: toks } = await db.from('push_tokens').select('token, user_id, platform, keys').in('user_id', [...new Set(pushes.map((p) => p.user_id))]);
  const gone: string[] = [];
  let sent = 0;
  await Promise.all((toks ?? []).flatMap((t: Tok) => pushes.filter((p) => p.user_id === t.user_id).map(async (p) => {
    const r = await send(t, p);
    if (r === 'ok') sent++; else if (r === 'gone') gone.push(t.token);
  })));
  if (gone.length) await db.from('push_tokens').delete().in('token', gone); // the browser / phone unsubscribed
  return Response.json({ sent, gone: gone.length, why: why.splice(0) });
});
