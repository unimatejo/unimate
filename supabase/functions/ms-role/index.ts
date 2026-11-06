// After a Microsoft sign-in: read the person's job title from Microsoft and set their academic title
// (doctor, professor, dean, president…). The title comes from Microsoft itself, checked to be the same
// account as the signed-in user and a staff (not student) university email, never from the app.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = { 'Access-Control-Allow-Origin': 'https://app.unimate.my', 'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

/** Microsoft job title (Arabic or English) → the app's title. Most specific first. */
export function titleFrom(job: string): string | null {
  const j = job.toLowerCase().trim();
  if (!j) return null;
  const has = (re: RegExp) => re.test(j);
  if (has(/نائب رئيس|vice[ -]?president/)) return 'vice_president';
  if (has(/رئيس الجامعة|^president|university president/)) return 'president';
  if (has(/نائب عميد|vice[ -]?dean|associate dean|assistant dean/)) return 'vice_dean';
  if (has(/عميد|\bdean\b/)) return 'dean';
  if (has(/رئيس قسم|head of|\bchair(man|person)?\b/)) return 'head';
  if (has(/أستاذ مشارك|استاذ مشارك|associate professor/)) return 'assoc_prof';
  if (has(/أستاذ مساعد|استاذ مساعد|assistant professor/)) return 'asst_prof';
  if (has(/مساعد تدريس|teaching assistant|\bta\b/)) return 'teacher_assistant';
  if (has(/محاضر|lecturer|instructor|مدرس/)) return 'lecturer';
  if (has(/أستاذ دكتور|استاذ دكتور|^أستاذ$|^استاذ$|\bprofessor\b|full professor/)) return 'prof';
  if (has(/دكتور|^dr\b|doctor/)) return 'doctor';
  return 'staff';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const db = createClient(url, service);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: u } = await db.auth.getUser(jwt);
  const user = u?.user;
  if (!user?.email) return json({ error: 'not_signed_in' }, 401);
  const { token } = await req.json().catch(() => ({ token: null }));
  if (typeof token !== 'string' || token.length < 20) return json({ error: 'missing_token' }, 400);

  const g = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,mail,userPrincipalName,jobTitle,department', { headers: { Authorization: `Bearer ${token}` } });
  if (!g.ok) return json({ error: 'microsoft_refused' }, 400);
  const me = await g.json() as { id?: string; mail?: string | null; userPrincipalName?: string | null; jobTitle?: string | null; department?: string | null };

  // the Microsoft account must be this user's own
  const email = user.email.toLowerCase();
  const azure = (user.identities ?? []).find((i) => i.provider === 'azure');
  const same = (azure && me.id && (azure.id === me.id || azure.identity_data?.sub === me.id || azure.identity_data?.oid === me.id))
    || [me.mail, me.userPrincipalName].some((x) => (x ?? '').toLowerCase() === email);
  if (!same) return json({ error: 'different_account' }, 403);

  // staff emails only (students' addresses are on std./stu. sub-domains or numeric)
  const [local, dom] = email.split('@');
  const { data: unis } = await db.from('universities').select('email_domains');
  const staffDomain = (unis ?? []).some((x: { email_domains: string[] }) => x.email_domains.some((d) => dom === d && !/^(std|sta|ses|stu|student)\./.test(d)));
  if (!staffDomain || /^[0-9]+$/.test(local)) return json({ skipped: 'student' });

  const title = titleFrom(me.jobTitle ?? '');
  if (!title) return json({ skipped: 'no_job_title' });
  const { data: applied, error } = await db.rpc('ms_apply_title', { p_user: user.id, p_title: title, p_department: me.department ?? null });
  if (error) { console.error('ms_apply_title', error.message); return json({ error: 'save_failed' }, 500); }
  return json({ title, applied });
});
