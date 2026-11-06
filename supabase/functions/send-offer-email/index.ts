// Sends one offer (already saved by admin_send_offer) by email to students who opted in.
// Needs the secret SMTP_PASS (the shannik@unimate.my mailbox password), set by the owner in Supabase › Edge Functions › Secrets.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import nodemailer from 'npm:nodemailer@6.9.14';
import { FN_BASE, sign } from '../_shared/offer.ts';

const cors = { 'Access-Control-Allow-Origin': 'https://app.unimate.my', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const pass = Deno.env.get('SMTP_PASS');
  if (!pass) return json({ error: 'smtp_not_configured' }, 400);

  // caller must be an admin
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const { data: isAdmin } = await asUser.rpc('is_admin');
  if (!isAdmin) return json({ error: 'admins_only' }, 403);

  const { send_id } = await req.json().catch(() => ({}));
  if (!send_id) return json({ error: 'missing send_id' }, 400);
  const db = createClient(url, service);
  const { data: s } = await db.from('offer_sends').select('*').eq('id', send_id).single();
  if (!s) return json({ error: 'not_found' }, 404);
  if (s.emailed > 0) return json({ error: 'already_sent', emailed: s.emailed }, 409);
  const { data: people, error } = await db.rpc('offer_email_targets', { sid: send_id });
  if (error) return json({ error: error.message }, 500);

  const from = Deno.env.get('SMTP_USER') ?? 'shannik@unimate.my';
  const tx = nodemailer.createTransport({ host: Deno.env.get('SMTP_HOST') ?? 'smtp.hostinger.com', port: 465, secure: true, auth: { user: from, pass } });
  let sent = 0; const failed: string[] = [];
  for (const p of (people ?? []) as { user_id: string; email: string; full_name: string | null }[]) {
    const unsub = `${FN_BASE}/unsubscribe?u=${p.user_id}&s=${await sign(p.user_id)}`;
    const link = s.link && /^https:\/\//.test(s.link) ? `<p style="margin:18px 0"><a href="${esc(s.link)}" style="background:#2E5BFF;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;display:inline-block">شوف العرض</a></p>` : '';
    const html = `<!doctype html><html lang="ar" dir="rtl"><body style="margin:0;background:#F5F6FA;font-family:Tahoma,Arial,sans-serif"><div style="max-width:480px;margin:0 auto;padding:24px 12px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto 16px"><tr><td style="padding-left:10px;vertical-align:middle"><img src="https://unimate.my/logo.png" width="40" height="40" alt="UniMate" style="display:block;border-radius:11px;border:0"></td><td style="vertical-align:middle;font-size:20px;font-weight:bold;color:#0E1430" dir="ltr">UniMate | يونيميت</td></tr></table>
      <div style="background:#fff;border-radius:22px;padding:24px;text-align:right;color:#0E1430"><div style="height:6px;border-radius:3px;background:#7C3AED;background-image:linear-gradient(90deg,#FFB547,#FF4F7B,#7C3AED);margin-bottom:18px"></div>
      <h2 style="font-size:19px;margin:0 0 8px">${esc(s.title)}</h2>
      <div style="font-size:15px;line-height:1.8;color:#3B4466;white-space:pre-line">${esc(s.body ?? '')}</div>${link}
      <div style="font-size:12px;color:#9AA1B8;border-top:1px solid #E4E7F0;margin-top:18px;padding-top:12px">وصلك هالإيميل لأنك فعّلت «عروض على الإيميل» بيونيميت. <a href="${unsub}" style="color:#6B7391">إلغاء الاشتراك</a></div>
    </div></div></body></html>`;
    try {
      await tx.sendMail({ from: `يونيميت <${from}>`, to: p.email, subject: s.title, html, text: `${s.title}\n\n${s.body ?? ''}\n\nإلغاء الاشتراك: ${unsub}`,
        headers: { 'List-Unsubscribe': `<${unsub}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
      sent++;
    } catch { failed.push(p.email.replace(/^(.).*@/, '$1***@')); }
    await new Promise((r) => setTimeout(r, 300)); // stay under the mailbox's sending rate
  }
  await db.from('offer_sends').update({ emailed: sent }).eq('id', send_id);
  return json({ sent, failed: failed.length, total: (people ?? []).length });
});
