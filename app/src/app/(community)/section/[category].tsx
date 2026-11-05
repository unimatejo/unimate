import { router, useLocalSearchParams } from 'expo-router';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { Plus } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';

import { AdBanner } from '@/components/feed/AdBanner';
import { LikesSheet } from '@/components/feed/LikesSheet';
import { PostCard } from '@/components/feed/PostCard';
import { Empty, Header, Screen, Segmented, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadFeed } from '@/lib/posts';
import { CATEGORY, C } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { t } from '@/lib/i18n';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { OnScreenProvider, useVisiblePosts } from '@/lib/videoFocus';

export default function SectionScreen() {
  const { visible, onViewableItemsChanged, viewabilityConfig } = useVisiblePosts(); // reels play only while on screen
  const { category } = useLocalSearchParams<{ category: string }>();
  const { profile } = useAuth();
  const meta = CATEGORY[category] ?? CATEGORY.square;
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [lf, setLf] = useState(0);
  const [likesOf, setLikesOf] = useState<Post | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setPosts(await loadFeed((profile?.id ?? ''), { tab: 'university', category }));
    setLoading(false);
  }, [profile, category]);
  useEffect(() => { load(); }, [load]);

  const shown = category === 'lost_found' && lf > 0 ? posts.filter((p) => p.lost_found === (lf === 1 ? 'lost' : 'found')) : posts;

  return (
    <Screen>
      <Header title={meta.label} />
      <OnScreenProvider value={visible}>
      <FlatList
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        data={shown}
        keyExtractor={(p) => p.id}
        refreshControl={<PullRefresh onRefresh={load} />}
        contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 14, paddingBottom: 110 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            {category === 'lost_found' && <Segmented items={[t('الكل'), t('ضاع مني'), t('لقيت')]} value={lf} onChange={setLf} />}
            {category === 'market' && <AdBanner placement="market_banner" />}
          </View>
        }
        renderItem={({ item }) => <PostCard post={item} onLikes={setLikesOf} compact />}
        ListEmptyComponent={loading ? <ListSkeleton n={3} kind="post" /> : <Empty title={t('ما في إشي هون لهلأ')} body={t('كون أول واحد بينشر بهالقسم.')} />}
      />
      </OnScreenProvider>
      <Tap onPress={() => router.push({ pathname: '/post/new', params: { category } })} accessibilityLabel={t('أضف')}
        style={{ position: 'absolute', left: 18, bottom: 30, width: 60, height: 60, borderRadius: 22, backgroundColor: meta.color, alignItems: 'center', justifyContent: 'center', shadowColor: meta.color, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
        <Plus size={28} color={C.onPrimary} strokeWidth={2.4} />
      </Tap>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
