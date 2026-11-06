import { router, useLocalSearchParams } from 'expo-router';
import { Plus, Star, Trash2, VolumeX, X } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { GestureDetector, usePanGesture } from 'react-native-gesture-handler';
import Animated, { Easing, FadeIn, FadeInDown, FadeOut, cancelAnimation, interpolate, runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { StoryStickersLayer } from '@/components/story/StoryStickersLayer';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, isDark, SPRING } from '@/lib/theme';
import { Bone } from '@/components/ui/Skeleton';
import { timeAgo } from '@/lib/util';
import { t, ta, rtlLayout } from '@/lib/i18n';
import { ActivityChip, StoryActivitySheet, type StoryViewer } from '@/components/story/StoryActivity';
import { EmojiBurst, StoryReplyBar, type ReplyBarHandle } from '@/components/story/StoryReplyBar';
import { optimistic } from '@/lib/run';
import { toast } from '@/lib/toast';
import { FramedMedia } from '@/components/media/FramedMedia';
import type { MediaMeta } from '@/lib/cropper';

type S = { id: string; media_url: string; kind: string; caption: string | null; created_at: string; duration_sec: number | null; overlays?: unknown; meta?: MediaMeta | null };
type Viewer = StoryViewer;

/** a story video, framed and trimmed the way it was set in the crop editor; plays once with sound */
function StoryVideo({ uri, meta, muted, onEnd, onReady, onError, onSoundBlocked }: { uri: string; meta?: MediaMeta | null; muted: boolean; onEnd: () => void; onReady: () => void; onError: () => void; onSoundBlocked: () => void }) {
  return <FramedMedia uri={uri} kind="video" meta={meta} video={{ loop: false, muted, onEnd, onReady, onError, onSoundBlocked }} />;
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
  const [viewers, setViewers] = useState<Viewer[]>([]);
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
      supabase.from('highlight_items').select('added_at, s:stories(id, media_url, kind, caption, created_at, duration_sec, overlays, meta)').eq('highlight_id', highlight).order('added_at')
         
        .then(({ data }) => { const list = ((data ?? []) as any[]).map((x) => x.s).filter(Boolean) as S[]; setItems(list); if (list.length === 0) close(); });
      return;
    }
    supabase.from('stories').select('id, media_url, kind, caption, created_at, duration_sec, overlays, meta').eq('author_id', id).gt('expires_at', new Date().toISOString()).order('created_at')
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
  const markReady = useCallback(() => setReady(true), []);
  // a video that can't be played (too heavy for this phone, or a slow connection) never leaves the viewer stuck
  const [failed, setFailed] = useState(false);
  // story videos play with sound; a phone browser may need one tap first
  const [muted, setMuted] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const markFailed = useCallback(() => { setFailed(true); setReady(true); }, []);
  const afterVideo = useCallback((sid: string) => {
    setTimeout(() => { if (items?.[iRef.current]?.id === sid) next(); }, 2000); // its own end usually comes first
  }, [items, next]);
  const frozen = useRef(false); // the activity sheet is open: don't run the timer

  useEffect(() => {
    if (!s || !profile) return;
    setLiked(false); setUri(null); setReady(false); setFailed(false);
    mediaUrl('stories', s.media_url).then(setUri);
    if (!mine) {
      supabase.from('story_views').upsert({ story_id: s.id, viewer_id: profile.id }, { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }).then(() => {
        // show the heart as it really is (if you liked it before)
        supabase.from('story_views').select('liked').eq('story_id', s.id).eq('viewer_id', profile.id).maybeSingle().then(({ data }) => setLiked(!!data?.liked));
      });
    }
    else supabase.from('story_views').select('viewer_id, liked, viewed_at, p:profiles!story_views_viewer_id_fkey(full_name, avatar_url)').eq('story_id', s.id).order('viewed_at', { ascending: false })
      .then(({ data }) => setViewers((data ?? []) as unknown as Viewer[]));
  }, [s, profile, mine]);

  useEffect(() => {
    if (!s || s.kind !== 'video' || !uri || ready) return;
    const tm = setTimeout(markFailed, 12000);
    return () => clearTimeout(tm);
  }, [s, uri, ready, markFailed]);
  const storyMs = (x: S) => (x.kind === 'video' && !failed ? (x.duration_sec ?? 15) * 1000 : failed ? 4000 : 5000);

  // the progress bar starts once the photo/video has actually loaded
  useEffect(() => {
    if (!s || !uri || !ready) return;
    progress.value = 0;
    if (frozen.current) return;
    const timed = s.kind !== 'video' || failed;
    progress.value = withTiming(1, { duration: storyMs(s), easing: Easing.linear }, (done) => { if (done) runOnJS(timed ? next : afterVideo)(s.id); });
    return () => cancelAnimation(progress);
  }, [uri, ready, s, next, progress, failed]);

  function pause() { cancelAnimation(progress); }
  // the story stays still while you hold it, type a reply or look at its activity
  const held = useRef(false);
  const [hold, setHold] = useState(false);
  const [typing, setTyping] = useState(false);
  const [activity, setActivity] = useState(false);
  const canActivity = mine && !highlight;
  function openActivity() { frozen.current = true; pause(); setActivity(true); }
  function closeActivity() { frozen.current = false; setActivity(false); resume(); }
  function onHold() { held.current = true; setHold(true); pause(); }
  function onRelease() { if (!held.current) return; held.current = false; setHold(false); resume(); }
  /** going back on the first story starts it again, like Instagram */
  function prev() {
    if (iRef.current > 0) { setI(iRef.current - 1); return; }
    if (!s) return;
    cancelAnimation(progress); progress.value = 0;
    if (s.kind !== 'video') progress.value = withTiming(1, { duration: 5000, easing: Easing.linear }, (done) => { if (done) runOnJS(next)(); });
  }
  const pull = usePanGesture({
    activeOffsetY: 14, failOffsetX: [-24, 24],
    onActivate: () => { 'worklet'; runOnJS(pause)(); },
    onUpdate: (e) => { 'worklet'; ty.value = e.translationY; vy.value = e.velocityY; },
    onDeactivate: () => {
      'worklet';
      if (ty.value > 130 || vy.value > 900) { ty.value = withTiming(H, { duration: 220 }); runOnJS(close)(); }
      else if (canActivity && (ty.value < -70 || vy.value < -800)) { ty.value = withTiming(0, { duration: 180 }); runOnJS(openActivity)(); }
      else { ty.value = withSpring(0, SPRING); runOnJS(resume)(); }
    },
  });
  function resume() {
    if (!s) return;
    const timed = s.kind !== 'video' || failed;
    progress.value = withTiming(1, { duration: storyMs(s) * (1 - progress.value), easing: Easing.linear }, (done) => { if (done) runOnJS(timed ? next : afterVideo)(s.id); });
  }

  async function like() {
    if (!s || !profile) return;
    const was = liked;
    if (!was) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    await optimistic(`story-like-${s.id}`, () => setLiked(!was), () => setLiked(was),
      () => supabase.from('story_views').update({ liked: !was }).eq('story_id', s.id).eq('viewer_id', profile.id));
  }

  const [replying, setReplying] = useState(false);
  const [burst, setBurst] = useState<{ key: number; emoji: string } | null>(null);
  const bar2 = useRef<ReplyBarHandle>(null);
  /** a reply (or a quick reaction) goes to the author's DMs as a story reply */
  async function sendReply(text: string): Promise<boolean> {
    if (!text || !s || replying) return false;
    setReplying(true);
    try {
      const { data: conv, error } = await supabase.rpc('start_direct', { target: id, context: t('رد على ستوري') });
      if (error || !conv) { Alert.alert(t('ما انبعت الرد'), t('هاد الشخص مسكّر الرسائل.')); return false; }
      const { error: me } = await supabase.from('messages').insert({ conversation_id: conv, sender_id: profile?.id ?? '', kind: 'story_reply', body: text, ref_id: s.id });
      if (me) { Alert.alert(t('ما انبعت الرد'), t('جرّب مرة ثانية.')); return false; }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(t('انبعتت'));
      return true;
    } catch { Alert.alert(t('ما انبعت الرد'), t('تأكد من الإنترنت وجرّب كمان مرة.')); return false; }
    finally { setReplying(false); }
  }
  function react(emoji: string) {
    setBurst({ key: Date.now(), emoji });
    sendReply(emoji);
  }
  function onTyping(v: boolean) { setTyping(v); if (v) pause(); else resume(); }

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
      {uri && s?.kind === 'video' ? <StoryVideo key={s.id} uri={uri} meta={s.meta} muted={muted} onEnd={next} onReady={markReady} onError={markFailed} onSoundBlocked={() => { setSoundBlocked(true); setMuted(true); }} />
        : uri ? <FramedMedia key={uri} uri={uri} kind="image" meta={s?.meta} onImageLoad={markReady} /> : null}
      <Pressable style={{ position: 'absolute', top: 110, bottom: 130, width: '40%', ...(Platform.OS === 'web' ? (rtlLayout() ? { left: 0 } : { right: 0 }) : { end: 0 }) }} onPress={next} onLongPress={onHold} onPressOut={onRelease} delayLongPress={200} accessibilityLabel={t('التالي')} />
      <Pressable style={{ position: 'absolute', top: 110, bottom: 130, width: '40%', ...(Platform.OS === 'web' ? (rtlLayout() ? { right: 0 } : { left: 0 }) : { start: 0 }) }} onPress={prev} onLongPress={onHold} onPressOut={onRelease} delayLongPress={200} accessibilityLabel={t('السابق')} />
      {failed && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ paddingHorizontal: 18, paddingVertical: 10, borderRadius: 18, backgroundColor: 'rgba(0,0,0,0.6)' }}>
            <T v="bold" color="#fff">{t('ما قدرنا نشغّل هالفيديو')}</T>
          </View>
        </View>
      )}
      {s?.kind === 'video' && (soundBlocked || muted) && (
        <Tap onPress={() => { setSoundBlocked(false); setMuted(false); }} accessibilityLabel={t('شغّل الصوت')}
          style={{ position: 'absolute', bottom: 150, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.6)' }}>
          <VolumeX size={18} color="#fff" /><T v="bold" color="#fff">{t('اكبس للصوت')}</T>
        </Tap>
      )}
      {s && ready && <StoryStickersLayer story={s} mine={mine} width={W} height={H} onPause={pause} onResume={resume} />}
      <SafeAreaView edges={['top']} pointerEvents={hold ? 'none' : 'box-none'} style={{ paddingHorizontal: 12, gap: 12, paddingBottom: 12, opacity: hold ? 0 : 1 }}>
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
      {/* typing a reply dims the story, like Instagram */}
      {typing && (
        <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(150)} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.45)' }}>
          <Pressable style={{ flex: 1 }} onPress={() => bar2.current?.blur()} accessibilityLabel={t('إغلاق الكيبورد')} />
        </Animated.View>
      )}
      {burst && <EmojiBurst key={burst.key} emoji={burst.emoji} onDone={() => setBurst(null)} />}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} pointerEvents="box-none" style={{ position: 'absolute', bottom: 0, left: 0, right: 0, opacity: hold ? 0 : 1 }}>
      <SafeAreaView edges={['bottom']} style={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 }}>
        {mine ? (
          canActivity ? <ActivityChip viewers={viewers} onOpen={openActivity} /> : null
        ) : (
          s?.meta?.noReplies ? null : <StoryReplyBar ref={bar2} liked={liked} busy={replying} onLike={like} onSend={sendReply} onReact={react} onFocusChange={onTyping} />
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

      <StoryActivitySheet open={activity} onClose={closeActivity} stories={items ?? []} index={i} me={profile?.id}
        onPick={(k) => { if (k !== i) setI(k); }} />
    </View>
  );
}
