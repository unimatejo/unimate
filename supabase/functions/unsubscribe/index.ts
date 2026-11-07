// One-click unsubscribe from offer emails (link at the bottom of every offer email).
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { sign } from '../_shared/offer.ts';

const page = (msg: string) => new Response(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>يونيميت</title><body style="font-family:Tahoma,Arial,sans-serif;background:#F5F6FA;margin:0;display:grid;place-items:center;min-height:100vh"><div style="background:#fff;border-radius:22px;padding:28px;max-width:360px;text-align:center;color:#0E1430"><b style="font-size:20px">يونيميت</b><p style="line-height:1.8">${msg}</p><a href="https://unimate.my" style="color:#2E5BFF">unimate.my</a></div></body></html>`, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });

Deno.serve(async (req) => {
  const q = new URL(req.url).searchParams;
  const u = q.get('u') ?? '', s = q.get('s') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(u) || s !== (await sign(u))) return page('الرابط غير صالح.');
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await db.from('notification_prefs').upsert({ user_id: u, email_offers: false }, { onConflict: 'user_id' });
  return page('تم. لن تصلك العروض على بريدك الإلكتروني بعد الآن، ويمكنك إعادة تفعيلها من إعدادات التنبيهات في التطبيق.');
});
