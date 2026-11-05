import { LinearGradient } from 'expo-linear-gradient';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { router, useFocusEffect } from 'expo-router';
import { Briefcase, BookOpen, CircleAlert, Bus, Gift, GraduationCap, Image as ImageIcon, LayoutGrid, MessageSquare, NotebookPen, PartyPopper, Plus, Map as MapIcon, Landmark, Megaphone, Search, SearchCheck, ShoppingBag } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { AdBanner } from '@/components/feed/AdBanner';
import { LikesSheet } from '@/components/feed/LikesSheet';
import { PostCard } from '@/components/feed/PostCard';
import { GlyphTile, GRAD } from '@/components/ui/Glyph';
import { StoriesRow } from '@/components/story/StoriesRow';
import { SuggestedPeople } from '@/components/feed/SuggestedPeople';
import { Avatar, Button, Empty, IconButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadFeed, type FeedFilter } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { CATEGORY, C } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { nm, t } from '@/lib/i18n';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useScreenTimer } from '@/lib/perf';
import { OnScreenProvider, useVisiblePosts } from '@/lib/videoFocus';

const TABS: FeedFilter['tab'][] = ['university', 'college', 'following'];
const CAT_ICON = {
  square: [MessageSquare, GRAD.blue], summaries: [BookOpen, GRAD.green], assignments: [NotebookPen, GRAD.violet], tutoring: [GraduationCap, GRAD.indigo],
  lost_found: [SearchCheck, GRAD.teal], market: [ShoppingBag, GRAD.orange], exchange: [Gift, GRAD.pink], transport_housing: [Bus, GRAD.teal],
  events: [PartyPopper, GRAD.red], opportunities: [Briefcase, GRAD.slate],
} as const;

export default function Community() {
  const { visible, onViewableItemsChanged, viewabilityConfig } = useVisiblePosts(); // reels play only while on screen
  const { profile, university } = useAuth();
  const [tab, setTab] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  useScreenTimer('feed', !loading);
  const [likesOf, setLikesOf] = useState<Post | null>(null);

  const [failed, setFailed] = useState(false);
  const reqKey = useRef(0);          // ignore answers from a tab/category we already left
  const paging = useRef(false);
  const hasMore = useRef(true);
  const scope = { universityId: profile?.university_id ?? null, collegeId: profile?.college_id ?? null };

  const load = useCallback(async () => {
    if (!profile) return;
    const key = ++reqKey.current;
    setLoading(true);
    try {
      const rows = await loadFeed(profile.id, { tab: TABS[tab], category: cat }, undefined, scope);
      if (key !== reqKey.current) return;
      setPosts(rows); setFailed(false); hasMore.current = rows.length >= 20;
    } catch { if (key === reqKey.current) setFailed(true); }
    finally { if (key === reqKey.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.university_id, profile?.college_id, tab, cat]);

  useEffect(() => { load(); }, [load]);
  // new posts show up as soon as you come back from posting
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function more() {
    if (!profile || loading || paging.current || !hasMore.current || posts.length === 0) return;
    const key = reqKey.current;
    const last = [...posts].reverse().find((x) => !x.is_pinned) ?? posts[posts.length - 1];
    paging.current = true;
    try {
      const older = await loadFeed(profile.id, { tab: TABS[tab], category: cat }, last.created_at, scope);
      if (key !== reqKey.current) return;
      hasMore.current = older.length >= 20;
      setPosts((p) => [...p, ...older.filter((o) => !p.some((x) => x.id === o.id))]);
    } catch { /* keep what we have; pulling down retries */ }
    finally { paging.current = false; }
  }

  return (
    <Screen>
      <OnScreenProvider value={visible}>
      <FlatList
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        data={posts}
        keyExtractor={(p) => p.id}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        refreshControl={<PullRefresh onRefresh={load} />}
        contentContainerStyle={{ gap: 14, paddingBottom: 180 }}
        ListHeaderComponent={
          <View style={{ gap: 16, paddingTop: 6 }}>
            <Row gap={8} style={{ paddingHorizontal: 18 }}>
              <View style={{ flex: 1 }}>
                <T v="h1">{t('المجتمع')}</T>
                <T v="small" color={C.muted}>{nm(university)}</T>
              </View>
              <IconButton label={t('إعلانات رسمية')} onPress={() => router.push('/announcements')}><Megaphone size={21} color={C.ink} /></IconButton>
              <IconButton label={t('مجتمع الجامعة')} onPress={() => router.push('/directory')}><Landmark size={21} color={C.ink} /></IconButton>
              <IconButton label={t('بحث')} onPress={() => router.push('/search')}><Search size={21} color={C.ink} /></IconButton>
              <IconButton label={t('الخريطة')} onPress={() => router.push('/map')}><MapIcon size={21} color={C.ink} /></IconButton>
            </Row>
            <StoriesRow />
            <View style={{ paddingHorizontal: 18 }}>
              <Segmented items={[t('جامعتي'), t('كليتي'), t('أتابعهم')]} value={tab} onChange={setTab} />
            </View>
            <Tap onPress={() => router.push('/post/new')} scale={0.98} style={{ marginHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 10 }}>
              <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={40} />
              <T v="body" color={C.faint} style={{ flex: 1 }}>{t('شو ببالك؟ اسأل أو شارك ملخص...')}</T>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={20} color={C.green} /></View>
            </Tap>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: 18 }}>
              <Tap onPress={() => setCat(null)} scale={0.9} style={{ alignItems: 'center', gap: 5, width: 62, opacity: cat ? 0.55 : 1 }}>
                <GlyphTile icon={LayoutGrid} colors={!cat ? GRAD.blue : GRAD.slate} size={50} />
                <T v="tiny" numberOfLines={1}>{t('الكل')}</T>
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
            {index === 1 && <View style={{ marginHorizontal: -18 }}><SuggestedPeople /></View>}
          </Animated.View>
        )}
        ListFooterComponent={!loading && posts.length < 2 ? <View style={{ marginTop: 10 }}><SuggestedPeople /></View> : undefined}
        ListEmptyComponent={loading ? <View style={{ paddingHorizontal: 18 }}><ListSkeleton n={3} kind="post" /></View>
          : failed ? <Empty icon={<CircleAlert size={28} color={C.red} />} title={t('ما قدرنا نحمّل')} body={t('تأكد من الإنترنت وجرّب كمان مرة.')}
              action={<Button kind="soft" title={t('جرّب مرة ثانية')} onPress={load} style={{ paddingHorizontal: 24 }} />} />
          : tab === 1 && !profile?.college_id ? <Empty icon={<GraduationCap size={28} color={C.primary} />} title={t('اختار كليتك أول')} body={t('عشان نوريك منشورات كليتك.')}
              action={<Button kind="soft" title={t('تعديل البروفايل')} onPress={() => router.push('/settings/edit-profile')} style={{ paddingHorizontal: 24 }} />} />
          : <Empty icon={<Plus size={28} color={C.primary} />} title={tab === 2 ? t('تابع زملاءك عشان تشوف منشوراتهم') : t('كون أول واحد بينشر')}
            body={t('اسأل سؤال، شارك ملخص، أو بلّغ عن غرض ضايع.')} />}
      />
      </OnScreenProvider>
      <Tap onPress={() => router.push('/post/new')} accessibilityLabel={t('منشور جديد')}
        scale={0.88} style={{ position: 'absolute', left: 18, bottom: 104, width: 60, height: 60, borderRadius: 22, shadowColor: C.primary, shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 8 }}>
        <View style={{ flex: 1, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Plus size={30} color={C.onPrimary} strokeWidth={2.6} />
        </View>
      </Tap>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
