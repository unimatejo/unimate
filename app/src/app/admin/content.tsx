import { useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Filters, Muted, OptionPicker, Panel, Pill, State, UniPicker, audit, confirm, done, fmtDate, useLoad } from '@/components/admin/kit';
import { ImageViewer } from '@/components/media/ImageViewer';
import { T, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

type Post = {
  id: string; body: string; title: string | null; category: string; is_hidden: boolean; is_pinned: boolean; like_count: number; comment_count: number; created_at: string;
  author: { id: string; full_name: string } | null; university: { name_ar: string } | null;
};
type Comment = { id: string; body: string; is_hidden: boolean; created_at: string; post_id: string; author: { full_name: string } | null };
type Story = { id: string; caption: string | null; media_url: string; is_hidden: boolean; created_at: string; expires_at: string; author: { full_name: string } | null };
const CATS: Record<string, string> = { '': t('كل الأقسام'), square: t('الساحة'), summaries: t('ملخصات'), assignments: t('واجبات'), tutoring: t('تدريس'), lost_found: t('مفقودات'), market: t('سوق'), exchange: t('تبادل'), transport_housing: t('مواصلات وسكن'), events: t('فعاليات'), opportunities: t('فرص') };

/** Admin › posts and stories: hide, pin or delete content. */
export default function Content() {
  const [tab, setTab] = useState<'posts' | 'comments' | 'stories'>('posts');
  const [uni, setUni] = useState('');
  const [cat, setCat] = useState('');
  const [hiddenOnly, setHiddenOnly] = useState(false);
  const [view, setView] = useState<string | null>(null);

  const posts = useLoad<Post[]>(() => {
    let q = supabase.from('posts').select('id, body, title, category, is_hidden, is_pinned, like_count, comment_count, created_at, author:profiles!posts_author_id_fkey(id, full_name), university:universities(name_ar)').order('created_at', { ascending: false }).limit(150);
    if (uni) q = q.eq('university_id', uni);
    if (cat) q = q.eq('category', cat);
    if (hiddenOnly) q = q.eq('is_hidden', true);
    return q as unknown as PromiseLike<{ data: Post[] | null; error: { message: string } | null }>;
  }, [uni, cat, hiddenOnly, tab]);
  const comments = useLoad<Comment[]>(() => supabase.from('comments').select('id, body, is_hidden, created_at, post_id, author:profiles!comments_author_id_fkey(full_name)').order('created_at', { ascending: false }).limit(150) as unknown as PromiseLike<{ data: Comment[] | null; error: { message: string } | null }>, [tab]);
  const stories = useLoad<Story[]>(() => supabase.from('stories').select('id, caption, media_url, is_hidden, created_at, expires_at, author:profiles!stories_author_id_fkey(full_name)').order('created_at', { ascending: false }).limit(100) as never, [tab]);

  async function upd(table: string, id: string, patch: Record<string, unknown>, reload: () => void) {
    if (patch.is_hidden === true && !(await confirm(t('تخبّيه عن الكل؟'), t('ما بيبيّن لحدا لحد ما ترجّعه.'), t('خبّيه')))) return;
    await supabase.from(table).update(patch).eq('id', id);
    await audit(`update_${table}`, table, id, patch); done(); reload();
  }
  async function del(table: string, id: string, reload: () => void) {
    if (!(await confirm(t('تحذفه نهائياً؟'), t('الحذف ما بيرجع.'), t('احذف')))) return;
    await supabase.from(table).delete().eq('id', id);
    await audit(`delete_${table}`, table, id); done(); reload();
  }
  async function viewStory(path: string) {
    const { data } = await supabase.storage.from('stories').createSignedUrl(path, 600);
    if (data) setView(data.signedUrl);
  }

  return (
    <AdminScreen title={t('المحتوى')}>
      <Filters items={[['posts', t('المنشورات')], ['comments', t('التعليقات')], ['stories', t('الستوري')]]} value={tab} onChange={setTab} />
      {tab === 'posts' && (
        <>
          <UniPicker value={uni} onChange={setUni} />
          <OptionPicker label={t('القسم')} value={cat} options={CATS} onChange={setCat} />
          <Toggle value={hiddenOnly} onChange={setHiddenOnly} label={t('المخفي بس')} />
          <State loading={posts.loading} error={posts.error} empty={posts.data?.length === 0}>
            <View style={{ gap: 8 }}>
              {(posts.data ?? []).map((p) => (
                <Panel key={p.id} style={{ opacity: p.is_hidden ? 0.6 : 1 }}>
                  <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                    <Pill label={CATS[p.category] ?? p.category} />{p.is_pinned && <Pill label={t('مثبّت')} tone="blue" />}{p.is_hidden && <Pill label={t('مخفي')} tone="red" />}
                  </View>
                  <T v="body" numberOfLines={5}>{p.title ? `${p.title} · ` : ''}{p.body}</T>
                  <Muted>{[p.author?.full_name, p.university?.name_ar, `♥ ${p.like_count} · 💬 ${p.comment_count}`, fmtDate(p.created_at)].filter(Boolean).join(' · ')}</Muted>
                  <Actions>
                    <Act label={p.is_pinned ? t('فك التثبيت') : t('ثبّت')} onPress={() => upd('posts', p.id, { is_pinned: !p.is_pinned }, posts.reload)} />
                    <Act label={p.is_hidden ? t('رجّع') : t('خبّي')} onPress={() => upd('posts', p.id, { is_hidden: !p.is_hidden }, posts.reload)} />
                    <Act label={t('احذف')} kind="danger" onPress={() => del('posts', p.id, posts.reload)} />
                  </Actions>
                </Panel>
              ))}
            </View>
          </State>
        </>
      )}
      {tab === 'comments' && (
        <State loading={comments.loading} error={comments.error} empty={comments.data?.length === 0}>
          <View style={{ gap: 8 }}>
            {(comments.data ?? []).map((c) => (
              <Panel key={c.id} style={{ opacity: c.is_hidden ? 0.6 : 1 }}>
                <T v="body">{c.body}</T>
                <Muted>{[c.author?.full_name, fmtDate(c.created_at)].filter(Boolean).join(' · ')}</Muted>
                <Actions>
                  <Act label={c.is_hidden ? t('رجّع') : t('خبّي')} onPress={() => upd('comments', c.id, { is_hidden: !c.is_hidden }, comments.reload)} />
                  <Act label={t('احذف')} kind="danger" onPress={() => del('comments', c.id, comments.reload)} />
                </Actions>
              </Panel>
            ))}
          </View>
        </State>
      )}
      {tab === 'stories' && (
        <State loading={stories.loading} error={stories.error} empty={stories.data?.length === 0}>
          <View style={{ gap: 8 }}>
            {(stories.data ?? []).map((s) => (
              <Panel key={s.id} style={{ opacity: s.is_hidden ? 0.6 : 1 }}>
                <T v="body">{s.caption ?? '—'}</T>
                <Muted>{[s.author?.full_name, fmtDate(s.created_at), new Date(s.expires_at) < new Date() ? t('انتهت') : null].filter(Boolean).join(' · ')}</Muted>
                <Actions>
                  <Act label={t('شوف')} onPress={() => viewStory(s.media_url)} />
                  <Act label={s.is_hidden ? t('رجّع') : t('خبّي')} onPress={() => upd('stories', s.id, { is_hidden: !s.is_hidden }, stories.reload)} />
                  <Act label={t('احذف')} kind="danger" onPress={() => del('stories', s.id, stories.reload)} />
                </Actions>
              </Panel>
            ))}
          </View>
        </State>
      )}
      <ImageViewer uri={view} onClose={() => setView(null)} />
    </AdminScreen>
  );
}
