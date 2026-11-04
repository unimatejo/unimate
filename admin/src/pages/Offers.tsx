import { useState } from 'react';

import { fmtDate, fmtNum, supabase, useLoad, useUnis } from '../lib';
import { Top } from '../ui';

type Send = { id: string; title: string; university_id: string | null; in_app: number; emailed: number; created_at: string };

/** Offers: in-app to students who keep "offers" on, and by email to those who opted in. */
export default function Offers() {
  const unis = useUnis();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [uni, setUni] = useState('');
  const [email, setEmail] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const hist = useLoad(() => supabase.from('offer_sends').select('id, title, university_id, in_app, emailed, created_at').order('created_at', { ascending: false }).limit(30), [tick]);

  const badLink = link.trim() !== '' && !/^https:\/\/\S+$/.test(link.trim());

  async function send() {
    const who = uni ? unis.find((u) => u.id === uni)?.name_ar : 'كل الجامعات';
    if (!confirm(`رح يوصل العرض لطلاب ${who}${email ? '، وعلى الإيميل للي مفعّلين العروض على الإيميل' : ''}. أكيد؟`)) return;
    setBusy(true); setMsg(null);
    try {
      const { data, error } = await supabase.rpc('admin_send_offer', { title: title.trim(), body: body.trim() || null, uni: uni || null, link: link.trim() || null });
      if (error) { setMsg(error.message); return; }
      const r = data as { id: string; in_app: number; email_reach: number };
      let line = `وصل جوا التطبيق لـ ${fmtNum(r.in_app)} طالب ✓`;
      if (email && r.email_reach > 0) {
        const { data: e, error: ee } = await supabase.functions.invoke('send-offer-email', { body: { send_id: r.id } });
        if (ee) {
          const code = await (ee as { context?: Response }).context?.json?.().catch(() => null);
          line += code?.error === 'smtp_not_configured' ? '. الإيميل لسا مش مفعّل: لازم تحط كلمة سر support@unimate.my بأسرار Supabase (SMTP_PASS).' : `. الإيميل ما انبعت: ${ee.message}`;
        } else line += `، وعلى الإيميل لـ ${fmtNum((e as { sent: number }).sent)} من ${fmtNum((e as { total: number }).total)}`;
      } else if (email) line += '. ما في حدا مفعّل العروض على الإيميل لهلأ.';
      setMsg(line); setTitle(''); setBody(''); setLink(''); setTick((x) => x + 1);
    } finally { setBusy(false); }
  }

  return (
    <div className="stack" style={{ maxWidth: 720 }}>
      <Top title="العروض" sub="جوا التطبيق للي مفعّلين «عروض المطاعم والمحلات»، وعلى الإيميل للي وافقوا بس" />
      <div className="panel stack">
        <label className="f">لمين<select className="input" value={uni} onChange={(e) => setUni(e.target.value)}><option value="">كل الجامعات</option>{unis.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}</select></label>
        <label className="f">العنوان<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="خصم 20% لطلاب الأردنية" /></label>
        <label className="f">التفاصيل<textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} /></label>
        <label className="f">رابط العرض (اختياري)<input className="input" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /></label>
        {badLink && <div className="small" style={{ color: 'var(--red, #d33)' }}>الرابط لازم يبدأ بـ https://</div>}
        <label className="f" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)} />كمان على الإيميل</label>
        <button className="btn" onClick={send} disabled={busy || title.trim().length < 3 || badLink}>{busy ? 'عم يبعت…' : 'ابعت العرض'}</button>
        {msg && <div className="small">{msg}</div>}
      </div>
      <div className="panel stack">
        <b>آخر العروض</b>
        {((hist.data ?? []) as Send[]).map((s) => (
          <div key={s.id} className="small" style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <span>{s.title} · {s.university_id ? unis.find((u) => u.id === s.university_id)?.name_ar : 'الكل'}</span>
            <span>تطبيق {fmtNum(s.in_app)} · إيميل {fmtNum(s.emailed)} · {fmtDate(s.created_at)}</span>
          </div>
        ))}
        {!hist.loading && (hist.data ?? []).length === 0 && <div className="small">ما في عروض لهلأ.</div>}
      </div>
    </div>
  );
}
