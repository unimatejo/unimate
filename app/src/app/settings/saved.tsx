import { Bookmark } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';

import { LikesSheet } from '@/components/LikesSheet';
import { PostCard } from '@/components/PostCard';
import { Empty, Header, Screen } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, withMine } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { t } from '@/lib/i18n';
import { ListSkeleton } from '@/components/Skeleton';

export default function Saved() {
  const { profile } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likesOf, setLikesOf] = useState<Post | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: s } = await supabase.from('post_saves').select('post_id, created_at').eq('user_id', (profile?.id ?? '')).order('created_at', { ascending: false }).limit(100);
    const ids = (s ?? []).map((x) => x.post_id);
    if (ids.length) {
      const { data } = await supabase.from('posts').select(POST_SELECT).in('id', ids);
      const byId = new Map(((data ?? []) as unknown as Post[]).map((p) => [p.id, p]));
      setPosts(await withMine(ids.map((i) => byId.get(i)).filter(Boolean) as Post[], (profile?.id ?? '')));
    } else setPosts([]);
    setLoading(false);
  }, [profile]);
  useEffect(() => { load(); }, [load]);

  return (
    <Screen>
      <Header title={t('المحفوظات')} subtitle={t('إنت بس بتشوفها')} />
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 60 }}
        renderItem={({ item }) => <PostCard post={item} onLikes={setLikesOf} compact />}
        ListEmptyComponent={loading ? <ListSkeleton n={3} kind="post" /> : <Empty icon={<Bookmark size={28} color={C.primary} />} title={t('ما حفظت إشي')} body={t('اضغط علامة الحفظ على أي ملخص أو منشور وبيطلع هون.')} />}
      />
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
