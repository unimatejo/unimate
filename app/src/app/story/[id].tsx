import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Eye, Heart, Plus, Send, Star, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, TextInput, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeInDown, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { StoryOverlays } from '@/components/StoryOverlays';
import { cleanOverlays } from '@/lib/storyOverlay';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, isDark, SPRING } from '@/lib/theme';
import { Bone } from '@/components/Skeleton';
import { timeAgo } from '@/lib/util';
import { isAR, t, ta, rtlLayout } from '@/lib/i18n';
import { optimistic } from '@/lib/run';
import { toast } from '@/lib/toast';

type S = { id: string; media_url: string; kind: string; caption: string | null; created_at: string; duration_sec: number | null; overlays?: unknown };
type Viewer = { viewer_id: string; liked: boolean; p: { full_name: string; avatar_url: string | null } | null };

function StoryVideo({ uri, onEnd, onReady }: { uri: string; onEnd: () => void; onReady: () => void }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  useEffect(() => {
    const sub = player.addListener('playToEnd', onEnd);
    const st = player.addListener('statusChange', ({ status }) => { if (status === 'readyToPlay' || status === 'error') onReady(); });
    return () => { sub.remove(); st.remove(); };
  }, [player, onEnd, onReady]);
  return <VideoView player={player} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" nativeControls={false} />;
}

/** Instagram-style story viewer: tap sides to move, hold to pause, video plays to the end, your own story shows who viewed it. */
export default function StoryViewer() {
  const { width: W, height: H } = useWindowDimensions();
  const { id, highlight } = useLocalSearchParams<{ id: string; highlight?: string }>(); // author id, optional highlight
  const { profile } = useAuth();
  const mine = profile?.id === id;
  const [author, setAuthor] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [items, setItems] = useState<S[] | null>(null);
  const [i, setI] = useState(0);
  const [ready, setReady] = useState(false);
  const [uri, setUri] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [reply, setReply] = useState('');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [hls, setHls] = useState<{ id: string; title: string }[]>([]);
  const [hlTitle, setHlTitle] = useState('');
  const [hlName, setHlName] = useState<string | null>(null);
  const progress = useSharedValue(0);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));
  // pull down to close, like Instagram: the story follows the finger, shrinks a little and fades
  const ty = useSharedValue(0), vy = useSharedValue(0);
  const sheet = useAnimatedStyle(() => ({
    transform: [{ translateY: Math.max(0, ty.value) }, { scale: interpolate(Math.max(0, ty.value), [0, H], [1, 0.82]) }],
    borderRadius: interpolate(Math.max(0, ty.value), [0, 80], [0, 28]),
    opacity: interpolate(Math.max(0, ty.value), [0, H * 0.7], [1, 0.4]),
  }));

  useEffect(() => {
    supabase.from('profiles').select('full_name, avatar_url').eq('id', id).maybeSingle().then(({ data }) => setAuthor(data));
    if (highlight) {
      supabase.from('highlights').select('title').eq('id', highlight).single().then(({ data }) => setHlName(data?.title ?? null));
      supabase.from('highlight_items').select('added_at, s:stories(id, media_url, kind, caption, created_at, duration_sec, overlays)').eq('highlight_id', highlight).order('added_at')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(({ data }) => { const list = ((data ?? []) as any[]).map((x) => x.s).filter(Boolean) as S[]; setItems(list); if (list.length === 0) close(); });
      return;
    }
    supabase.from('stories').select('id, media_url, kind, caption, created_at, duration_sec, overlays').eq('author_id', id).gt('expires_at', new Date().toISOString()).order('created_at')
      .then(({ data }) => { const list = (data ?? []) as S[]; setItems(list); if (list.length === 0) close(); });
  }, [id, highlight]);

  async function openHighlights() {
    pause();
    const { data } = await supabase.from('highlights').select('id, title').eq('owner_id', profile?.id ?? '').order('position');
    setHls(data ?? []); setHlTitle(''); setHlOpen(true);
  }
  async function addTo(hid: string | null) {
    if (!s) return;
    let target = hid;
    if (!target) {
      if (hlTitle.trim().length < 1) { Alert.alert(t('سمّي الهايلايت')); return; }
      const { data, error } = await supabase.from('highlights').insert({ owner_id: profile?.id ?? '', title: hlTitle.trim().slice(0, 30), cover_url: s.media_url }).select('id').single();
      if (error || !data) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
      target = data.id;
    }
    const { error } = await supabase.from('highlight_items').insert({ highlight_id: target, story_id: s.id });
    setHlOpen(false); resume();
    if (error) Alert.alert(t('ما زبط'), error.message.includes('limit') ? t('وصلت الحد: 30 قصة بالهايلايت.') : error.message.includes('duplicate') ? t('موجودة أصلاً بهالهايلايت.') : t('جرّب كمان مرة.'));
    else Alert.alert(t('انضافت لأبرز القصص ✓'));
  }

  // leave once (never call navigation inside a state updater: it can run twice)
  const closed = useRef(false);
  const close = useCallback(() => { if (closed.current) return; closed.current = true; if (router.canGoBack()) router.back(); else router.replace('/'); }, []);
  const iRef = useRef(0);
  useEffect(() => { iRef.current = i; }, [i]);
  const next = useCallback(() => {
    if (items && iRef.current + 1 >= items.length) { close(); return; }
    setI(iRef.current + 1);
  }, [items, close]);

  const s = items?.[i];

  useEffect(() => {
    if (!s || !profile) return;
    setLiked(false); setUri(null); setReady(false);
    mediaUrl('stories', s.media_url).then(setUri);
    if (!mine) {
      supabase.from('story_views').upsert({ story_id: s.id, viewer_id: profile.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }).then(() => {
        // show the heart as it really is (if you liked it before)
        supabase.from('story_views').select('liked').eq('story_id', s.id).eq('viewer_id', profile.id).maybeSingle().then(({ data }) => setLiked(!!data?.liked));
      });
    }
    else supabase.from('story_views').select('viewer_id, liked, p:profiles!story_views_viewer_id_fkey(full_name, avatar_url)').eq('story_id', s.id)
      .then(({ data }) => setViewers((data ?? []) as unknown as Viewer[]));
  }, [s, profile, mine]);

  // the progress bar starts once the photo/video has actually loaded
  useEffect(() => {
    if (!s || !uri || !ready) return;
    progress.value = 0;
    const ms = s.kind === 'video' ? (s.duration_sec ?? 15) * 1000 : 5000;
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear }, (done) => { if (done && s.kind !== 'video') runOnJS(next)(); });
    return () => cancelAnimation(progress);
  }, [uri, ready, s, next, progress]);

  function pause() { cancelAnimation(progress); }
  const pull = usePanGesture({
    activeOffsetY: 14, failOffsetX: [-24, 24],
    onActivate: () => { 'worklet'; runOnJS(pause)(); },
    onUpdate: (e) => { 'worklet'; ty.value = e.translationY; vy.value = e.velocityY; },
    onDeactivate: () => {
      'worklet';
      if (ty.value > 130 || vy.value > 900) { ty.value = withTiming(H, { duration: 220 }); runOnJS(close)(); }
      else { ty.value = withSpring(0, SPRING); runOnJS(resume)(); }
    },
  });
  function resume() {
    if (!s) return;
    const ms = (s.kind === 'video' ? (s.duration_sec ?? 15) * 1000 : 5000) * (1 - progress.value);
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear }, (done) => { if (done && s.kind !== 'video') runOnJS(next)(); });
  }

  async function like() {
    if (!s || !profile) return;
    const was = liked;
    if (!was) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await optimistic(`story-like-${s.id}`, () => setLiked(!was), () => setLiked(was),
      () => supabase.from('story_views').update({ liked: !was }).eq('story_id', s.id).eq('viewer_id', profile.id));
  }

  const [replying, setReplying] = useState(false);
  async function sendReply() {
    if (!reply.trim() || !s || replying) return;
    const text = reply.trim();
    setReplying(true);
    try {
      const { data: conv, error } = await supabase.rpc('start_direct', { target: id, context: t('رد على ستوري') });
      if (error || !conv) { Alert.alert(t('ما انبعت الرد'), t('هاد الشخص مسكّر الرسائل.')); return; }
      const { error: me } = await supabase.from('messages').insert({ conversation_id: conv, sender_id: profile?.id ?? '', kind: 'story_reply', body: text, ref_id: s.id });
      if (me) { Alert.alert(t('ما انبعت الرد'), t('جرّب مرة ثانية.')); return; }
      setReply(''); toast(t('انبعت ✓'));
    } catch { Alert.alert(t('ما انبعت الرد'), t('تأكد من الإنترنت وجرّب كمان مرة.')); }
    finally { setReplying(false); resume(); }
  }

  function remove() {
    if (!s) return;
    Alert.alert(t('حذف القصة'), t('أكيد بدك تحذفها؟'), [{ text: t('لا'), style: 'cancel' }, {
      text: t('احذف'), style: 'destructive', onPress: async () => {
        await supabase.from('stories').delete().eq('id', s.id);
        const rest = (items ?? []).filter((x) => x.id !== s.id);
        if (rest.length === 0) close(); else { setItems(rest); setI(Math.min(i, rest.length - 1)); }
      },
    }]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
    <GestureDetector gesture={pull}>
    <Animated.View style={[{ flex: 1, overflow: 'hidden', backgroundColor: '#000' }, sheet]}>
      {!uri && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 8 }}><Bone h={H - 16} r={28} style={{ opacity: 0.25 }} /></View>}
      {uri && s?.kind === 'video' ? <StoryVideo key={s.id} uri={uri} onEnd={next} onReady={() => setReady(true)} />
        : uri ? <Image key={uri} source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} onLoad={() => setReady(true)} onError={() => setReady(true)} /> : null}
      <Pressable style={{ position: 'absolute', top: 110, bottom: 130, width: '40%', ...(Platform.OS === 'web' ? (rtlLayout() ? { left: 0 } : { right: 0 }) : { end: 0 }) }} onPress={next} onLongPress={pause} onPressOut={resume} delayLongPress={200} accessibilityLabel={t('التالي')} />
      <Pressable style={{ position: 'absolute', top: 110, bottom: 130, width: '40%', ...(Platform.OS === 'web' ? (rtlLayout() ? { right: 0 } : { left: 0 }) : { start: 0 }) }} onPress={() => setI((x) => Math.max(0, x - 1))} onLongPress={pause} onPressOut={resume} delayLongPress={200} accessibilityLabel={t('السابق')} />
      {s && ready && <StoryOverlays items={cleanOverlays(s.overlays)} width={W} height={H} onOpen={pause} />}
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 12, gap: 12, paddingBottom: 12 }}>
        <Row gap={4} style={{ marginTop: 6 }}>
          {(items ?? []).map((it, k) => (
            <View key={it.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
              {k < i ? <View style={{ flex: 1, backgroundColor: '#FFFFFF' }} /> : k === i ? <Animated.View style={[{ height: 3, backgroundColor: '#FFFFFF' }, bar]} /> : null}
            </View>
          ))}
        </Row>
        <Row gap={10}>
          <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id } })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
            <Avatar id={id} name={author?.full_name} url={author?.avatar_url} size={40} />
            <View style={{ flex: 1 }}>
              <T v="bold" color={C.white}>{hlName ?? (mine ? t('قصتك') : author?.full_name)}</T>
              {s && <T v="tiny" color="#E3E7F5">{timeAgo(s.created_at)}</T>}
            </View>
          </Tap>
          {mine && !highlight && s?.kind === 'image' && <Tap onPress={openHighlights} accessibilityLabel={t('ثبّت بأبرز القصص')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Star size={22} color={C.white} /></Tap>}
          {mine && !highlight && <Tap onPress={remove} accessibilityLabel={t('احذف القصة')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={22} color={C.white} /></Tap>}
          <Tap onPress={close} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={26} color={C.white} /></Tap>
        </Row>
      </SafeAreaView>
      {s?.caption ? (
        <Animated.View entering={FadeInDown} style={{ position: 'absolute', right: 18, left: 18, bottom: 150 }}>
          <T style={{ fontFamily: F.display, fontSize: 24, lineHeight: 36, alignSelf: 'flex-start', backgroundColor: 'rgba(14,20,48,0.55)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' }} color={C.white}>{s.caption}</T>
        </Animated.View>
      ) : null}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : undefined} style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
      <SafeAreaView edges={['bottom']} style={{ padding: 12 }}>
        {mine ? (
          <Tap onPress={() => { pause(); setShowViewers(true); }} style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, paddingHorizontal: 18, borderRadius: 23, backgroundColor: 'rgba(14,20,48,0.55)' }}>
            <Eye size={20} color={C.white} />
            <T v="bold" color={C.white}>{viewers.length} {t('مشاهدة')}</T>
            {viewers.some((v) => v.liked) && <Row gap={4}><Heart size={16} color={C.pink} fill={C.pink} /><T v="bold" color={C.white}>{viewers.filter((v) => v.liked).length}</T></Row>}
          </Tap>
        ) : (
          <Row gap={8}>
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={reply} onChangeText={setReply} onSubmitEditing={sendReply} onFocus={pause} onBlur={resume} placeholder={t('رد بالخاص...')} placeholderTextColor="#D5DAEA"
              style={{ flex: 1, minHeight: 48, borderRadius: 24, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(14,20,48,0.35)', paddingHorizontal: 16, fontFamily: F.body, fontSize: 14, color: C.white, textAlign: ta }} accessibilityLabel={t('رد على الستوري')} />
            <Tap onPress={like} accessibilityLabel={t('إعجاب')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Heart size={28} color={liked ? C.pink : C.white} fill={liked ? C.pink : 'none'} /></Tap>
            <Tap onPress={sendReply} accessibilityLabel={t('إرسال')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Send size={26} color={C.white} style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} /></Tap>
          </Row>
        )}
      </SafeAreaView>
      </KeyboardAvoidingView>
    </Animated.View>
    </GestureDetector>

      <Modal visible={hlOpen} transparent animationType="slide" onRequestClose={() => { setHlOpen(false); resume(); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => { setHlOpen(false); resume(); }} />
        <View style={{ backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40 }}>
          <T v="h3">{t('ثبّت بأبرز القصص')}</T>
          {hls.map((h) => (
            <Tap key={h.id} onPress={() => addTo(h.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 50, paddingHorizontal: 12, borderRadius: 16, backgroundColor: C.soft }}>
              <Star size={18} color={C.orange} fill={C.orange} /><T v="bodyMd">{h.title}</T>
            </Tap>
          ))}
          <Row gap={8}>
            <TextInput value={hlTitle} onChangeText={setHlTitle} maxLength={30} placeholder={t('اسم جديد، مثلاً «سنة أولى»')} placeholderTextColor={C.faint} keyboardAppearance={isDark ? 'dark' : 'light'}
              style={{ flex: 1, minHeight: 48, borderRadius: 16, backgroundColor: C.field, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
            <Tap onPress={() => addTo(null)} accessibilityLabel={t('هايلايت جديد')} style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Plus size={22} color={C.onPrimary} /></Tap>
          </Row>
        </View>
      </Modal>

      <Modal visible={showViewers} transparent animationType="slide" onRequestClose={() => { setShowViewers(false); resume(); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => { setShowViewers(false); resume(); }} />
        <Animated.View entering={FadeIn} style={{ backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, maxHeight: '60%', gap: 12 }}>
          <T v="h3">{t('مين شاف قصتك')}</T>
          <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 30 }}>
            {viewers.length === 0 ? <T v="small" color={C.muted}>{t('ما حدا شافها لهلأ.')}</T> : viewers.map((v) => (
              <Row key={v.viewer_id} gap={12}>
                <Avatar id={v.viewer_id} name={v.p?.full_name} url={v.p?.avatar_url} size={42} />
                <T v="bodyMd" style={{ flex: 1 }}>{v.p?.full_name}</T>
                {v.liked && <Heart size={18} color={C.pink} fill={C.pink} />}
              </Row>
            ))}
          </ScrollView>
        </Animated.View>
      </Modal>
    </View>
  );
}
