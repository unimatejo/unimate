import { TitleBadge, titledName } from '@/components/profile/TitleBadge';
import { router, useFocusEffect } from 'expo-router';
import { readCache, writeCache } from '@/lib/cache';
import { BarChart3, Check, ChevronRight, Clapperboard, FileText, Grid3x3, Heart, Lock, Menu, MoreHorizontal, Play, Plus, PlusSquare, Star, UserPlus, UserSquare2, UserX, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { Alert, Linking, RefreshControl, ScrollView, View, Platform } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { LikesSheet } from '@/components/feed/LikesSheet';
import { InstagramGlyph, SnapGlyph } from '@/components/profile/SocialGlyphs';
import { SuggestedPeople } from '@/components/feed/SuggestedPeople';
import { Avatar, Button, Empty, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, toggleLike, withMine } from '@/lib/posts';
import { optimistic, run } from '@/lib/run';
import { toast } from '@/lib/toast';
import { mediaUrl, supabase, photoWidth } from '@/lib/supabase';
import { C, F, R, SPRING } from '@/lib/theme';
import type { Post, Profile } from '@/lib/types';
import { flip, nm, t, LOCALE } from '@/lib/i18n';
import { Bone } from '@/components/ui/Skeleton';
import { useScreenTimer } from '@/lib/perf';
import { featureOn, useAppContent } from '@/lib/appContent';
import { goBack } from '@/lib/nav';
import { shareLink } from '@/lib/share';
import { HighlightEditor, type HighlightRef } from '@/components/story/HighlightEditor';

type Rel = 'none' | 'pending' | 'accepted';

/** Open the Instagram / Snapchat app on that profile, or the website if the app isn't installed. */
function openSocial(site: 'instagram' | 'snapchat', handle: string) {
  // people paste "@name", full links or spaces — keep only the handle
  const clean = handle.trim().replace(/^https?:\/\/(www\.)?(instagram\.com|snapchat\.com\/add)\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0];
  if (!clean) return;
  const h = encodeURIComponent(clean);
  const app = site === 'instagram' ? `instagram://user?username=${h}` : `snapchat://add/${h}`;
  const web = site === 'instagram' ? `https://www.instagram.com/${h}/` : `https://www.snapchat.com/add/${h}`;
  Linking.openURL(app).catch(() => Linking.openURL(web).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط'))));
}

const TILE_G: [string, string][] = [['#2E5BFF', '#17204A'], ['#FF7A59', '#C0264A'], ['#0D9488', '#17204A'], ['#6A3BE0', '#17204A'], ['#B45309', '#3A2A44']];

/** A highlight circle under the bio: tap plays its stories; on your own profile, hold to edit it (like Instagram). */
function HighlightBubble({ h, owner, onEdit }: { h: HighlightRef; owner: string; onEdit?: (h: HighlightRef) => void }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { setUri(null); if (h.cover_url) mediaUrl('stories', h.cover_url, photoWidth(66)).then(setUri); }, [h.cover_url]);
  return (
    <Tap onPress={() => router.push({ pathname: '/story/[id]', params: { id: owner, highlight: h.id } })}
      onLongPress={onEdit ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onEdit(h); } : undefined}
      style={{ alignItems: 'center', gap: 6, width: 70 }} accessibilityLabel={h.title} accessibilityHint={onEdit ? t('اضغط مطوّل للتعديل') : undefined}>
      <View style={{ width: 66, height: 66, borderRadius: 33, padding: 3, borderWidth: 1.5, borderColor: C.line }}>
        <View style={{ flex: 1, borderRadius: 30, overflow: 'hidden', backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
          {uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} />
            : <T style={{ fontFamily: F.display, fontSize: 22 }} color={C.muted}>{h.title.trim()[0] ?? '★'}</T>}
        </View>
      </View>
      <T v="tiny" numberOfLines={1} style={{ maxWidth: 70 }}>{h.title}</T>
    </Tap>
  );
}

/** One square in the profile grid. Tap opens the post, double tap likes it (heart pulse + haptic). */
export function GridTile({ post, i }: { post: Post; i: number }) {
  const { profile } = useAuth();
  const img = (post.media ?? []).find((m) => m.kind === 'image');
  const video = (post.media ?? []).some((m) => m.kind === 'video');
  const file = (post.media ?? []).some((m) => m.kind === 'file');
  const [uri, setUri] = useState<string | null>(null);
  const [liked, setLiked] = useState(!!post.liked);
  useEffect(() => { if (img) mediaUrl('posts', img.url, photoWidth(140)).then(setUri); }, [img]);
  const burst = useSharedValue(0);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 0.5 + burst.value * 0.7 }] }));
  const [last, setLast] = useState(0);
  const [timer, setTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  function press() {
    const now = Date.now();
    if (now - last < 260) {
      if (timer) clearTimeout(timer);
      setTimer(null); setLast(0);
      burst.value = withSequence(withSpring(1, SPRING), withTiming(1, { duration: 280 }), withTiming(0, { duration: 200 }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      if (!liked && profile) optimistic(`like:${post.id}`, () => setLiked(true), () => setLiked(false), () => toggleLike({ ...post, liked: false }, profile.id));
      return;
    }
    setLast(now);
    setTimer(setTimeout(() => router.push({ pathname: '/post/[id]', params: { id: post.id } }), 270));
  }
  return (
    <Tap haptic={false} scale={0.98} throttle={0} onPress={press} style={{ width: '33.333%', aspectRatio: 1, padding: 1 }} accessibilityLabel={post.title ?? post.body.slice(0, 40)}>
      <View style={{ flex: 1, overflow: 'hidden', backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
        {img ? (uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} /> : null) : (
          <LinearGradient colors={TILE_G[i % TILE_G.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 8, justifyContent: 'center' }}>
            {video ? <Play size={30} color="#fff" fill="#fff" style={{ alignSelf: 'center' }} /> : <T v="tiny" color="#fff" numberOfLines={5} style={{ fontSize: 11, lineHeight: 16 }}>{post.title || post.body}</T>}
          </LinearGradient>
        )}
        {(file || post.poll || video) && (
          <View style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 7, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' }}>
            {video ? <Clapperboard size={12} color="#fff" /> : file ? <FileText size={12} color="#fff" /> : <BarChart3 size={12} color="#fff" />}
          </View>
        )}
        <Animated.View style={burstStyle} pointerEvents="none"><Heart size={46} color="#fff" fill="#fff" /></Animated.View>
      </View>
    </Tap>
  );
}

export function ProfileView({ userId, onTitle, back }: { userId: string; onTitle?: (title: string) => void; back?: boolean }) {
  const { profile: me } = useAuth();
  const mine = me?.id === userId;
  const content = useAppContent();
  const [p, setP] = useState<Profile | null>(null);
  const [rel, setRel] = useState<Rel>('none');
  const [followsMe, setFollowsMe] = useState(false);
  const [isClose, setIsClose] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState(0);
  const [likesOf, setLikesOf] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  useScreenTimer('profile', !loading);
  const [hasStory, setHasStory] = useState(false);
  const [hls, setHls] = useState<HighlightRef[]>([]);
  const [failed, setFailed] = useState<'none' | 'error' | 'missing'>('none');
  const [busy, setBusy] = useState(false);
  const [suggest, setSuggest] = useState(false);
  // the highlight editor: null closed, 'new', or the one being edited
  const [hlEdit, setHlEdit] = useState<HighlightRef | 'new' | null>(null);
  const [tagged, setTagged] = useState<Post[] | null>(null);

  const cacheKey = me ? `profile:${me.id}:${userId}` : null;
  type Saved = { p: Profile; rel: Rel; followsMe: boolean; isClose: boolean; hasStory: boolean; hls: typeof hls; posts: Post[] };
  // a profile opened before shows at once; the fresh copy replaces it
  useEffect(() => {
    const c = readCache<Saved>(cacheKey);
    if (!c) return;
    setP(c.p); setRel(c.rel); setFollowsMe(c.followsMe); setIsClose(c.isClose); setHasStory(c.hasStory); setHls(c.hls); setPosts(c.posts); setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const load = useCallback(async () => {
    if (!me) return;
    if (!readCache(cacheKey)) setLoading(true);
    try {
    const now = new Date().toISOString();
    const none = Promise.resolve({ data: null });
    // one round trip: everything on the page is asked for at the same time
    const [{ data, error }, { data: soc }, { data: f }, { data: back }, { data: cf }, { count: sc }, { data: hl }, { data: ps }] = await Promise.all([
      supabase.from('profiles').select('*, major:majors!profiles_major_id_fkey(name_ar, name_en), college:colleges!profiles_college_id_fkey(name_ar, name_en), university:universities!profiles_university_id_fkey(name_ar, name_en)').eq('id', userId).maybeSingle(),
      supabase.rpc('profile_socials', { p_user: userId }),
      mine ? none : supabase.from('follows').select('status').eq('follower_id', me.id).eq('followee_id', userId).maybeSingle(),
      mine ? none : supabase.from('follows').select('status').eq('follower_id', userId).eq('followee_id', me.id).eq('status', 'accepted').maybeSingle(),
      mine ? none : supabase.from('close_friends').select('friend_id').eq('owner_id', userId).eq('friend_id', me.id).maybeSingle(),
      supabase.from('stories').select('id', { count: 'exact', head: true }).eq('author_id', userId).gt('expires_at', now),
      supabase.from('highlights').select('id, title, cover_url').eq('owner_id', userId).order('position'),
      supabase.from('posts').select(POST_SELECT).eq('author_id', userId).order('created_at', { ascending: false }).limit(30),
    ]);
    if (error) { setFailed('error'); return; }
    if (!data) { setFailed('missing'); return; }
    setFailed('none');
    const s0 = (soc as { instagram: string | null; snapchat: string | null }[] | null)?.[0];
    const prof = { ...(data as Profile), instagram: s0?.instagram ?? null, snapchat: s0?.snapchat ?? null };
    setP(prof);
    onTitle?.(prof.username ? `\u200E@${prof.username}` : prof.full_name ?? '');
    const relNow = ((f as { status?: Rel } | null)?.status) ?? 'none';
    setRel(relNow); setFollowsMe(!!back); setIsClose(!!cf);
    setHasStory((sc ?? 0) > 0);
    const hlNow = (hl ?? []) as typeof hls;
    setHls(hlNow);
    const postsNow = await withMine((ps ?? []) as unknown as Post[], me.id);
    setPosts(postsNow);
    writeCache(cacheKey, { p: prof, rel: relNow, followsMe: !!back, isClose: !!cf, hasStory: (sc ?? 0) > 0, hls: hlNow, posts: postsNow } satisfies Saved);
    } catch { setFailed((f) => (f === 'none' && !p ? 'error' : f)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, userId, mine, cacheKey]);

  // loads on first focus and quietly refreshes when coming back from edit profile / privacy
  // (no spinner: a programmatic pull-to-refresh spinner made the whole page jump down and up)
  useFocusEffect(useCallback(() => { load(); }, [load]));
  const [pulling, setPulling] = useState(false);
  const pull = useCallback(async () => { setPulling(true); try { await load(); } finally { setPulling(false); } }, [load]);

  const bump = (d: number) => setP((x) => (x ? { ...x, follower_count: Math.max(0, (x.follower_count ?? 0) + d) } : x));

  async function doFollow() {
    if (!me || busy) return;
    setBusy(true);
    try {
      if (rel === 'none') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        const next: Rel = p?.is_private ? 'pending' : 'accepted';
        setRel(next); if (next === 'accepted') bump(1);
        const r = await run(supabase.from('follows').insert({ follower_id: me.id, followee_id: userId }));
        if (!r.ok) { setRel('none'); if (next === 'accepted') bump(-1); }
      } else {
        const prev = rel;
        setRel('none'); if (prev === 'accepted') bump(-1);
        const r = await run(supabase.from('follows').delete().eq('follower_id', me.id).eq('followee_id', userId));
        if (!r.ok) { setRel(prev); if (prev === 'accepted') bump(1); }
      }
    } finally { setBusy(false); }
  }

  function follow() {
    if (rel === 'none') return doFollow();
    const title = rel === 'pending' ? t('تلغي طلب المتابعة؟') : t('تلغي متابعة {0}؟', [p?.full_name ?? '']);
    Alert.alert(title, p?.is_private && rel === 'accepted' ? t('حسابه خاص، رح تحتاج تبعث طلب جديد لتشوف منشوراته.') : undefined, [
      { text: t('إلغاء'), style: 'cancel' },
      { text: rel === 'pending' ? t('إلغاء الطلب') : t('إلغاء المتابعة'), style: 'destructive', onPress: doFollow },
    ]);
  }

  function shareProfile() {
    if (!p) return;
    const url = `https://app.unimate.my/user/${p.id}`;
    shareLink(url, `${p.full_name}${p.username ? ` (@${p.username})` : ''} على يونيميت`);
  }

  /** Block / unblock, like Instagram: a blocked person can't find this account, message it or see its posts. */
  function toggleBlock(blocked: boolean) {
    if (!me) return;
    const name = p?.full_name ?? '';
    Alert.alert(blocked ? t('تلغي حظر {0}؟', [name]) : t('تحظر {0}؟', [name]),
      blocked ? t('رح يقدر يشوف حسابك ويراسلك مرة ثانية.') : t('ما رح يقدر يلاقي حسابك أو يراسلك أو يشوف منشوراتك، وما بيعرف إنك حظرته.'), [
      { text: t('إلغاء'), style: 'cancel' },
      { text: blocked ? t('إلغاء الحظر') : t('احظر'), style: 'destructive', onPress: async () => {
        const r = blocked
          ? await run(supabase.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', userId))
          : await run(supabase.from('blocks').insert({ blocker_id: me.id, blocked_id: userId }));
        if (!r.ok) return;
        toast(blocked ? t('انلغى الحظر') : t('انحظر'));
        if (!blocked) { goBack('/(tabs)'); } else load();
      } },
    ]);
  }

  async function moreMenu() {
    const blocked = (await supabase.rpc('i_blocked', { target: userId })).data === true;
    Alert.alert(p?.full_name ?? '', undefined, [
      { text: t('شارك البروفايل'), onPress: shareProfile },
      { text: blocked ? t('إلغاء الحظر') : t('حظر'), onPress: () => toggleBlock(blocked) },
      { text: t('إبلاغ'), style: 'destructive', onPress: () => router.push({ pathname: '/report', params: { type: 'user', id: userId, user: userId } }) },
      { text: t('إلغاء'), style: 'cancel' },
    ]);
  }

  async function message() {
    const { data, error } = await supabase.rpc('start_direct', { target: userId, context: null });
    if (error) { Alert.alert(t('ما بتقدر تراسله'), error.message.includes('not accepting') ? t('هاد الطالب مسكّر الرسائل من ناس خارج دفعته.') : t('جرّب بعدين.')); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  // posts other people wrote that mention @username (loaded when the tab opens)
  useEffect(() => {
    if (tab !== 2 || tagged !== null || !p?.username || !me) return;
    supabase.from('posts').select(POST_SELECT).ilike('body', `%@${p.username}%`).neq('author_id', userId).order('created_at', { ascending: false }).limit(30)
      .then(async ({ data }) => setTagged(await withMine((data ?? []) as unknown as Post[], me.id)));
  }, [tab, tagged, p?.username, me, userId]);

  if (!p && failed !== 'none') return (
    <View style={{ flex: 1, padding: 24, paddingTop: 60 }}>
      <Empty icon={failed === 'missing' ? <UserX size={28} color={C.muted} /> : <WifiOff size={28} color={C.muted} />} title={failed === 'missing' ? t('هالحساب مش موجود') : t('ما قدرنا نفتح البروفايل')}
        body={failed === 'missing' ? t('يمكن انحذف أو الرابط غلط.') : t('تأكد من الإنترنت وجرّب كمان مرة.')}
        action={failed === 'error' ? <Button kind="soft" title={t('جرّب مرة ثانية')} onPress={load} style={{ paddingHorizontal: 28 }} /> : undefined} />
    </View>
  );
  if (!p) return (
    <View style={{ flex: 1, padding: 20, gap: 16 }}>
      <Row gap={20}><Bone w={92} h={92} r={46} /><Row gap={10} style={{ flex: 1 }}><Bone h={34} r={10} style={{ flex: 1 }} /><Bone h={34} r={10} style={{ flex: 1 }} /><Bone h={34} r={10} style={{ flex: 1 }} /></Row></Row>
      <Bone h={16} w="40%" /><Bone h={26} w="70%" r={13} /><Bone h={12} w="60%" />
      <Row gap={8}><Bone h={40} r={20} style={{ flex: 1 }} /><Bone h={40} r={20} style={{ flex: 1 }} /></Row>
      <Row gap={16}>{[0, 1, 2, 3].map((k) => <Bone key={k} w={60} h={60} r={30} />)}</Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>{[0, 1, 2, 3, 4, 5].map((k) => <Bone key={k} w="32.8%" h={120} r={0} />)}</View>
    </View>
  );
  const canSee = mine || !p.is_private || rel === 'accepted';
  const friends = rel === 'accepted' && followsMe;
  const socialsVisible = mine || (p.socials_visible_to === 'everyone') || (p.socials_visible_to === 'friends' && friends) || (p.socials_visible_to === 'close_friends' && isClose);
  const reels = posts.filter((x) => (x.media ?? []).some((m) => m.kind === 'video'));
  const shown = tab === 0 ? posts : tab === 1 ? reels : (tagged ?? []);
   
  const uni = nm((p as any).university);
  const staffAcct = p.title_verified && (p.account_type === 'faculty' || p.account_type === 'staff');
  // faculty show their department instead of a study year
  const badge = staffAcct
    ? [uni, p.department || nm(p.major)].filter(Boolean).join(' · ')
    : [uni, nm(p.major), p.study_year ? t('سنة {0}', [p.study_year]) : null].filter(Boolean).join(' · ');
  const pill = { flex: 1, minHeight: 40, borderRadius: R.pill, backgroundColor: C.soft, alignItems: 'center' as const, justifyContent: 'center' as const, paddingHorizontal: 12 };
  const Verified = () => (
    <View accessibilityLabel={staffAcct ? t('حساب موثّق بالجامعة') : t('طالب موثّق بحساب الجامعة')} style={{ width: 17, height: 17, borderRadius: 9, backgroundColor: C.verified, alignItems: 'center', justifyContent: 'center' }}>
      <Check size={11} color="#FFFFFF" strokeWidth={3.4} />
    </View>
  );

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} refreshControl={<RefreshControl refreshing={pulling} onRefresh={pull} tintColor={C.muted} />}>
        <View style={{ paddingHorizontal: 20, paddingTop: 6, gap: 12 }}>
          {/* top bar like Instagram: username + badge, then create / activity / menu (mine) or more (others) */}
          <Row gap={4} style={{ minHeight: 48, marginHorizontal: -6 }}>
            {back && (
              <Tap onPress={() => goBack('/')} accessibilityLabel={t('رجوع')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <ChevronRight size={24} color={C.ink} style={flip} />
              </Tap>
            )}
            <Row gap={6} style={{ flex: 1, paddingHorizontal: back ? 0 : 6 }}>
              {p.is_private && <Lock size={15} color={C.ink} />}
              <T numberOfLines={1} style={{ fontFamily: F.title, fontSize: 20, writingDirection: 'ltr', flexShrink: 1 }}>{p.username ? p.username : p.full_name}</T>
              {p.is_verified && <Verified />}
              <TitleBadge title={p.academic_title} verified={p.title_verified} />
            </Row>
            {mine ? (
              <>
                <Tap onPress={() => router.push('/post/new')} accessibilityLabel={t('إنشاء')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><PlusSquare size={23} color={C.ink} /></Tap>
                <Tap onPress={() => router.push('/notifications')} accessibilityLabel={t('الإشعارات')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Heart size={23} color={C.ink} /></Tap>
                <Tap onPress={() => router.push('/settings')} accessibilityLabel={t('الإعدادات')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Menu size={24} color={C.ink} /></Tap>
              </>
            ) : (
              <Tap onPress={moreMenu} accessibilityLabel={t('خيارات')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={23} color={C.ink} /></Tap>
            )}
          </Row>

          <Row gap={20}>
            <View>
              <Tap haptic={false} scale={0.95} disabled={!hasStory && !mine}
                onPress={() => (hasStory ? router.push({ pathname: '/story/[id]', params: { id: p.id } }) : router.push({ pathname: '/post/new', params: { mode: 'story' } }))}
                accessibilityLabel={hasStory ? t('شوف قصته') : mine ? t('أضف للستوري') : p.full_name}>
                <View style={{ width: 92, height: 92, borderRadius: 46, padding: 4, borderWidth: 2, borderColor: hasStory ? C.primary : 'transparent' }}>
                  <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={80} />
                </View>
              </Tap>
              {/* your own avatar: the little + opens the story camera, like Instagram */}
              {mine && (
                <Tap onPress={() => router.push({ pathname: '/post/new', params: { mode: 'story' } })} accessibilityLabel={t('أضف للستوري')} hitSlop={8}
                  style={{ position: 'absolute', bottom: 2, ...(Platform.OS === 'web' ? { left: 2 } : { end: 2 }), width: 28, height: 28, borderRadius: 14, backgroundColor: C.primary, borderWidth: 3, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
                  <Plus size={15} color={C.onPrimary} strokeWidth={3} />
                </Tap>
              )}
            </View>
            <View style={{ flex: 1, flexDirection: 'row' }}>
              {([[p.post_count, t('منشور'), true, null], [p.follower_count, t('متابِع'), mine || !p.hide_followers, 'followers'], [p.following_count, t('متابَع'), mine || !p.hide_following, 'following']] as [number, string, boolean, string | null][]).map(([n, l, open, type]) => (
                // like Instagram: the number always shows; the list opens only if it isn't hidden and you can see the account
                <Tap key={l} haptic={false} scale={0.98} disabled={!type}
                  onPress={() => {
                    if (!type) return;
                    if (!canSee) { toast(t('الحساب خاص. تابعه عشان تشوف القائمة.')); return; }
                    if (!open) { toast(type === 'followers' ? t('صاحب الحساب مخفي قائمة المتابعين.') : t('صاحب الحساب مخفي قائمة اللي بيتابعهم.')); return; }
                    router.push({ pathname: '/follows', params: { user: userId, type, name: p.full_name } });
                  }}
                  style={{ flex: 1, alignItems: 'center', minHeight: 48, justifyContent: 'center' }} accessibilityLabel={`${n} ${l}`}>
                  <T style={{ fontFamily: F.title, fontSize: 18 }}>{(n ?? 0).toLocaleString(LOCALE)}</T>
                  <T v="tiny" color={C.muted}>{l}</T>
                </Tap>
              ))}
            </View>
          </Row>

          <View style={{ gap: 6 }}>
            <Row gap={6}>
              <T style={{ fontFamily: F.bodyBold, fontSize: 15 }}>{titledName(p.full_name, p.academic_title, p.title_verified)}</T>
              {friends && <Animated.View entering={FadeIn}><View style={{ backgroundColor: C.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><T v="tiny" color={C.greenInk}>{t('أصدقاء')}</T></View></Animated.View>}
            </Row>
            <TitleBadge title={p.academic_title} verified={p.title_verified} size="md" label={p.position_title} />
            {!!badge && (
              <View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 26, paddingHorizontal: 10, borderRadius: 13, backgroundColor: C.soft, maxWidth: '100%' }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary }} />
                <T v="tiny" numberOfLines={1} style={{ fontFamily: F.bodyBold, flexShrink: 1 }}>{badge}</T>
              </View>
            )}
            {p.bio ? <T style={{ fontSize: 14, lineHeight: 22 }}>{p.bio}</T> : null}
            {p.birth_year ? (() => {
              const today = new Date();
              const isToday = p.birth_day === `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
              const full = p.birth_day ? new Date(`${p.birth_year}-${p.birth_day}T12:00:00`).toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
              return <T v="small" color={isToday ? C.primary : C.ink2}>🎂 {isToday ? t('عيد ميلاده اليوم! 🎉') : full ? t('مواليد {0}', [full]) : t('مواليد {0}', [String(p.birth_year)])}</T>;
            })() : null}
            {p.points > 0 && featureOn(content, 'leaderboard') && (
              <Tap haptic={false} scale={0.97} onPress={() => router.push('/leaderboard')} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
                <Row gap={5}><Star size={14} color="#F59E0B" fill="#F59E0B" /><T v="tiny" color={C.muted}>{p.points} {t('نقطة مساعدة')}</T></Row>
              </Tap>
            )}
          </View>

          <Row gap={8}>
            {mine ? (
              <>
                <Tap onPress={() => router.push('/settings/edit-profile')} style={pill}><T v="bold" style={{ fontSize: 14 }}>{t('تعديل الملف')}</T></Tap>
                <Tap onPress={shareProfile} style={pill}><T v="bold" style={{ fontSize: 14 }}>{t('مشاركة الملف')}</T></Tap>
              </>
            ) : (
              <>
                <Tap onPress={follow} disabled={busy} style={[pill, rel === 'none' && { backgroundColor: C.primary }]} accessibilityLabel={rel === 'none' ? t('متابعة') : t('إلغاء المتابعة')}>
                  <T v="bold" color={rel === 'none' ? C.onPrimary : C.ink} style={{ fontSize: 14 }}>{rel === 'none' ? (followsMe ? t('تابِع بالمثل') : t('متابعة')) : rel === 'pending' ? t('تم إرسال الطلب') : friends ? t('أصدقاء') : t('تتابعه')}</T>
                </Tap>
                <Tap onPress={message} style={pill}><T v="bold" style={{ fontSize: 14 }}>{t('رسالة')}</T></Tap>
              </>
            )}
            <Tap onPress={() => setSuggest((v) => !v)} accessibilityLabel={t('اقتراحات زملاء')} accessibilityState={{ expanded: suggest }}
              style={{ width: 44, minHeight: 40, borderRadius: R.pill, backgroundColor: suggest ? C.inverse : C.soft, alignItems: 'center', justifyContent: 'center' }}>
              <UserPlus size={18} color={suggest ? C.onInverse : C.ink} />
            </Tap>
          </Row>

          {socialsVisible && (p.instagram || p.snapchat) && (
            <Animated.View entering={FadeIn.duration(220)} style={{ flexDirection: 'row', gap: 12 }}>
              {p.instagram && (
                <Tap onPress={() => openSocial('instagram', p.instagram!)} scale={0.9} accessibilityLabel={t('افتح إنستغرام {0}', [p.instagram])} style={{ alignItems: 'center', gap: 4 }}>
                  <InstagramGlyph size={44} />
                  <T v="tiny" color={C.muted}>{t('إنستغرام')}</T>
                </Tap>
              )}
              {p.snapchat && (
                <Tap onPress={() => openSocial('snapchat', p.snapchat!)} scale={0.9} accessibilityLabel={t('افتح سناب {0}', [p.snapchat])} style={{ alignItems: 'center', gap: 4 }}>
                  <SnapGlyph size={44} />
                  <T v="tiny" color={C.muted}>{t('سناب')}</T>
                </Tap>
              )}
            </Animated.View>
          )}
        </View>

        {suggest && <Animated.View entering={FadeIn.duration(220)} style={{ paddingTop: 14 }}><SuggestedPeople /></Animated.View>}

        {canSee && (hls.length > 0 || mine) && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 6 }}>
            {mine && (
              <Tap onPress={() => setHlEdit('new')} style={{ alignItems: 'center', gap: 6, width: 70 }} accessibilityLabel={t('هايلايت جديد')}>
                <View style={{ width: 66, height: 66, borderRadius: 33, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center' }}><Plus size={26} color={C.ink} /></View>
                <T v="tiny">{t('جديد')}</T>
              </Tap>
            )}
            {hls.map((h) => <HighlightBubble key={h.id} h={h} owner={userId} onEdit={mine ? setHlEdit : undefined} />)}
          </ScrollView>
        )}

        {canSee ? (
          <View style={{ marginTop: 10 }}>
            <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line }}>
              {([[Grid3x3, t('المنشورات')], [Clapperboard, t('الريلز')], [UserSquare2, t('الإشارات')]] as [typeof Grid3x3, string][]).map(([I, label], i) => (
                <Tap key={i} haptic={false} onPress={() => setTab(i)} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === i }}
                  style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46, borderBottomWidth: 2, borderBottomColor: tab === i ? C.ink : 'transparent', marginBottom: -1 }}>
                  <I size={22} color={tab === i ? C.ink : C.muted} />
                </Tap>
              ))}
            </View>
            {tab === 2 && tagged === null && p.username ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingTop: 1 }}>{[0, 1, 2].map((k) => <View key={k} style={{ width: '33.333%', aspectRatio: 1, padding: 1 }}><Bone h={200} r={0} style={{ flex: 1 }} /></View>)}</View>
            ) : shown.length === 0 ? (
              <Empty icon={tab === 1 ? <Clapperboard size={28} color={C.primary} /> : tab === 2 ? <UserSquare2 size={28} color={C.primary} /> : <Grid3x3 size={28} color={C.primary} />}
                title={tab === 1 ? t('ما في ريلز لهلأ') : tab === 2 ? t('ما في إشارات لهلأ') : t('ما في منشورات لهلأ')}
                body={tab === 2 ? t('المنشورات اللي بتذكر @{0} بتطلع هون.', [p.username ?? '']) : undefined}
                action={mine && tab !== 2 ? <Button kind="soft" title={tab === 1 ? t('نزّل ريلز') : t('شارك أول منشور')} onPress={() => router.push({ pathname: '/post/new', params: tab === 1 ? { mode: 'reel' } : {} })} style={{ marginTop: 8, paddingHorizontal: 22 }} /> : undefined} />
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingTop: 1 }}>
                {shown.map((x, i) => <GridTile key={x.id} post={x} i={i} />)}
              </View>
            )}
          </View>
        ) : (
          <View style={{ margin: 18, backgroundColor: C.card, borderRadius: R.xl, borderWidth: 1, borderColor: C.line, padding: 28, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' }}><Lock size={26} color={C.ink} /></View>
            <T v="h3">{t('هاد الحساب خاص')}</T>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('لما يتقبل طلب متابعتك، بتشوف منشوراته وقصصه وحساباته الثانية.')}</T>
          </View>
        )}
      </ScrollView>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
      {mine && <HighlightEditor open={!!hlEdit} edit={hlEdit === 'new' ? null : hlEdit} onClose={() => setHlEdit(null)} onSaved={load} />}
    </>
  );
}
