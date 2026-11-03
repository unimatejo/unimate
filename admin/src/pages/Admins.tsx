import { useState } from 'react';

import { audit, fmtDate, supabase, useLoad } from '../lib';
import { State, Top } from '../ui';

type A = { user_id: string; role: string; created_at: string; p: { full_name: string } | null };

export default function Admins() {
  const { data, loading, error, reload } = useLoad<A[]>(() => supabase.from('admins').select('*, p:profiles(full_name)').order('created_at') as never, []);
  const [id, setId] = useState('');
  const [role, setRole] = useState('moderator');

  async function add() {
    const { error } = await supabase.from('admins').insert({ user_id: id.trim(), role });
    if (error) { alert(error.message.includes('foreign') ? 'ما في حساب بهالرقم. خذه من صفحة المستخدمين.' : error.message); return; }
    await audit('add_admin', 'user', id.trim(), { role }); setId(''); reload();
  }
  async function remove(a: A) {
    if (!confirm(`تشيل ${a.p?.full_name} من المشرفين؟`)) return;
    await supabase.from('admins').delete().eq('user_id', a.user_id);
    await audit('remove_admin', 'user', a.user_id); reload();
  }

  return (
    <div className="stack" style={{ maxWidth: 760 }}>
      <Top title="المشرفين" sub="المالك بس بيقدر يضيف ويشيل مشرفين" />
      <State loading={loading} error={error}>
        <div className="panel scroll"><table><tbody>{(data ?? []).map((a) => (
          <tr key={a.user_id}><td>{a.p?.full_name}</td><td><span className={`tag ${a.role === 'owner' ? 'violet' : 'blue'}`}>{a.role === 'owner' ? 'مالك' : 'مشرف'}</span></td>
            <td className="small muted">{fmtDate(a.created_at)}</td><td>{a.role !== 'owner' && <button className="btn red sm" onClick={() => remove(a)}>شيل</button>}</td></tr>
        ))}</tbody></table></div>
      </State>
      <div className="panel stack">
        <h3>أضف مشرف</h3>
        <div className="row">
          <input className="input ltr" style={{ flex: 1, minWidth: 260 }} value={id} onChange={(e) => setId(e.target.value)} placeholder="رقم الحساب من صفحة المستخدمين" />
          <select className="input" style={{ width: 140 }} value={role} onChange={(e) => setRole(e.target.value)}><option value="moderator">مشرف</option><option value="owner">مالك</option></select>
          <button className="btn" onClick={add} disabled={id.trim().length < 30}>أضف</button>
        </div>
      </div>
    </div>
  );
}
