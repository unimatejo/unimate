import { useEffect, useState } from 'react';

import { ChatViewer } from '../chat';
import { audit, fmtDate, fmtNum, supabase, useLoad } from '../lib';
import { Av, Drawer, State, Status, Top } from '../ui';

export type UserRow = { id: string; full_name: string; username: string | null; avatar_url: string | null; status: string; university: string | null; major: string | null; email: string | null; student_number: string | null; created_at: string; post_count: number; follower_count: number; is_admin: boolean };
type Conv = { id: string; kind: string; title: string | null; context_label: string | null; last_message_at: string; members: { id: string; name: string; state: string }[]; message_count: number };

export function UserDetail({ id, onChanged }: { id: string; onChanged?: () => void }) {
  const { data: rows, reload } = useLoad<UserRow[]>(() => supabase.rpc('admin_find_users', { q: id, lim: 1 }), [id]);
  const u = rows?.[0];
  const { data: convs } = useLoad<Conv[]>(() => supabase.rpc('admin_user_conversations', { target: id }), [id]);
  const { data: posts } = useLoad<{ id: string; body: string; category: string; created_at: string; is_hidden: boolean }[]>(
    () => supabase.from('posts').select('id, body, category, created_at, is_hidden').eq('author_id', id).order('created_at', { ascending: false }).limit(20), [id]);
  const [open, setOpen] = useState<Conv | null>(null);
  const [edit, setEdit] = useState<{ full_name: string; bio: string } | null>(null);

  useEffect(() => { setOpen(null); setEdit(null); }, [id]);

  async function setStatus(s: string) {
    const reason = prompt(s === 'active' ? 'سبب إعادة التفعيل؟' : 'سبب الإيقاف؟ (بينحفظ بالسجل)');
    if (reason === null) return;
    await supabase.rpc('admin_set_status', { target: id, new_status: s, reason });
    reload(); onChanged?.();
  }
  async function saveEdit() {
    if (!edit) return;
    await supabase.from('profiles').update({ full_name: edit.full_name, bio: edit.bio }).eq('id', id);
    await audit('edit_profile', 'user', id, edit);
    setEdit(null); reload(); onChanged?.();
  }
  async function removeAvatar() {
    if (!confirm('تشيل صورة البروفايل؟')) return;
    await supabase.from('profiles').update({ avatar_url: null }).eq('id', id);
    await audit('remove_avatar', 'user', id); reload();
  }

  if (!u) return <div className="muted">بيحمّل…</div>;
  return (
    <div className="stack">
      <div className="row">
        <Av name={u.full_name} url={u.avatar_url} />
        <div className="grow"><h2>{u.full_name}</h2><div className="muted small">{u.username ? `@${u.username} · ` : ''}{u.university ?? 'بدون جامعة'}{u.major ? ` · ${u.major}` : ''}</div></div>
        <Status s={u.status} />{u.is_admin && <span className="tag violet">مشرف</span>}
      </div>
      <div className="panel small">
        <div>الإيميل: <span className="ltr">{u.email ?? '—'}</span></div>
        <div>الرقم الجامعي: {u.student_number ?? '—'}</div>
        <div>سجّل: {fmtDate(u.created_at)} · {fmtNum(u.post_count)} منشور · {fmtNum(u.follower_count)} متابِع</div>
        <div className="muted ltr" style={{ fontSize: 11 }}>{u.id}</div>
      </div>
      <div className="row">
        {u.status !== 'active' && <button className="btn green sm" onClick={() => setStatus('active')}>فعّل الحساب</button>}
        {u.status !== 'suspended' && <button className="btn soft sm" onClick={() => setStatus('suspended')}>إيقاف مؤقت</button>}
        {u.status !== 'banned' && <button className="btn red sm" onClick={() => setStatus('banned')}>حظر نهائي</button>}
        <button className="btn soft sm" onClick={async () => {
          const { data: p } = await supabase.from('profiles').select('bio').eq('id', id).single();
          setEdit({ full_name: u.full_name, bio: p?.bio ?? '' });
        }}>تعديل</button>
        {u.avatar_url && <button className="btn soft sm" onClick={removeAvatar}>شيل الصورة</button>}
      </div>
      {edit && (
        <div className="panel stack">
          <label className="f">الاسم<input className="input" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} /></label>
          <label className="f">النبذة<input className="input" value={edit.bio} onChange={(e) => setEdit({ ...edit, bio: e.target.value })} /></label>
          <div className="row"><button className="btn sm" onClick={saveEdit}>احفظ</button><button className="btn soft sm" onClick={() => setEdit(null)}>إلغاء</button></div>
        </div>
      )}

      <h3>المحادثات ({convs?.length ?? 0})</h3>
      {open ? (
        <div className="panel stack">
          <div className="row"><b className="grow">{open.title ?? open.members.map((m) => m.name).join('، ')}</b><button className="btn soft sm" onClick={() => setOpen(null)}>رجوع</button></div>
          <ChatViewer conversationId={open.id} members={open.members} />
        </div>
      ) : (
        <div className="panel scroll"><table><tbody>
          {(convs ?? []).map((c) => (
            <tr key={c.id} className="click" onClick={() => setOpen(c)}>
              <td>{c.title ?? c.members.filter((m) => m.id !== id).map((m) => m.name).join('، ')}{c.context_label && <div className="small muted">{c.context_label}</div>}</td>
              <td><span className="tag">{c.kind === 'direct' ? 'خاص' : c.kind === 'group' ? 'مجموعة' : 'مجتمع'}</span></td>
              <td className="small muted">{fmtNum(c.message_count)} رسالة</td>
              <td className="small muted">{fmtDate(c.last_message_at)}</td>
            </tr>
          ))}
          {convs?.length === 0 && <tr><td className="muted">ما في محادثات.</td></tr>}
        </tbody></table></div>
      )}

      <h3>آخر المنشورات</h3>
      <div className="panel scroll"><table><tbody>
        {(posts ?? []).map((p) => <tr key={p.id}><td>{p.body.slice(0, 120)}</td><td><span className="tag">{p.category}</span>{p.is_hidden && <span className="tag red">مخفي</span>}</td><td className="small muted">{fmtDate(p.created_at)}</td></tr>)}
        {posts?.length === 0 && <tr><td className="muted">ما في منشورات.</td></tr>}
      </tbody></table></div>
    </div>
  );
}

export default function UsersPage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const { data, loading, error, reload } = useLoad<UserRow[]>(() => supabase.rpc('admin_find_users', { q: term, lim: 100 }), [term]);

  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(t); }, [q]);

  return (
    <div className="stack">
      <Top title="المستخدمين" sub="دوّر بالاسم أو اليوزر أو الإيميل أو الرقم الجامعي">
        <input className="input" style={{ width: 300 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث…" />
      </Top>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="panel scroll"><table>
          <thead><tr><th></th><th>الاسم</th><th>الجامعة</th><th>الإيميل</th><th>الحالة</th><th>سجّل</th></tr></thead>
          <tbody>{(data ?? []).map((u) => (
            <tr key={u.id} className="click" onClick={() => setSel(u.id)}>
              <td><Av name={u.full_name} url={u.avatar_url} /></td>
              <td>{u.full_name}{u.is_admin && <span className="tag violet" style={{ marginInlineStart: 6 }}>مشرف</span>}<div className="small muted">{u.major ?? ''}</div></td>
              <td className="small">{u.university ?? '—'}</td>
              <td className="small ltr">{u.email}</td>
              <td><Status s={u.status} /></td>
              <td className="small muted">{fmtDate(u.created_at)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </State>
      <Drawer open={!!sel} onClose={() => setSel(null)}>{sel && <UserDetail id={sel} onChanged={reload} />}</Drawer>
    </div>
  );
}
