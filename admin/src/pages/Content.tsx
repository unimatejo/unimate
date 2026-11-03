import { useState } from 'react';

import { audit, fmtDate, supabase, useLoad, useUnis } from '../lib';
import { State, Top } from '../ui';

type Post = {
  id: string; body: string; title: string | null; category: string; is_hidden: boolean; is_pinned: boolean; like_count: number; comment_count: number; created_at: string;
  author: { id: string; full_name: string } | null; university: { name_ar: string } | null;
};
type Comment = { id: string; body: string; is_hidden: boolean; created_at: string; post_id: string; author: { full_name: string } | null };
const CATS: Record<string, string> = { square: 'الساحة', summaries: 'ملخصات', assignments: 'واجبات', tutoring: 'تدريس', lost_found: 'مفقودات', market: 'سوق', exchange: 'تبادل', transport_housing: 'مواصلات وسكن', events: 'فعاليات', opportunities: 'فرص' };

export default function Content() {
  const unis = useUnis();
  const [tab, setTab] = useState<'posts' | 'comments' | 'stories'>('posts');
  const [uni, setUni] = useState('');
  const [cat, setCat] = useState('');
  const [hiddenOnly, setHiddenOnly] = useState(false);

  const posts = useLoad<Post[]>(() => {
    let q = supabase.from('posts').select('id, body, title, category, is_hidden, is_pinned, like_count, comment_count, created_at, author:profiles!posts_author_id_fkey(id, full_name), university:universities(name_ar)').order('created_at', { ascending: false }).limit(150);
    if (uni) q = q.eq('university_id', uni);
    if (cat) q = q.eq('category', cat);
    if (hiddenOnly) q = q.eq('is_hidden', true);
    return q as unknown as PromiseLike<{ data: Post[] | null; error: { message: string } | null }>;
  }, [uni, cat, hiddenOnly, tab]);
  const comments = useLoad<Comment[]>(() => supabase.from('comments').select('id, body, is_hidden, created_at, post_id, author:profiles!comments_author_id_fkey(full_name)').order('created_at', { ascending: false }).limit(150) as unknown as PromiseLike<{ data: Comment[] | null; error: { message: string } | null }>, [tab]);
  const stories = useLoad<{ id: string; caption: string | null; media_url: string; is_hidden: boolean; created_at: string; expires_at: string; author: { full_name: string } | null }[]>(
    () => supabase.from('stories').select('id, caption, media_url, is_hidden, created_at, expires_at, author:profiles!stories_author_id_fkey(full_name)').order('created_at', { ascending: false }).limit(100) as never, [tab]);

  async function upd(table: string, id: string, patch: Record<string, unknown>, reload: () => void) {
    await supabase.from(table).update(patch).eq('id', id);
    await audit(`update_${table}`, table, id, patch); reload();
  }
  async function del(table: string, id: string, reload: () => void) {
    if (!confirm('تحذفه نهائياً؟')) return;
    await supabase.from(table).delete().eq('id', id);
    await audit(`delete_${table}`, table, id); reload();
  }
  async function viewStory(path: string) {
    const { data } = await supabase.storage.from('stories').createSignedUrl(path, 600);
    if (data) open(data.signedUrl, '_blank');
  }

  return (
    <div className="stack">
      <Top title="المحتوى">
        {(['posts', 'comments', 'stories'] as const).map((t) => <button key={t} className={`btn ${tab === t ? '' : 'soft'}`} onClick={() => setTab(t)}>{t === 'posts' ? 'المنشورات' : t === 'comments' ? 'التعليقات' : 'الستوري'}</button>)}
      </Top>
      {tab === 'posts' && (
        <>
          <div className="panel row">
            <select className="input" style={{ width: 220 }} value={uni} onChange={(e) => setUni(e.target.value)}><option value="">كل الجامعات</option>{unis.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}</select>
            <select className="input" style={{ width: 180 }} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">كل الأقسام</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            <label className="row small"><input type="checkbox" checked={hiddenOnly} onChange={(e) => setHiddenOnly(e.target.checked)} />المخفي بس</label>
          </div>
          <State loading={posts.loading} error={posts.error} empty={posts.data?.length === 0}>
            <div className="panel scroll"><table>
              <thead><tr><th>المنشور</th><th>القسم</th><th>الكاتب</th><th>تفاعل</th><th>متى</th><th></th></tr></thead>
              <tbody>{(posts.data ?? []).map((p) => (
                <tr key={p.id} style={{ opacity: p.is_hidden ? 0.55 : 1 }}>
                  <td style={{ maxWidth: 380 }}>{p.title && <b>{p.title} · </b>}{p.body.slice(0, 160)}{p.is_pinned && <span className="tag blue" style={{ marginInlineStart: 6 }}>مثبّت</span>}</td>
                  <td><span className="tag">{CATS[p.category] ?? p.category}</span><div className="small muted">{p.university?.name_ar}</div></td>
                  <td className="small">{p.author?.full_name}</td>
                  <td className="small muted">♥ {p.like_count} · 💬 {p.comment_count}</td>
                  <td className="small muted">{fmtDate(p.created_at)}</td>
                  <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                    <button className="btn soft sm" onClick={() => upd('posts', p.id, { is_pinned: !p.is_pinned }, posts.reload)}>{p.is_pinned ? 'فك التثبيت' : 'ثبّت'}</button>
                    <button className="btn soft sm" onClick={() => upd('posts', p.id, { is_hidden: !p.is_hidden }, posts.reload)}>{p.is_hidden ? 'رجّع' : 'خبّي'}</button>
                    <button className="btn red sm" onClick={() => del('posts', p.id, posts.reload)}>احذف</button>
                  </div></td>
                </tr>
              ))}</tbody>
            </table></div>
          </State>
        </>
      )}
      {tab === 'comments' && (
        <State loading={comments.loading} error={comments.error} empty={comments.data?.length === 0}>
          <div className="panel scroll"><table><tbody>{(comments.data ?? []).map((c) => (
            <tr key={c.id} style={{ opacity: c.is_hidden ? 0.55 : 1 }}>
              <td>{c.body}</td><td className="small">{c.author?.full_name}</td><td className="small muted">{fmtDate(c.created_at)}</td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn soft sm" onClick={() => upd('comments', c.id, { is_hidden: !c.is_hidden }, comments.reload)}>{c.is_hidden ? 'رجّع' : 'خبّي'}</button>
                <button className="btn red sm" onClick={() => del('comments', c.id, comments.reload)}>احذف</button>
              </div></td>
            </tr>
          ))}</tbody></table></div>
        </State>
      )}
      {tab === 'stories' && (
        <State loading={stories.loading} error={stories.error} empty={stories.data?.length === 0}>
          <div className="panel scroll"><table><tbody>{(stories.data ?? []).map((s) => (
            <tr key={s.id} style={{ opacity: s.is_hidden ? 0.55 : 1 }}>
              <td>{s.caption ?? '—'}</td><td className="small">{s.author?.full_name}</td>
              <td className="small muted">{fmtDate(s.created_at)}{new Date(s.expires_at) < new Date() && ' · انتهت'}</td>
              <td><div className="row" style={{ flexWrap: 'nowrap' }}>
                <button className="btn soft sm" onClick={() => viewStory(s.media_url)}>شوف</button>
                <button className="btn soft sm" onClick={() => upd('stories', s.id, { is_hidden: !s.is_hidden }, stories.reload)}>{s.is_hidden ? 'رجّع' : 'خبّي'}</button>
                <button className="btn red sm" onClick={() => del('stories', s.id, stories.reload)}>احذف</button>
              </div></td>
            </tr>
          ))}</tbody></table></div>
        </State>
      )}
    </div>
  );
}
