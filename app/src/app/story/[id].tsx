import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Heart, Send, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Animated, { Easing, cancelAnimation, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { timeAgo } from '@/lib/util';

type S = { id: string; media_url: string; kind: string; caption: string | null; created_at: string };

export default function StoryViewer() {
  const { id } = useLocalSearchParams<{ id: string }>(); // author id
  const { profile } = useAuth();
  const [author, setAuthor] = useState<{ full_name: string; avatar_url: string | null } | null>(null);
  const [items, setItems] = useState<S[]>([]);
  const [i, setI] = useState(0);
  const [uri, setUri] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [reply, setReply] = useState('');
  const progress = useSharedValue(0);
  const bar = useAnimatedStyle(() => ({ width: `${progress.value * 100}%` }));

  useEffect(() => {
    supabase.from('profiles').select('full_name, avatar_url').eq('id', id).single().then(({ data }) => setAuthor(data));
    supabase.from('stories').select('id, media_url, kind, caption, created_at').eq('author_id', id).gt('expires_at', new Date().toISOString()).order('created_at')
      .then(({ data }) => setItems((data ?? []) as S[]));
  }, [id]);

  const next = useCallback(() => {
    setI((x) => { if (x + 1 >= items.length) { router.back(); return x; } return x + 1; });
  }, [items.length]);

  useEffect(() => {
    const s = items[i]; if (!s || !profile) return;
    setLiked(false);
    mediaUrl('stories', s.media_url).then(setUri);
    supabase.from('story_views').upsert({ story_id: s.id, viewer_id: (profile?.id ?? '') }, { onConflict: 'story_id,viewer_id' });
    progress.value = 0;
    progress.value = withTiming(1, { duration: 5000, easing: Easing.linear }, (done) => { if (done) runOnJS(next)(); });
    return () => cancelAnimation(progress);
  }, [i, items, profile, next, progress]);

  async function like() {
    const s = items[i]; if (!s || !profile) return;
    setLiked(!liked);
    await supabase.from('story_views').update({ liked: !liked }).eq('story_id', s.id).eq('viewer_id', (profile?.id ?? ''));
  }

  async function sendReply() {
    const s = items[i]; if (!reply.trim() || !s) return;
    const { data: conv } = await supabase.rpc('start_direct', { target: id, context: 'رد على ستوري' });
    if (conv) await supabase.from('messages').insert({ conversation_id: conv, sender_id: (profile?.id ?? ''), kind: 'story_reply', body: reply.trim(), ref_id: s.id });
    setReply('');
  }

  const s = items[i];
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {uri && <Image source={{ uri }} style={{ position: 'absolute', inset: 0 }} contentFit="cover" transition={200} />}
      <Pressable style={{ position: 'absolute', top: 120, bottom: 140, left: 0, width: '35%' }} onPress={next} accessibilityLabel="التالي" />
      <Pressable style={{ position: 'absolute', top: 120, bottom: 140, right: 0, width: '35%' }} onPress={() => setI((x) => Math.max(0, x - 1))} accessibilityLabel="السابق" />
      <SafeAreaView edges={['top']} style={{ paddingHorizontal: 12, gap: 12, backgroundColor: 'rgba(14,20,48,0.35)', paddingBottom: 12 }}>
        <Row gap={4} style={{ marginTop: 6 }}>
          {items.map((it, k) => (
            <View key={it.id} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' }}>
              {k < i ? <View style={{ flex: 1, backgroundColor: C.white }} /> : k === i ? <Animated.View style={[{ height: 3, backgroundColor: C.white }, bar]} /> : null}
            </View>
          ))}
        </Row>
        <Row gap={10}>
          <Avatar id={id} name={author?.full_name} url={author?.avatar_url} size={40} />
          <View style={{ flex: 1 }}>
            <T v="bold" color={C.white}>{author?.full_name}</T>
            {s && <T v="tiny" color="#E3E7F5">{timeAgo(s.created_at)}</T>}
          </View>
          <Tap onPress={() => router.back()} accessibilityLabel="إغلاق" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={26} color={C.white} /></Tap>
        </Row>
      </SafeAreaView>
      {s?.caption ? (
        <View style={{ position: 'absolute', right: 18, left: 18, bottom: 150 }}>
          <T style={{ fontFamily: F.display, fontSize: 24, lineHeight: 36, alignSelf: 'flex-start', backgroundColor: 'rgba(14,20,48,0.55)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, overflow: 'hidden' }} color={C.white}>{s.caption}</T>
        </View>
      ) : null}
      <SafeAreaView edges={['bottom']} style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 }}>
        {id !== profile?.id && (
          <Row gap={8}>
            <TextInput value={reply} onChangeText={setReply} onSubmitEditing={sendReply} placeholder="رد بالخاص..." placeholderTextColor="#D5DAEA"
              style={{ flex: 1, minHeight: 48, borderRadius: 18, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', backgroundColor: 'rgba(14,20,48,0.35)', paddingHorizontal: 16, fontFamily: F.body, fontSize: 14, color: C.white, textAlign: 'right' }} accessibilityLabel="رد على الستوري" />
            <Tap onPress={like} accessibilityLabel="إعجاب" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Heart size={28} color={liked ? C.pink : C.white} fill={liked ? C.pink : 'none'} /></Tap>
            <Tap onPress={sendReply} accessibilityLabel="إرسال" style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}><Send size={26} color={C.white} style={{ transform: [{ scaleX: -1 }] }} /></Tap>
          </Row>
        )}
      </SafeAreaView>
    </View>
  );
}
