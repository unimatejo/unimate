import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Eye, Heart, Send, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeInDown, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { isAR, t, ta } from '@/lib/i18n';

type S = { id: string; media_url: string; kind: string; caption: string | null; created_at: string; duration_sec: number | null };
type Viewer = { viewer_id: string; liked: boolean; p: { full_name: string; avatar_url: string | null } | null };

function StoryVideo({ uri, onEnd }: { uri: string; onEnd: () => void }) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  useEffect(() => {
    const sub = player.addListener('playToEnd', onEnd);
    return () => sub.remove();
  }, [player, onEnd]);
  return <VideoView player={player} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" nativeControls={false} />;
}

/** Instagram-style story viewer: tap sides to move, hold to pause, video plays to the end, your own story shows who viewed it. */
export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>(); // author id
  const { profile } = useAuth();
  const mine = profile?.id === id;
  const [author, setAuthor] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [items, setItems] = useState<S[] | null>(null);
  const [i, setI] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [reply, setReply] = useState('');
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [showViewers, setShowViewers] = useState(false);
  const progress = useSharedValue(0);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  useEffect(() => {
    supabase.from('profiles').select('full_name, avatar_url').eq('id', id).single().then(({ data }) => setAuthor(data));
    supabase.from('stories').select('id, media_url, kind, caption, created_at, duration_sec').eq('author_id', id).gt('expires_at', new Date().toISOString()).order('created_at')
      .then(({ data }) => { const list = (data ?? []) as S[]; setItems(list); if (list.length === 0) router.back(); });
  }, [id]);

  const next = useCallback(() => {
    setI((x) => { if (items && x + 1 >= items.length) { router.back(); return x; } return x + 1; });
  }, [items]);

  const s = items?.[i];

  useEffect(() => {
    if (!s || !profile) return;
    setLiked(false); setUri(null);
    mediaUrl('stories', s.media_url).then(setUri);
    if (!mine) supabase.from('story_views').upsert({ story_id: s.id, viewer_id: profile.id }, { onConflict: 'story_id,viewer_id' }).then(() => {});
    else supabase.from('story_views').select('viewer_id, liked, p:profiles!story_views_viewer_id_fkey(full_name, avatar_url)').eq('story_id', s.id)
      .then(({ data }) => setViewers((data ?? []) as unknown as Viewer[]));
  }, [s, profile, mine]);

  // the progress bar starts once the photo/video is loaded
  useEffect(() => {
    if (!s || !uri) return;
    progress.value = 0;
    const ms = s.kind === 'video' ? (s.duration_sec ?? 15) * 1000 : 5000;
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear }, (done) => { if (done && s.kind !== 'video') runOnJS(next)(); });
    return () => cancelAnimation(progress);
  }, [uri, s, next, progress]);

  function pause() { cancelAnimation(progress); }
  function resume() {
    if (!s) return;
    const ms = (s.kind === 'video' ? (s.duration_sec ?? 15) * 1000 : 5000) * (1 - progress.value);
    progress.value = withTiming(1, { duration: ms, easing: Easing.linear }, (done) => { if (done && s.kind !== 'video') runOnJS(next)(); });
  }

  async function like() {
    if (!s || !profile) return;
    setLiked(!liked);
    await supabase.from('story_views').update({ liked: !liked }).eq('story_id', s.id).eq('viewer_id', profile.id);
  }

  async function sendReply() {
    if (!reply.trim() || !s) return;
    const text = reply.trim(); setReply('');
    const { data: conv, error } = await supabase.rpc('start_direct', { target: id, context: t('رد على ستوري') });
    if (error || !conv) { Alert.alert(t('ما انبعت الرد'), t('هاد الشخص مسكّر الرسائل.')); return; }
    await supabase.from('messages').insert({ conversation_id: conv, sender_id: profile?.id ?? '', kind: 'story_reply', body: text, ref_id: s.id });
    Alert.alert(t('انبعت ✓'));
  }

  function remove() {
    if (!s) return;
    Alert.alert(t('حذف القصة'), t('أكيد بدك تحذفها؟'), [{ text: t('لا'), style: 'cancel' }, {
      text: t('احذف'), style: 'destructive', onPress: async () => {
        await supabase.from('stories').delete().eq('id', s.id);
        const rest = (items ?? []).filter((x) => x.id !== s.id);
        if (rest.length === 0) router.back(); else { setItems(rest); setI(Math.min(i, rest.length - 1)); }
      },
    }]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {!uri && <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.white} size="large" /></View>}
      {uri && s?.kind === 'video' ? <StoryVideo key={s.id} uri={uri} onEnd={next} />
        : uri ? <Image source={{ uri }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" transition={150} /> : null}
      <Pressable style={{ position: 'absolute', top: 110, bottom: 130, left: 0, width: '40%' }} onPress={next} onLongPress={pause} onPressOut={resume} delayLongPress={200} accessibilityLabel={t('التالي')} />
      <Pressable style={{ position: 'absolute', top: 110, bottom: 130, right: 0, width: '40%' }} onPress={() => setI((x) => Math.max(0, x - 1))} onLongPress={pause} onPressOut={resume} delayLongPress={200} accessibilityLabel={t('السابق')} />
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
              <T v="bold" color={C.white}>{mine ? t('قصتك') : author?.full_name}</T>
              {s && <T v="tiny" color="#E3E7F5">{timeAgo(s.created_at)}</T>}
            </View>
          </Tap>
          {mine && <Tap onPress={remove} accessibilityLabel={t('احذف القصة')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Trash2 size={22} color={C.white} /></Tap>}
          <Tap onPress={() => router.back()} accessibilityLabel={t('إغلاق')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={26} color={C.white} /></Tap>
        </Row>
      </SafeAreaView>
      {s?.caption ? (
        <Animated.View entering={FadeInDown} style={{ position: 'absolute', right: 18, left: 18, bottom: 150 }}>
          <T style={{ fontFamily: F.display, fontSize: 24, lineHeight: 36, alignSelf: 'flex-start', backgroundColor: 'rgba(14,20,48,0.55)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' }} color={C.white}>{s.caption}</T>
        </Animated.View>
      ) : null}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 }}>
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
