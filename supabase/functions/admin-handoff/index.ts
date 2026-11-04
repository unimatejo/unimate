// Trades a one-time code from the app (admin_handoff_code, 60s, single use) for a sign-in on admin.unimate.my,
// so the owner opens the admin panel from Settings without logging in again.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = { 'Access-Control-Allow-Origin': 'https://admin.unimate.my', 'Access-Control-Allow-Headers': 'content-type, apikey, authorization, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { code } = await req.json().catch(() => ({}));
  if (typeof code !== 'string' || !/^[0-9a-f]{48}$/.test(code)) return json({ error: 'bad_code' }, 400);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: uid } = await db.rpc('admin_handoff_take', { p_code: code });
  if (!uid) return json({ error: 'expired' }, 401);
  const { data: isAdmin } = await db.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
  if (!isAdmin) return json({ error: 'admins_only' }, 403);
  const { data: u } = await db.auth.admin.getUserById(uid as string);
  const email = u?.user?.email;
  if (!email) return json({ error: 'no_email' }, 400);
  const { data: link, error } = await db.auth.admin.generateLink({ type: 'magiclink', email });
  if (error || !link?.properties?.hashed_token) return json({ error: 'link_failed' }, 500);
  return json({ token_hash: link.properties.hashed_token });
});
