import { router } from 'expo-router';
import { Plus, Search, Send } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AdBanner } from '@/components/AdBanner';
import { LikesSheet } from '@/components/LikesSheet';
import { PostCard } from '@/components/PostCard';
import { StoriesRow } from '@/components/StoriesRow';
import { Chip, Empty, IconButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadFeed, type FeedFilter } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { CATEGORY, C } from '@/lib/theme';
import type { Post } from '@/lib/types';

const TABS: FeedFilter['tab'][] = ['university', 'college', 'following'];

export default function Community() {
  const { profile, university } = useAuth();
  const [tab, setTab] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likesOf, setLikesOf] = useState<Post | null>(null);
  const [requests, setRequests] = useState(0);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setPosts(await loadFeed(profile.id, { tab: TABS[tab], category: cat }));
    setLoading(false);
  }, [profile, tab, cat]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!profile) return;
    supabase.from('conversation_members').select('conversation_id', { count: 'exact', head: true }).eq('user_id', profile.id).eq('state', 'request')
      .then(({ count }) => setRequests(count ?? 0));
  }, [profile]);

  async function more() {
    if (!profile || posts.length < 20) return;
    const older = await loadFeed(profile.id, { tab: TABS[tab], category: cat }, posts[posts.length - 1].created_at);
    setPosts((p) => [...p, ...older.filter((o) => !p.some((x) => x.id === o.id))]);
  }

  return (
    <Screen>
      <FlatList
        data={posts}
        keyExtractor={(p) => p.id}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ gap: 14, paddingBottom: 110 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingTop: 6 }}>
            <Row gap={8} style={{ paddingHorizontal: 18 }}>
              <View style={{ flex: 1 }}>
                <T v="h1">المجتمع</T>
                <T v="small" color={C.muted}>{university?.name_ar}</T>
              </View>
              <IconButton label="بحث" onPress={() => router.push('/search')}><Search size={21} color={C.ink} /></IconButton>
              <IconButton label="الرسائل" dark badge={requests} onPress={() => router.push('/messages')}><Send size={20} color={C.white} /></IconButton>
            </Row>
            <StoriesRow />
            <View style={{ paddingHorizontal: 18 }}>
              <Segmented items={['جامعتي', 'كليتي', 'أتابعهم']} value={tab} onChange={setTab} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18 }}>
              <Chip label="الكل" active={!cat} onPress={() => setCat(null)} />
              {Object.entries(CATEGORY).map(([k, v]) => (
                <Chip key={k} label={v.label} dot={v.color} active={cat === k} onPress={() => setCat(cat === k ? null : k)} />
              ))}
              <Chip label="كل الأقسام" onPress={() => router.push('/sections')} />
            </ScrollView>
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 5) * 50)} style={{ paddingHorizontal: 18, gap: 14 }}>
            <PostCard post={item} onLikes={setLikesOf} compact />
            {index === 2 && <AdBanner placement="feed_card" />}
          </Animated.View>
        )}
        ListEmptyComponent={loading ? undefined : (
          <Empty icon={<Plus size={28} color={C.primary} />} title={tab === 2 ? 'تابع زملاءك عشان تشوف منشوراتهم' : 'كون أول واحد بينشر'}
            body="اسأل سؤال، شارك ملخص، أو بلّغ عن غرض ضايع." />
        )}
      />
      <Tap onPress={() => router.push('/post/new')} accessibilityLabel="منشور جديد"
        style={{ position: 'absolute', left: 18, bottom: 20, width: 60, height: 60, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', shadowColor: C.primary, shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
        <Plus size={28} color={C.white} strokeWidth={2.4} />
      </Tap>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
