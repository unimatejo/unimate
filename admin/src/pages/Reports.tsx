import { useState } from 'react';

import { ChatViewer } from '../chat';
import { audit, fmtDate, supabase, useLoad } from '../lib';
import { Drawer, State, Status, Top } from '../ui';
import { UserDetail } from './Users';

type Report = {
  id: string; reporter_id: string; target_type: string; target_id: string; target_user: string | null; reason: string; details: string | null;
  also_blocked: boolean; status: string; action_taken: string | null; created_at: string; resolved_at: string | null;
  reporter: { full_name: string } | null; accused: { full_name: string } | null;
};
const TYPE: Record<string, string> = { user: 'حساب', post: 'منشور', comment: 'تعليق', story: 'ستوري', message: 'رسالة', conversation: 'محادثة' };

function Target({ r }: { r: Report }) {
  const table = r.target_type === 'post' ? 'posts' : r.target_type === 'comment' ? 'comments' : r.target_type === 'story' ? 'stories' : null;
  const { data } = useLoad<{ id: string; body?: string; caption?: string; is_hidden: boolean } | null>(
    () => table ? supabase.from(table).select('*').eq('id', r.target_id).maybeSingle() : Promise.resolve({ data: null, error: null }), [r.id]);
  const [conv, setConv] = useState<{ id: string; members: { id: string; name: string }[] } | null>(null);

  async function hide(v: boolean) {
    if (!table) return;
    await supabase.from(table).update({ is_hidden: v }).eq('id', r.target_id);
    await audit(v ? 'hide' : 'unhide', r.target_type, r.target_id, { report: r.id });
    location.reload();
  }
  async function loadConv() {
    let cid: string | null = r.target_id;
    if (r.target_type === 'message') {
      const { data: c } = await supabase.rpc('admin_message_conversation', { msg: r.target_id });
      cid = (c as string | null) ?? null;
    }
    if (!cid) { alert('الرسالة انحذفت نهائياً.'); return; }
    const { data: mem } = await supabase.from('conversation_members').select('user_id, p:profiles(full_name)').eq('conversation_id', cid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConv({ id: cid, members: ((mem ?? []) as any[]).map((x) => ({ id: x.user_id, name: x.p?.full_name ?? '؟' })) });
  }

  if (r.target_type === 'user' && r.target_user) return <UserDetail id={r.target_user} />;
  if (r.target_type === 'conversation' || r.target_type === 'message') return conv
    ? <ChatViewer conversationId={conv.id} members={conv.members} presetReason={`بلاغ: ${r.reason}`} />
    : <button className="btn" onClick={loadConv}>جيب المحادثة</button>;
  if (!table) return <div className="muted small">رقم الهدف: <span className="ltr">{r.target_id}</span></div>;
  if (!data) return <div className="muted">المحتوى انحذف أو مش موجود.</div>;
  return (
    <div className="panel stack">
      <div>{data.body ?? data.caption ?? '—'}</div>
      <div className="row">{data.is_hidden ? <button className="btn soft sm" onClick={() => hide(false)}>رجّعه</button> : <button className="btn red sm" onClick={() => hide(true)}>خبّيه عن الكل</button>}</div>
    </div>
  );
}

export default function Reports() {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [sel, setSel] = useState<Report | null>(null);
  const [note, setNote] = useState('');
  const { data, loading, error, reload } = useLoad<Report[]>(() => {
    let q = supabase.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(full_name), accused:profiles!reports_target_user_fkey(full_name)').order('created_at', { ascending: false }).limit(200);
    if (filter === 'open') q = q.in('status', ['open', 'reviewing']);
    return q as unknown as PromiseLike<{ data: Report[] | null; error: { message: string } | null }>;
  }, [filter]);

  async function setStatus(r: Report, status: string) {
    const { data: me } = await supabase.auth.getUser();
    await supabase.from('reports').update({ status, action_taken: note || null, resolved_by: me.user?.id, resolved_at: ['resolved', 'dismissed'].includes(status) ? new Date().toISOString() : null }).eq('id', r.id);
    await audit(`report_${status}`, 'report', r.id, { note });
    setNote(''); setSel(null); reload();
  }

  return (
    <div className="stack">
      <Top title="البلاغات" sub="البلاغ سري، والمبلّغ عليه ما بيعرف مين بلّغ">
        <select className="input" style={{ width: 160 }} value={filter} onChange={(e) => setFilter(e.target.value as 'open' | 'all')}>
          <option value="open">المفتوحة</option><option value="all">الكل</option>
        </select>
      </Top>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="panel scroll"><table>
          <thead><tr><th>السبب</th><th>النوع</th><th>على</th><th>من</th><th>الحالة</th><th>متى</th></tr></thead>
          <tbody>{(data ?? []).map((r) => (
            <tr key={r.id} className="click" onClick={() => setSel(r)}>
              <td>{r.reason}{r.details && <div className="small muted">{r.details.slice(0, 80)}</div>}</td>
              <td><span className="tag">{TYPE[r.target_type]}</span></td>
              <td>{r.accused?.full_name ?? '—'}</td>
              <td className="small">{r.reporter?.full_name}</td>
              <td><Status s={r.status} /></td>
              <td className="small muted">{fmtDate(r.created_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </State>
      <Drawer open={!!sel} onClose={() => setSel(null)}>
        {sel && (
          <div className="stack">
            <div className="row"><h2 className="grow">{sel.reason}</h2><Status s={sel.status} /></div>
            <div className="small muted">{TYPE[sel.target_type]} · من {sel.reporter?.full_name} على {sel.accused?.full_name ?? '—'} · {fmtDate(sel.created_at)}{sel.also_blocked ? ' · المبلّغ حظره' : ''}</div>
            {sel.details && <div className="panel">{sel.details}</div>}
            {sel.action_taken && <div className="notice">الإجراء: {sel.action_taken}</div>}
            <Target r={sel} />
            <label className="f">ملاحظة الإجراء<input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: انحذف المنشور وتوقف الحساب أسبوع" /></label>
            <div className="row">
              {sel.status === 'open' && <button className="btn soft" onClick={() => setStatus(sel, 'reviewing')}>قيد المراجعة</button>}
              <button className="btn green" onClick={() => setStatus(sel, 'resolved')}>انحل</button>
              <button className="btn soft" onClick={() => setStatus(sel, 'dismissed')}>ارفض البلاغ</button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
