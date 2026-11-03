import { useState } from 'react';

import { supabase, useUnis } from '../lib';
import { Top } from '../ui';

export default function Notify() {
  const unis = useUnis();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [uni, setUni] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    const who = uni ? unis.find((u) => u.id === uni)?.name_ar : 'كل الطلاب بكل الجامعات';
    if (!confirm(`رح يوصل الإشعار لـ ${who}. أكيد؟`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_notify', { title: title.trim(), body: body.trim() || null, target: null, uni: uni || null });
    setBusy(false);
    setMsg(error ? error.message : `انبعت لـ ${data} طالب ✓`);
    if (!error) { setTitle(''); setBody(''); }
  }

  return (
    <div className="stack" style={{ maxWidth: 620 }}>
      <Top title="إرسال إشعار" sub="بيطلع بصفحة الإشعارات جوا التطبيق" />
      <div className="panel stack">
        <label className="f">لمين<select className="input" value={uni} onChange={(e) => setUni(e.target.value)}><option value="">كل الجامعات</option>{unis.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}</select></label>
        <label className="f">العنوان<input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} /></label>
        <label className="f">النص<textarea className="input" value={body} onChange={(e) => setBody(e.target.value)} maxLength={300} /></label>
        <button className="btn" onClick={send} disabled={busy || title.trim().length < 3}>ابعت</button>
        {msg && <div className="small">{msg}</div>}
      </div>
    </div>
  );
}
