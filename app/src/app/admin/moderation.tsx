import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Filters, Muted, Panel, Pill, State, confirm, done, fmtDate, go, useLoad } from '@/components/admin/kit';
import { T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C, R } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Q = {
  id: string; target_type: string; target_id: string; author_id: string | null; reason: 'words' | 'image'; matched: string | null;
  excerpt: string | null; media_url: string | null; status: 'pending' | 'approved' | 'removed'; created_at: string;
  author?: { full_name: string | null; username: string | null } | null;
};
type F = 'pending' | 'approved' | 'removed';

const TYPE: Record<string, string> = {
  post: t('منشور'), comment: t('تعليق'), story: t('ستوري'), message: t('رسالة بجروب'), bio: t('نبذة'), avatar: t('صورة بروفايل'), post_media: t('صورة منشور'),
};
const BUCKET: Record<string, string> = { post_media: 'posts', story: 'stories', avatar: 'avatars' };

/** Photo of a queued item: private buckets need a short-lived link. */
function Preview({ q }: { q: Q }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    if (!q.media_url) return;
    if (/^https?:/.test(q.media_url)) { setUri(q.media_url); return; }
    const b = BUCKET[q.target_type]; if (!b) return;
    supabase.storage.from(b).createSignedUrl(q.media_url, 600).then(({ data }) => setUri(data?.signedUrl ?? null), () => {});
  }, [q.media_url, q.target_type]);
  if (!uri) return null;
  return <Image source={{ uri }} style={{ width: '100%', aspectRatio: 1, borderRadius: R.md, backgroundColor: C.soft }} contentFit="cover" blurRadius={q.status === 'pending' ? 18 : 0} />;
}

/**
 * Content the automatic checks held back (bad words, or a photo flagged by the image check).
 * Approve = it goes live as if nothing happened. Remove = it stays hidden (and you can warn the author).
 */
export default function Moderation() {
  const [f, setF] = useState<F>('pending');
  const [busy, setBusy] = useState<string | null>(null);
  const { data, error, loading, reload } = useLoad<Q[]>(
    () => supabase.from('moderation_queue').select('*, author:profiles!moderation_queue_author_id_fkey(full_name, username)').eq('status', f).order('created_at', { ascending: false }).limit(100) as never,
    [f],
  );

  async function review(q: Q, approve: boolean, warn = false) {
    if (!approve && !(await confirm(t('تخلّيه مخفي؟'), warn ? t('بيضل مخفي، وبيوصل صاحبه تنبيه.') : t('بيضل مخفي عن الكل.'), t('أكيد')))) return;
    setBusy(q.id);
    const { error: e } = await supabase.rpc('admin_moderation_review', { p_id: q.id, p_approve: approve, p_warn: warn });
    setBusy(null);
    if (!e) { done(); reload(); }
  }

  return (
    <AdminScreen title={t('فحص المحتوى')} subtitle={t('اللي وقّفه الفلتر التلقائي، بانتظار قرارك')}>
      <Filters items={[['pending', t('بانتظار')], ['approved', t('انقبل')], ['removed', t('انشال')]]} value={f} onChange={setF} />
      <State loading={loading} error={error} empty={!data?.length}>
        {(data ?? []).map((q) => (
          <Panel key={q.id}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <Pill label={TYPE[q.target_type] ?? q.target_type} />
              <Pill label={q.reason === 'image' ? t('صورة') : t('كلمات')} tone="red" />
              <Muted>{fmtDate(q.created_at)}</Muted>
            </View>
            {q.author && (
              <T v="bodyMd" onPress={() => q.author_id && go(`/admin/user/${q.author_id}`)}>
                {q.author.full_name ?? t('؟')}{q.author.username ? ` ⁦@${q.author.username}⁩` : ''}
              </T>
            )}
            {q.excerpt ? <T v="body" selectable>{q.excerpt}</T> : null}
            <Preview q={q} />
            {q.matched ? <T v="tiny" color={C.red}>{q.reason === 'image' ? q.matched : t('الكلمات: {0}', [q.matched])}</T> : null}
            {q.status === 'pending' && (
              <Actions>
                <Act label={t('مقبول، رجّعه')} kind="green" loading={busy === q.id} onPress={() => review(q, true)} />
                <Act label={t('خليه مخفي')} kind="danger" onPress={() => review(q, false)} />
                <Act label={t('مخفي + نبّه صاحبه')} onPress={() => review(q, false, true)} />
              </Actions>
            )}
          </Panel>
        ))}
      </State>
    </AdminScreen>
  );
}
