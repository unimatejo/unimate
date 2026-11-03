import { useState } from 'react';

import { audit, fmtDate, supabase, useLoad } from '../lib';
import { Drawer, State, Status, Top } from '../ui';

type Ticket = { id: string; user_id: string; subject: string; body: string; status: string; reply: string | null; created_at: string; user: { full_name: string } | null };

export default function Support() {
  const [filter, setFilter] = useState('open');
  const [sel, setSel] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const { data, loading, error, reload } = useLoad<Ticket[]>(() => {
    let q = supabase.from('support_tickets').select('*, user:profiles(full_name)').order('created_at', { ascending: false }).limit(200);
    if (filter) q = q.eq('status', filter);
    return q as unknown as PromiseLike<{ data: Ticket[] | null; error: { message: string } | null }>;
  }, [filter]);

  async function answer(close: boolean) {
    if (!sel) return;
    await supabase.from('support_tickets').update({ reply: reply.trim() || sel.reply, status: close ? 'closed' : 'answered' }).eq('id', sel.id);
    if (reply.trim()) await supabase.rpc('admin_notify', { title: 'رد فريق يونيميت', body: reply.trim().slice(0, 120), target: sel.user_id, uni: null });
    await audit('ticket_reply', 'ticket', sel.id, { close });
    setReply(''); setSel(null); reload();
  }

  return (
    <div className="stack">
      <Top title="الدعم">
        <select className="input" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="open">المفتوحة</option><option value="answered">انرد عليها</option><option value="closed">المسكّرة</option><option value="">الكل</option>
        </select>
      </Top>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="panel scroll"><table>
          <thead><tr><th>الموضوع</th><th>من</th><th>الحالة</th><th>متى</th></tr></thead>
          <tbody>{(data ?? []).map((t) => (
            <tr key={t.id} className="click" onClick={() => { setSel(t); setReply(t.reply ?? ''); }}>
              <td><b>{t.subject}</b><div className="small muted">{t.body.slice(0, 100)}</div></td>
              <td className="small">{t.user?.full_name}</td><td><Status s={t.status} /></td><td className="small muted">{fmtDate(t.created_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </State>
      <Drawer open={!!sel} onClose={() => setSel(null)}>
        {sel && (
          <div className="stack">
            <div className="row"><h2 className="grow">{sel.subject}</h2><Status s={sel.status} /></div>
            <div className="small muted">{sel.user?.full_name} · {fmtDate(sel.created_at)}</div>
            <div className="panel" style={{ whiteSpace: 'pre-wrap' }}>{sel.body}</div>
            <label className="f">الرد (بيوصله إشعار)<textarea className="input" value={reply} onChange={(e) => setReply(e.target.value)} /></label>
            <div className="row">
              <button className="btn" onClick={() => answer(false)} disabled={!reply.trim()}>ابعت الرد</button>
              <button className="btn soft" onClick={() => answer(true)}>سكّر الطلب</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
