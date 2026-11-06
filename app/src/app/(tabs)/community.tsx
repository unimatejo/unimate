import { PullRefresh } from '@/components/ui/PullRefresh';
import { router, useFocusEffect } from 'expo-router';
import { Briefcase, BookOpen, CircleAlert, Bus, Gift, GraduationCap, Image as ImageIcon, LayoutGrid, MessageSquare, NotebookPen, PartyPopper, Plus, Landmark, Megaphone, Search, SearchCheck, ShoppingBag, type LucideIcon } from 'lucide-react-native';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Platform, ScrollView, View } from 'react-native';

import { AdBanner } from '@/components/feed/AdBanner';
import { LikesSheet } from '@/components/feed/LikesSheet';
import { PostCard } from '@/components/feed/PostCard';
import { StoriesRow } from '@/components/story/StoriesRow';
import { SuggestedPeople } from '@/components/feed/SuggestedPeople';
import { Avatar, Button, Empty, IconButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { loadFeed, takeFeedStale, type FeedFilter } from '@/lib/posts';
import { CATEGORY, C, F, shadow } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { nm, t } from '@/lib/i18n';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useScreenTimer } from '@/lib/perf';
import { OnScreenProvider, useVisiblePosts } from '@/lib/videoFocus';
import { readCache, writeCache } from '@/lib/cache';
import { useKeepScroll } from '@/lib/keepScroll';

const TABS: FeedFilter['tab'][] = ['university', 'college', 'following'];
const CAT_ICON: Record<string, LucideIcon> = {
  square: MessageSquare, summaries: BookOpen, assignments: NotebookPen, tutoring: GraduationCap, lost_found: SearchCheck,
  market: ShoppingBag, exchange: Gift, transport_housing: Bus, events: PartyPopper, opportunities: Briefcase,
};

/** A category filter: a small pill with its icon, filled when it's on. */
function CatChip({ label, icon: Icon, color, on, onPress }: { label: string; icon: LucideIcon; color: string; on: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} scale={0.94} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 13, borderRadius: 999, backgroundColor: on ? C.inverse : C.card, borderWidth: on ? 0 : 1, borderColor: C.line }}>
      <Icon size={16} color={on ? C.onInverse : color} />
      <T v="small" style={{ fontFamily: on ? F.bodyBold : F.bodyMd }} color={on ? C.onInverse : C.ink}>{label}</T>
    </Tap>
  );
}

export default function Community() {
  const { visible, onViewableItemsChanged, viewabilityConfig } = useVisiblePosts(); // reels play only while on screen
  const { profile, university } = useAuth();
  const [tab, setTab] = useState(0);
  const [cat, setCat] = useState<string | null>(null);
  // each tab/category opens with what it showed last time, then refreshes quietly
  const cacheKey = profile ? `feed:${profile.id}:${tab}:${cat ?? ''}` : null;
  const [posts, setPosts] = useState<Post[]>(() => readCache<Post[]>(cacheKey) ?? []);
  const [loading, setLoading] = useState(() => !readCache(cacheKey));
  useScreenTimer('feed', !loading);
  const [likesOf, setLikesOf] = useState<Post | null>(null);
  const listRef = useRef<FlatList<Post>>(null);
  const keepScroll = useKeepScroll(listRef);

  const [failed, setFailed] = useState(false);
  const reqKey = useRef(0);          // ignore answers from a tab/category we already left
  const paging = useRef(false);
  const hasMore = useRef(true);
  const scope = { universityId: profile?.university_id ?? null, collegeId: profile?.college_id ?? null };

  // what's on screen now (tab + category) and when it was last fetched
  const shown = useRef<{ key: string | null; at: number }>({ key: null, at: 0 });
  /**
   * `fresh`: a new tab/category, or pull to refresh — start from the top.
   * Otherwise (coming back from a post, a profile, a chat): keep the list, the pages already loaded and the scroll
   * position exactly as they were, and only slip newer posts in at the top, quietly (like Instagram).
   */
  const load = useCallback(async (fresh = false) => {
    if (!profile) return;
    const same = shown.current.key === cacheKey;
    if (same && !fresh && !takeFeedStale() && Date.now() - shown.current.at < 30000) return;
    const key = ++reqKey.current;
    if (!same || fresh) {
      const seen = readCache<Post[]>(cacheKey);
      if (seen) { setPosts(seen); setLoading(false); } else { setPosts([]); setLoading(true); }
    }
    try {
      const rows = await loadFeed(profile.id, { tab: TABS[tab], category: cat }, undefined, scope);
      if (key !== reqKey.current) return;
      shown.current = { key: cacheKey, at: Date.now() };
      setFailed(false);
      if (same && !fresh) {
        // the first page, updated; everything older that was already scrolled to stays where it was
        setPosts((cur) => [...rows, ...cur.filter((o) => !rows.some((r) => r.id === o.id) && rows.length > 0 && o.created_at < rows[rows.length - 1].created_at)]);
      } else {
        setPosts(rows); hasMore.current = rows.length >= 20;
      }
      writeCache(cacheKey, rows);
    } catch { if (key === reqKey.current) setFailed(true); }
    finally { if (key === reqKey.current) setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.university_id, profile?.college_id, tab, cat]);

  // runs when the tab opens, when tab/category change, and when you come back (quietly, keeping your place)
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

  const renderPost = useCallback(({ item, index }: { item: Post; index: number }) => (
    <View style={{ paddingHorizontal: 18, gap: 14 }}>
      <PostCard post={item} onLikes={setLikesOf} compact />
      {index === 2 && <AdBanner placement="feed_card" />}
      {index === 1 && <View style={{ marginHorizontal: -18 }}><SuggestedPeople /></View>}
    </View>
  ), []);

  return (
    <Screen>
      <OnScreenProvider value={visible}>
      <FlatList
        ref={listRef}
        onScroll={keepScroll}
        scrollEventThrottle={64}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        data={posts}
        keyExtractor={(p) => p.id}
        onEndReached={more}
        onEndReachedThreshold={0.4}
        refreshControl={<PullRefresh onRefresh={() => load(true)} />}
        contentContainerStyle={{ gap: 14, paddingBottom: 180 }}
        ListHeaderComponent={
          <View style={{ gap: 14, paddingTop: 6, paddingBottom: 2 }}>
            <Row gap={6} style={{ paddingHorizontal: 18 }}>
              <View style={{ flex: 1 }}>
                <T v="h1">{t('المجتمع')}</T>
                <T v="small" color={C.muted} numberOfLines={1}>{nm(university)}</T>
              </View>
              <IconButton label={t('بحث')} onPress={() => router.push('/search')}><Search size={21} color={C.ink} /></IconButton>
              <IconButton label={t('إعلانات رسمية')} onPress={() => router.push('/announcements')}><Megaphone size={21} color={C.ink} /></IconButton>
              <IconButton label={t('مجتمع الجامعة')} onPress={() => router.push('/directory')}><Landmark size={21} color={C.ink} /></IconButton>
              <IconButton label={t('منشور جديد')} dark onPress={() => router.push('/post/new')}><Plus size={22} color={C.onInverse} strokeWidth={2.4} /></IconButton>
            </Row>
            <StoriesRow />
            <View style={{ paddingHorizontal: 18 }}>
              <Segmented items={[t('جامعتي'), t('كليتي'), t('أتابعهم')]} value={tab} onChange={setTab} />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, paddingVertical: 4 }}>
              <CatChip label={t('الكل')} icon={LayoutGrid} color={C.primary} on={!cat} onPress={() => setCat(null)} />
              {Object.entries(CATEGORY).map(([k, v]) => (
                <CatChip key={k} label={v.label} icon={CAT_ICON[k as keyof typeof CAT_ICON] ?? MessageSquare} color={v.ink} on={cat === k} onPress={() => setCat(cat === k ? null : k)} />
              ))}
            </ScrollView>
            <Tap onPress={() => router.push('/post/new')} scale={0.98} accessibilityLabel={t('منشور جديد')}
              style={[{ marginHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card, borderRadius: 20, paddingHorizontal: 10, minHeight: 56 }, shadow]}>
              <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={36} />
              <T v="body" color={C.faint} style={{ flex: 1 }} numberOfLines={1}>{t('شو ببالك؟ اسأل أو شارك ملخص...')}</T>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={19} color={C.green} /></View>
            </Tap>
          </View>
        }
        renderItem={renderPost}
        // light on memory and smooth on every phone: draw a few screens around you, add more in small steps
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        updateCellsBatchingPeriod={60}
        removeClippedSubviews={Platform.OS === 'android'}
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
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
