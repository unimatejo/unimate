import { router } from 'expo-router';
import { BadgeCheck, Bookmark, FileText, Heart, MessageCircle, Send } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Alert, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Image } from 'expo-image';

import { ImageViewer } from './ImageViewer';
import { Avatar, Row, T, Tag, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { toggleLike, toggleSave } from '@/lib/posts';
import { mediaUrl, supabase } from '@/lib/supabase';
import { CATEGORY, C, shadow } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { timeAgo } from '@/lib/util';

/** Post photo: one tap opens it full screen, double tap likes (like Instagram). */
function Photo({ path, onDoubleTap }: { path: string; onDoubleTap: () => void }) {
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
      <Tap haptic={false} scale={0.99} throttle={0} onPress={press} accessibilityLabel="افتح الصورة"
        style={{ marginHorizontal: 10, height: 260, borderRadius: 20, backgroundColor: '#DDE4FF', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {uri && <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={200} />}
        <Animated.View style={burstStyle} pointerEvents="none"><Heart size={90} color="#fff" fill="#fff" /></Animated.View>
      </Tap>
      <ImageViewer uri={open ? uri : null} onClose={() => setOpen(false)} />
    </>
  );
}

async function openFile(path: string) {
  const uri = await mediaUrl('posts', path);
  if (!uri) { Alert.alert('ما قدرنا نفتح الملف'); return; }
  WebBrowser.openBrowserAsync(uri).catch(() => Alert.alert('ما قدرنا نفتح الملف'));
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
      <T v="tiny" color={C.muted}>{total} صوت{mine == null ? ' · اكبس على خيار لتصوّت' : ''}</T>
    </View>
  );
}

export function PostCard({ post, onLikes, compact, detail }: { post: Post; onLikes?: (p: Post) => void; compact?: boolean; detail?: boolean }) {
  const { profile } = useAuth();
  const [p, setP] = useState(post);
  useEffect(() => setP(post), [post]);
  const heart = useSharedValue(1);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heart.value }] }));
  const cat = CATEGORY[p.category] ?? CATEGORY.square;
  const images = (p.media ?? []).filter((m) => m.kind === 'image').sort((a, b) => a.position - b.position);
  const files = (p.media ?? []).filter((m) => m.kind === 'file');

  async function like() {
    if (!profile) return;
    heart.value = withSequence(withTiming(1.45, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 300 }));
    const next = { ...p, liked: !p.liked, like_count: p.like_count + (p.liked ? -1 : 1) };
    setP(next);
    await toggleLike(p, (profile?.id ?? ''));
  }
  async function save() {
    if (!profile) return;
    setP({ ...p, saved: !p.saved });
    await toggleSave(p, (profile?.id ?? ''));
  }

  return (
    <View style={[{ backgroundColor: C.card, borderRadius: 26, overflow: 'hidden' }, shadow]}>
      <Row gap={10} style={{ padding: 14, paddingBottom: 10 }}>
        <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: p.author_id } })}>
          <Avatar id={p.author_id} name={p.author?.full_name} url={p.author?.avatar_url} size={42} />
        </Tap>
        <View style={{ flex: 1 }}>
          <Row gap={4}>
            <T v="bold" numberOfLines={1} style={{ fontSize: 14, flexShrink: 1 }}>{p.author?.full_name}</T>
            {p.author?.is_verified && <BadgeCheck size={15} color={C.white} fill={C.primary} />}
          </Row>
          <T v="tiny" color={C.muted} style={{ fontFamily: 'Rubik_400Regular' }}>{[p.author?.major?.name_ar, timeAgo(p.created_at)].filter(Boolean).join(' · ')}</T>
        </View>
        {p.lost_found ? <Tag label={p.lost_found === 'lost' ? 'ضاع مني' : 'لقيت'} bg={p.lost_found === 'lost' ? '#FFE6D5' : C.greenSoft} fg={p.lost_found === 'lost' ? '#C2410C' : C.greenInk} />
          : <Tag label={cat.label} bg={cat.soft} fg={cat.ink} />}
      </Row>

      {images[0] && <Photo path={images[0].url} onDoubleTap={() => { if (!p.liked) like(); }} />}
      <Tap scale={0.99} haptic={false} disabled={detail} onPress={() => router.push({ pathname: '/post/[id]', params: { id: p.id } })}>
        <View style={{ paddingHorizontal: 16, paddingTop: 10, gap: 4 }}>
          {p.title ? <T v="h3">{p.title}</T> : null}
          {p.body ? <T v="body" color={C.ink2} numberOfLines={compact ? 3 : 8}>{p.body}</T> : null}
          {p.price_jod != null && <T v="bold" color={C.greenInk}>{p.price_jod} دينار</T>}
        </View>
        {p.poll?.options?.length ? <Poll postId={p.id} options={p.poll.options} /> : null}
        {files.map((f) => (
          <Tap key={f.id} haptic={false} scale={0.98} onPress={() => openFile(f.url)} accessibilityLabel={`افتح ${f.file_name ?? 'الملف'}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 14, marginTop: 10, backgroundColor: '#F6F8FC', borderRadius: 14, padding: 10 }}>
            <View style={{ width: 36, height: 40, borderRadius: 8, backgroundColor: '#FDE7EA', alignItems: 'center', justifyContent: 'center' }}><FileText size={18} color="#E11D48" /></View>
            <View style={{ flex: 1 }}>
              <T v="bold" style={{ fontSize: 13 }} numberOfLines={1}>{f.file_name ?? 'ملف'}</T>
              {f.size_bytes ? <T v="tiny" color={C.muted}>{(f.size_bytes / 1048576).toFixed(1)} ميجا · اكبس لتفتحه</T> : null}
            </View>
          </Tap>
        ))}
      </Tap>

      <Row gap={2} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
        <Tap onPress={like} accessibilityLabel="إعجاب" accessibilityState={{ selected: !!p.liked }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10, borderRadius: 14, backgroundColor: p.liked ? '#FFEEF1' : 'transparent' }}>
          <Animated.View style={heartStyle}><Heart size={22} color={p.liked ? C.pink : C.ink2} fill={p.liked ? C.pink : 'none'} /></Animated.View>
        </Tap>
        {!p.hide_likes || p.author_id === profile?.id ? (
          <Tap onPress={() => onLikes?.(p)} accessibilityLabel="مين عمل لايك" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}>
            <T v="bold" color={C.ink2} style={{ fontSize: 13 }}>{p.like_count}</T>
          </Tap>
        ) : null}
        <Tap onPress={() => { if (!detail) router.push({ pathname: '/post/[id]', params: { id: p.id } }); }} accessibilityLabel="التعليقات"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10 }}>
          <MessageCircle size={22} color={C.ink2} /><T v="bold" color={C.ink2} style={{ fontSize: 13 }}>{p.comment_count}</T>
        </Tap>
        <Tap onPress={() => router.push({ pathname: '/share', params: { post: p.id } })} accessibilityLabel="أرسل لصديق" style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
          <Send size={21} color={C.ink2} />
        </Tap>
        <View style={{ flex: 1 }} />
        <Tap onPress={save} accessibilityLabel="حفظ" accessibilityState={{ selected: !!p.saved }} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}>
          <Bookmark size={22} color={p.saved ? C.primary : C.ink2} fill={p.saved ? C.primary : 'none'} />
        </Tap>
      </Row>
    </View>
  );
}
