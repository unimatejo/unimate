import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { BadgeCheck, Bookmark, FileText, MoreHorizontal, Heart, MessageCircle, Send } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { ActionSheetIOS, Alert, Platform, ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';

import { ImageViewer } from './ImageViewer';
import { PostVideo } from './PostVideo';
import { TitleBadge, titledName } from './TitleBadge';
import { Avatar, Row, T, Tag, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { toggleLike, toggleSave } from '@/lib/posts';
import { optimistic, run } from '@/lib/run';
import { toast } from '@/lib/toast';
import { mediaUrl, supabase } from '@/lib/supabase';
import { CATEGORY, C, F, shadow } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { timeAgo } from '@/lib/util';
import { nm, t } from '@/lib/i18n';

/** Post photo: one tap opens it full screen, double tap likes (like Instagram). */
function Photo({ path, onDoubleTap, width }: { path: string; onDoubleTap: () => void; width?: number }) {
  const [uri, setUri] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [lastTap, setLastTap] = useState(0);
  const [tapTimer, setTapTimer] = useState<ReturnType<typeof setTimeout> | null>(null);
  const burst = useSharedValue(0);
  const burstStyle = useAnimatedStyle(() => ({ opacity: burst.value, transform: [{ scale: 0.6 + burst.value * 0.6 }] }));
  useEffect(() => { mediaUrl('posts', path).then(setUri); }, [path]);
  function press() {
    const now = Date.now();
    if (now - lastTap < 280) {
      if (tapTimer) clearTimeout(tapTimer);
      setTapTimer(null); setLastTap(0);
      burst.value = withSequence(withTiming(1, { duration: 140 }), withTiming(1, { duration: 350 }), withTiming(0, { duration: 220 }));
      onDoubleTap();
      return;
    }
    setLastTap(now);
    setTapTimer(setTimeout(() => setOpen(true), 290));
  }
  return (
    <>
      <Tap haptic={false} scale={0.99} throttle={0} onPress={press} accessibilityLabel={t('افتح الصورة')}
        style={width ? { width, height: 300, backgroundColor: C.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' } : { marginHorizontal: 10, height: 260, borderRadius: 20, backgroundColor: C.primarySoft, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {uri && <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={200} />}
        <Animated.View style={burstStyle} pointerEvents="none"><Heart size={90} color="#fff" fill="#fff" /></Animated.View>
      </Tap>
      <ImageViewer uri={open ? uri : null} onClose={() => setOpen(false)} />
    </>
  );
}

async function openFile(path: string) {
  const uri = await mediaUrl('posts', path);
  if (!uri) { Alert.alert(t('ما قدرنا نفتح الملف')); return; }
  WebBrowser.openBrowserAsync(uri).catch(() => Alert.alert(t('ما قدرنا نفتح الملف')));
}

/** Poll: tap an option to vote, then see the results. One vote per person (poll_votes primary key). */
function Poll({ postId, options }: { postId: string; options: string[] }) {
  const { profile } = useAuth();
  const [counts, setCounts] = useState<number[]>(options.map(() => 0));
  const [mine, setMine] = useState<number | null>(null);
  const load = async () => {
    const { data } = await supabase.from('poll_votes').select('user_id, option_idx').eq('post_id', postId);
    const c = options.map(() => 0); let m: number | null = null;
    (data ?? []).forEach((v) => { if (c[v.option_idx] != null) c[v.option_idx]++; if (v.user_id === profile?.id) m = v.option_idx; });
    setCounts(c); setMine(m);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [postId]);
  async function vote(i: number) {
    if (!profile || mine != null) return;
    setMine(i); setCounts((c) => c.map((n, j) => (j === i ? n + 1 : n)));
    const { error } = await supabase.from('poll_votes').insert({ post_id: postId, user_id: profile.id, option_idx: i });
    if (error) load();
  }
  const total = counts.reduce((a, b) => a + b, 0);
  return (
    <View style={{ marginHorizontal: 14, marginTop: 10, gap: 6 }}>
      {options.map((o, i) => {
        const pct = total ? Math.round((counts[i] / total) * 100) : 0;
        return (
          <Tap key={i} onPress={() => vote(i)} disabled={mine != null} haptic scale={0.98} accessibilityLabel={o}
            style={{ minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: mine === i ? C.violet : C.line, overflow: 'hidden', justifyContent: 'center' }}>
            {mine != null && <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: `${pct}%`, backgroundColor: C.violetSoft }} />}
            <Row gap={8} style={{ paddingHorizontal: 12 }}>
              <T v="bold" style={{ flex: 1, fontSize: 14 }} color={mine === i ? C.violet : C.ink}>{o}</T>
              {mine != null && <T v="bold" style={{ fontSize: 13 }} color={C.ink2}>{pct}%</T>}
            </Row>
          </Tap>
        );
      })}
      <T v="tiny" color={C.muted}>{total} {t('صوت')}{mine == null ? t(' · اكبس على خيار لتصوّت') : ''}</T>
    </View>
  );
}

/** Several photos: swipe between them like Instagram, with dots and a 1/n counter. */
function Photos({ paths, onDoubleTap }: { paths: string[]; onDoubleTap: () => void }) {
  const [w, setW] = useState(0);
  const [i, setI] = useState(0);
  if (paths.length === 1) return <Photo path={paths[0]} onDoubleTap={onDoubleTap} />;
  return (
    <View style={{ marginHorizontal: 10, borderRadius: 20, overflow: 'hidden' }} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {w > 0 && (
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setI(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / w))}>
          {paths.map((p) => <Photo key={p} path={p} onDoubleTap={onDoubleTap} width={w} />)}
        </ScrollView>
      )}
      <View style={{ position: 'absolute', top: 10, right: 10, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <T v="tiny" color="#fff">{i + 1}/{paths.length}</T>
      </View>
      <View style={{ position: 'absolute', bottom: 10, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
        {paths.map((p, k) => <View key={p} style={{ width: k === i ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: k === i ? '#fff' : 'rgba(255,255,255,0.55)' }} />)}
      </View>
    </View>
  );
}

export function PostCard({ post, onLikes, compact, detail }: { post: Post; onLikes?: (p: Post) => void; compact?: boolean; detail?: boolean }) {
  const { profile } = useAuth();
  const [p, setP] = useState(post);
  useEffect(() => setP(post), [post]);
  // a few faces of who liked it (refreshed when the count changes)
  const [likers, setLikers] = useState<{ id: string; full_name: string; avatar_url: string | null }[]>([]);
  useEffect(() => {
    if (!p.like_count) { setLikers([]); return; }
    supabase.from('post_likes').select('p:profiles(id, full_name, avatar_url)').eq('post_id', p.id).order('created_at', { ascending: false }).limit(3)
      .then(({ data }) => setLikers(((data ?? []) as unknown as { p: { id: string; full_name: string; avatar_url: string | null } | null }[]).map((x) => x.p).filter((x): x is NonNullable<typeof x> => !!x)), () => {});
  }, [p.id, p.like_count]);
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const cat = CATEGORY[p.category] ?? CATEGORY.square;
  const images = (p.media ?? []).filter((m) => m.kind === 'image').sort((a, b) => a.position - b.position);
  const files = (p.media ?? []).filter((m) => m.kind === 'file');
  const video = (p.media ?? []).find((m) => m.kind === 'video');

  async function like() {
    if (!profile) return;
    heart.value = withSequence(withTiming(1.45, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 300 }));
    const before = p;
    if (!before.liked) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    await optimistic(`like:${p.id}`,
      () => setP((x) => ({ ...x, liked: !before.liked, like_count: Math.max(0, before.like_count + (before.liked ? -1 : 1)) })),
      () => setP((x) => ({ ...x, liked: before.liked, like_count: before.like_count })),
      () => toggleLike(before, profile.id));
  }
  async function save() {
    if (!profile) return;
    const before = p;
    const ok = await optimistic(`save:${p.id}`, () => setP((x) => ({ ...x, saved: !before.saved })), () => setP((x) => ({ ...x, saved: before.saved })), () => toggleSave(before, profile.id));
    if (ok) toast(before.saved ? t('انشال من المحفوظات') : t('انحفظ'));
  }
  const [gone, setGone] = useState(false);
  const mine = p.author_id === profile?.id;

  /** "⋯" menu like Instagram: save, send, report or delete. */
  function menu() {
    const opts: [string, () => void, ('destructive' | undefined)?][] = [
      [p.saved ? t('إلغاء الحفظ') : t('حفظ'), save],
      [t('أرسل لصديق'), () => router.push({ pathname: '/share', params: { post: p.id } })],
      [t('شوف البروفايل'), () => router.push({ pathname: '/user/[id]', params: { id: p.author_id } })],
      mine
        ? [t('حذف المنشور'), () => Alert.alert(t('حذف المنشور؟'), t('ما بترجع.'), [{ text: t('إلغاء'), style: 'cancel' }, { text: t('حذف'), style: 'destructive', onPress: async () => { const r = await run(supabase.from('posts').delete().eq('id', p.id)); if (r.ok) { setGone(true); toast(t('انحذف المنشور')); if (detail) router.back(); } } }]), 'destructive']
        : [t('إبلاغ'), () => router.push({ pathname: '/report', params: { type: 'post', id: p.id, user: p.author_id } }), 'destructive'],
    ];
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options: [...opts.map((o) => o[0]), t('إلغاء')], cancelButtonIndex: opts.length, destructiveButtonIndex: opts.length - 1 }, (i) => opts[i]?.[1]());
    } else {
      Alert.alert('', undefined, [...opts.map(([text, onPress, style]) => ({ text, onPress, style })), { text: t('إلغاء'), style: 'cancel' as const }]);
    }
  }
  if (gone) return null;

  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 26, overflow: 'hidden' }, shadow]}>
      <Row gap={10} style={{ padding: 14, paddingBottom: 10 }}>
        <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.author_id } })}>
          <Avatar id={p.author_id} name={p.author?.full_name} url={p.author?.avatar_url} size={42} />
        </Tap>
        <View style={{ flex: 1 }}>
          <Row gap={4}>
            <T v="bold" numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>{titledName(p.author?.full_name, p.author?.academic_title, p.author?.title_verified)}</T>
            {p.author?.is_verified && <BadgeCheck size={15} color={C.white} fill={C.primary} />}
            <TitleBadge title={p.author?.academic_title} verified={p.author?.title_verified} />
          </Row>
          <T v="tiny" color={C.muted} style={{ fontFamily: F.body }}>{[nm(p.author?.major), timeAgo(p.created_at)].filter(Boolean).join(' · ')}</T>
        </View>
        {p.lost_found ? <Tag label={p.lost_found === 'lost' ? t('ضاع مني') : t('لقيت')} bg={p.lost_found === 'lost' ? C.orangeSoft : C.greenSoft} fg={p.lost_found === 'lost' ? '#C2410C' : C.greenInk} />
          : <Tag label={cat.label} bg={cat.soft} fg={cat.ink} />}
        <Tap onPress={menu} accessibilityLabel={t('خيارات المنشور')} style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', marginEnd: -6 }}>
          <MoreHorizontal size={20} color={C.muted} />
        </Tap>
      </Row>

      {video && <PostVideo path={video.url} onDoubleTap={() => { if (!p.liked) like(); }} />}
      {images.length > 0 && <Photos paths={images.map((m) => m.url)} onDoubleTap={() => { if (!p.liked) like(); }} />}
      <Tap scale={0.99} haptic={false} disabled={detail} onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 4 }}>
          {p.title ? <T v="h3">{p.title}</T> : null}
          {p.body ? <T v="body" color={C.ink2} numberOfLines={compact ? 3 : 8}>{p.body}</T> : null}
          {p.price_jod != null && <T v="bold" color={C.greenInk}>{p.price_jod} {t('دينار')}</T>}
        </View>
        {p.poll?.options?.length ? <Poll postId={p.id} options={p.poll.options} /> : null}
        {files.map((f) => (
          <Tap key={f.id} haptic={false} scale={0.98} onPress={() => openFile(f.url)} accessibilityLabel={t('افتح {0}', [f.file_name ?? t('الملف')])}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginTop: 10, backgroundColor: C.soft, borderRadius: 14, padding: 10 }}>
            <View style={{ width: 36, height: 40, borderRadius: 8, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' }}><FileText size={18} color="#E11D48" /></View>
            <View style={{ flex: 1 }}>
              <T v="bold" style={{ fontSize: 13 }} numberOfLines={1}>{f.file_name ?? t('ملف')}</T>
              {f.size_bytes ? <T v="tiny" color={C.muted}>{(f.size_bytes / 1048576).toFixed(1)} {t('ميجا · اكبس لتفتحه')}</T> : null}
            </View>
          </Tap>
        ))}
      </Tap>

      <Row gap={2} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
        <Tap onPress={like} accessibilityLabel={t('إعجاب')} accessibilityState={{ selected: !!p.liked }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 14, backgroundColor: p.liked ? C.pinkSoft : 'transparent' }}>
          <Animated.View style={heartStyle}><Heart size={22} color={p.liked ? C.pink : C.ink2} fill={p.liked ? C.pink : 'none'} /></Animated.View>
        </Tap>
        {!p.hide_likes || p.author_id === profile?.id ? (
          <Tap onPress={() => onLikes?.(p)} accessibilityLabel={t('مين عمل لايك')} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <T v="bold" color={C.ink2} style={{ fontSize: 13 }}>{p.like_count}</T>
          </Tap>
        ) : null}
        <Tap onPress={() => { if (!detail) router.push({ pathname: '/post/[id]', params: { id: p.id } }); }} accessibilityLabel={t('التعليقات')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10 }}>
          <MessageCircle size={22} color={C.ink2} /><T v="bold" color={C.ink2} style={{ fontSize: 13 }}>{p.comment_count}</T>
        </Tap>
        <Tap onPress={() => router.push({ pathname: '/share', params: { post: p.id } })} accessibilityLabel={t('أرسل لصديق')} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
          <Send size={21} color={C.ink2} />
        </Tap>
        <View style={{ flex: 1 }} />
        <Tap onPress={save} accessibilityLabel={t('حفظ')} accessibilityState={{ selected: !!p.saved }} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
          <Bookmark size={22} color={p.saved ? C.primary : C.ink2} fill={p.saved ? C.primary : 'none'} />
        </Tap>
      </Row>
      {/* like Instagram: "Liked by sara and 4 others" */}
      {likers.length > 0 && (!p.hide_likes || p.author_id === profile?.id) && (
        <Tap haptic={false} onPress={() => onLikes?.(p)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 }}>
          <View style={{ flexDirection: 'row' }}>
            {likers.slice(0, 3).map((l, i) => (
              <View key={l.id} style={{ marginStart: i ? -7 : 0, borderRadius: 11, borderWidth: 2, borderColor: C.card }}><Avatar id={l.id} name={l.full_name} url={l.avatar_url} size={20} /></View>
            ))}
          </View>
          <T v="tiny" color={C.ink2} style={{ flex: 1 }} numberOfLines={1}>
            {p.like_count > 1 ? t('عجبت {0} و{1} غيره', [likers[0].full_name.split(' ')[0], String(p.like_count - 1)]) : t('عجبت {0}', [likers[0].full_name.split(' ')[0]])}
          </T>
        </Tap>
      )}
    </View>
  );
}
