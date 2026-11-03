import { LinearGradient } from 'expo-linear-gradient';
import { router, useFocusEffect } from 'expo-router';
import { Briefcase, BookOpen, Bus, Gift, GraduationCap, Image as ImageIcon, LayoutGrid, MessageSquare, NotebookPen, PartyPopper, Plus, Map as MapIcon, Search, SearchCheck, ShoppingBag } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AdBanner } from '@/components/AdBanner';
import { LikesSheet } from '@/components/LikesSheet';
import { PostCard } from '@/components/PostCard';
import { GlyphTile, GRAD } from '@/components/Glyph';
import { StoriesRow } from '@/components/StoriesRow';
import { Avatar, Empty, IconButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadFeed, type FeedFilter } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { CATEGORY, C } from '@/lib/theme';
import type { Post } from '@/lib/types';

const TABS: FeedFilter['tab'][] = ['university', 'college', 'following'];
const CAT_ICON = {
  square: [MessageSquare, GRAD.blue], summaries: [BookOpen, GRAD.green], assignments: [NotebookPen, GRAD.violet], tutoring: [GraduationCap, GRAD.indigo],
  lost_found: [SearchCheck, GRAD.teal], market: [ShoppingBag, GRAD.orange], exchange: [Gift, GRAD.pink], transport_housing: [Bus, GRAD.teal],
  events: [PartyPopper, GRAD.red], opportunities: [Briefcase, GRAD.slate],
} as const;

export default function Community() {
  const { profile, university } = useAuth();
  const [tab, setTab] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [likesOf, setLikesOf] = useState<Post | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    setPosts(await loadFeed((profile?.id ?? ''), { tab: TABS[tab], category: cat }));
    setLoading(false);
  }, [profile, tab, cat]);

  useEffect(() => { load(); }, [load]);
  // new posts show up as soon as you come back from posting
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function more() {
    if (!profile || posts.length < 20) return;
    const older = await loadFeed((profile?.id ?? ''), { tab: TABS[tab], category: cat }, posts[posts.length - 1].created_at);
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
        contentContainerStyle={{ gap: 14, paddingBottom: 180 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingTop: 6 }}>
            <Row gap={8} style={{ paddingHorizontal: 18 }}>
              <View style={{ flex: 1 }}>
                <T v="h1">المجتمع</T>
                <T v="small" color={C.muted}>{university?.name_ar}</T>
              </View>
              <IconButton label="بحث" onPress={() => router.push('/search')}><Search size={21} color={C.ink} /></IconButton>
              <IconButton label="الخريطة" onPress={() => router.push('/map')}><MapIcon size={21} color={C.ink} /></IconButton>
            </Row>
            <StoriesRow />
            <View style={{ paddingHorizontal: 18 }}>
              <Segmented items={['جامعتي', 'كليتي', 'أتابعهم']} value={tab} onChange={setTab} />
            </View>
            <Tap onPress={() => router.push('/post/new')} scale={0.98} style={{ marginHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 10 }}>
              <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={40} />
              <T v="body" color={C.faint} style={{ flex: 1 }}>شو ببالك؟ اسأل أو شارك ملخص...</T>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={20} color={C.green} /></View>
            </Tap>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 18 }}>
              <Tap onPress={() => setCat(null)} scale={0.9} style={{ alignItems: 'center', gap: 5, width: 62, opacity: cat ? 0.55 : 1 }}>
                <GlyphTile icon={LayoutGrid} colors={!cat ? GRAD.blue : GRAD.slate} size={50} />
                <T v="tiny" numberOfLines={1}>الكل</T>
              </Tap>
              {Object.entries(CATEGORY).map(([k, v]) => {
                const [Icon, g] = CAT_ICON[k as keyof typeof CAT_ICON] ?? [MessageSquare, GRAD.blue];
                const on = cat === k;
                return (
                  <Tap key={k} onPress={() => setCat(on ? null : k)} scale={0.9} accessibilityState={{ selected: on }} style={{ alignItems: 'center', gap: 5, width: 62, opacity: !cat || on ? 1 : 0.55 }}>
                    <GlyphTile icon={Icon} colors={g} size={50} live={on} />
                    <T v="tiny" numberOfLines={1} color={on ? C.ink : C.ink2}>{v.label}</T>
                  </Tap>
                );
              })}
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
        scale={0.88} style={{ position: 'absolute', left: 18, bottom: 104, width: 60, height: 60, borderRadius: 22, shadowColor: '#E0306B', shadowOpacity: 0.45, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
        <LinearGradient colors={['#FF8FB1', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={30} color={C.white} strokeWidth={2.6} />
        </LinearGradient>
      </Tap>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
