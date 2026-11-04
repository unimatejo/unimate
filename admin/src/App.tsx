import type { Session } from '@supabase/supabase-js';
import {
  BarChart3, BadgePercent, Bug, Flag, LifeBuoy, LogOut, Map, Megaphone, MessagesSquare, ScrollText, Send, ShieldCheck, SquareStack, Users,
} from 'lucide-react';
import { useEffect, useState, type ComponentType } from 'react';

import { supabase } from './lib';
import Ads from './pages/Ads';
import Admins from './pages/Admins';
import Audit from './pages/Audit';
import Campus from './pages/Campus';
import Content from './pages/Content';
import Errors from './pages/Errors';
import Conversations from './pages/Conversations';
import Notify from './pages/Notify';
import Offers from './pages/Offers';
import Overview from './pages/Overview';
import Reports from './pages/Reports';
import Support from './pages/Support';
import UsersPage from './pages/Users';

type Route = { key: string; label: string; icon: ComponentType<{ size?: number }>; page: ComponentType; owner?: boolean; badge?: string };
const ROUTES: Route[] = [
  { key: 'overview', label: 'نظرة عامة', icon: BarChart3, page: Overview },
  { key: 'reports', label: 'البلاغات', icon: Flag, page: Reports, badge: 'reports_open' },
  { key: 'users', label: 'المستخدمين', icon: Users, page: UsersPage },
  { key: 'chats', label: 'المحادثات', icon: MessagesSquare, page: Conversations },
  { key: 'content', label: 'المحتوى', icon: SquareStack, page: Content },
  { key: 'support', label: 'الدعم', icon: LifeBuoy, page: Support, badge: 'tickets_open' },
  { key: 'ads', label: 'الإعلانات', icon: Megaphone, page: Ads },
  { key: 'campus', label: 'الجامعات والخرائط', icon: Map, page: Campus, badge: 'campus_pending' },
  { key: 'offers', label: 'العروض', icon: BadgePercent, page: Offers },
  { key: 'notify', label: 'إرسال إشعار', icon: Send, page: Notify },
  { key: 'audit', label: 'سجل الإدارة', icon: ScrollText, page: Audit },
  { key: 'errors', label: 'أخطاء التطبيق', icon: Bug, page: Errors },
  { key: 'admins', label: 'المشرفين', icon: ShieldCheck, page: Admins, owner: true },
];

function useHash() {
  const [h, setH] = useState(() => location.hash.slice(1).split('?')[0] || 'overview');
  useEffect(() => {
    const f = () => setH(location.hash.slice(1).split('?')[0] || 'overview');
    addEventListener('hashchange', f); return () => removeEventListener('hashchange', f);
  }, []);
  return h;
}

function Login() {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
    setBusy(false);
    if (error) setMsg(error.message.includes('Signups not allowed') ? 'هالإيميل مش مسجّل. سجّل من التطبيق أول.' : error.message);
    else setSent(true);
  }
  // the same Microsoft account you use in the app (no code needed)
  async function microsoft() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'azure', options: { scopes: 'email openid profile', redirectTo: location.origin + location.pathname } });
    if (error) { setBusy(false); setMsg(error.message); }
  }
  async function verify() {
    setBusy(true); setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (error) setMsg('الرمز غلط أو انتهى.');
  }

  return (
    <div className="login">
      <div className="panel stack">
        <div className="brand" style={{ color: 'var(--ink)', padding: 0 }}><i style={{ color: '#fff' }}>ي</i>يونيميت · الإدارة</div>
        {!sent ? (
          <>
            <label className="f">الإيميل<input className="input ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} autoFocus /></label>
            <button className="btn" onClick={send} disabled={busy || !email.includes('@')}>ابعت رمز الدخول</button>
            <div className="muted small" style={{ textAlign: 'center' }}>أو</div>
            <button className="btn ghost" onClick={microsoft} disabled={busy}>ادخل بحساب Microsoft الجامعي</button>
          </>
        ) : (
          <>
            <div className="muted small">بعتنا رسالة لـ <b className="ltr">{email}</b>. افتح الرابط اللي فيها، أو اكتب الرمز إذا وصلك رمز.</div>
            <label className="f">الرمز<input className="input ltr" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} autoFocus /></label>
            <button className="btn" onClick={verify} disabled={busy || code.trim().length < 6}>ادخل</button>
            <button className="btn ghost" onClick={() => setSent(false)}>غيّر الإيميل</button>
          </>
        )}
        {msg && <div className="err small">{msg}</div>}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [role, setRole] = useState<'owner' | 'moderator' | null | undefined>(undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const route = useHash();

  useEffect(() => {
    // opened from the app's Settings: admin.unimate.my?h=<one-time code> signs in without typing anything
    const h = new URLSearchParams(location.search).get('h');
    if (h) {
      history.replaceState(null, '', location.pathname + location.hash);
      supabase.functions.invoke('admin-handoff', { body: { code: h } })
        .then(async ({ data }) => { if (data?.token_hash) await supabase.auth.verifyOtp({ token_hash: data.token_hash, type: 'magiclink' }); })
        .finally(() => supabase.auth.getSession().then(({ data }) => setSession(data.session)));
    } else supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setRole(session === null ? null : undefined); return; }
    supabase.from('admins').select('role').eq('user_id', session.user.id).maybeSingle().then(({ data }) => setRole((data?.role as 'owner' | 'moderator') ?? null));
  }, [session]);

  useEffect(() => {
    if (!role) return;
    const load = () => supabase.rpc('admin_stats').then(({ data }) => data && setCounts({ ...data, campus_pending: (data.aliases_pending ?? 0) + (data.places_pending ?? 0) }));
    load(); const t = setInterval(load, 60000); return () => clearInterval(t);
  }, [role]);

  if (session === undefined || (session && role === undefined)) return <div className="login muted">…</div>;
  if (!session) return <Login />;
  if (!role) return (
    <div className="login"><div className="panel stack">
      <h2>هالحساب مش مشرف</h2>
      <div className="muted small">رقم الحساب (بتحتاجه لتعيينه مشرف):</div>
      <code className="ltr" style={{ wordBreak: 'break-all' }}>{session.user.id}</code>
      <button className="btn soft" onClick={() => supabase.auth.signOut()}>اطلع</button>
    </div></div>
  );

  const routes = ROUTES.filter((r) => !r.owner || role === 'owner');
  const cur = routes.find((r) => r.key === route) ?? routes[0];
  const Page = cur.page;

  return (
    <div className="shell">
      <nav className="side" aria-label="القائمة">
        <div className="brand"><i>ي</i>يونيميت</div>
        {routes.map((r) => {
          const Icon = r.icon; const b = r.badge ? counts[r.badge] : 0;
          return (
            <a key={r.key} href={`#${r.key}`} className={`nav ${cur.key === r.key ? 'on' : ''}`} aria-current={cur.key === r.key ? 'page' : undefined}>
              <Icon size={18} />{r.label}{b ? <span className="badge">{b}</span> : null}
            </a>
          );
        })}
        <button className="nav" onClick={() => supabase.auth.signOut()}><LogOut size={18} />تسجيل الخروج</button>
        <div className="foot">{session.user.email}<br />{role === 'owner' ? 'المالك' : 'مشرف'}</div>
      </nav>
      <main className="main"><Page /></main>
    </div>
  );
}
