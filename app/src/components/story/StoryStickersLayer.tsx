import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Placed } from '../StoryOverlays';
import { Avatar } from '../ui';
import { DrawLayer, StickerBody, type Live } from './StickerBody';
import { cleanOverlays, type Overlay } from '@/lib/storyOverlay';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { F } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Results = {
  polls?: Record<string, { counts: number[]; mine: number | null }>;
  sliders?: Record<string, { avg: number; count: number; mine: number | null }>;
  countdowns?: Record<string, { count: number; mine: boolean }>;
  questions?: Record<string, { count: number; answers?: { id: string; body: string; name: string; username: string | null; avatar_url: string | null; user_id: string }[] | null }>;
  author?: boolean;
};

const tick = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

/**
 * Everything placed on a story, in the viewer: drawings, text, and stickers you can use —
 * vote in a poll, answer a question, drag the emoji slider, ask to be reminded, open a mention / link / place.
 */
export function StoryStickersLayer({ story, mine, width, height, onPause, onResume }: {
  story: { id: string; overlays?: unknown } | null | undefined; mine: boolean; width: number; height: number; onPause: () => void; onResume: () => void;
}) {
  const insets = useSafeAreaInsets();
  const items = cleanOverlays(story?.overlays);
  const [res, setRes] = useState<Results>({});
  const [ask, setAsk] = useState<Overlay | null>(null);
  const [answer, setAnswer] = useState('');
  const [answers, setAnswers] = useState<Overlay | null>(null);
  const hasLive = items.some((o) => ['poll', 'question', 'slider', 'countdown'].includes(o.kind));
  const sid = story?.id;

  const load = useCallback(async () => {
    if (!sid || !hasLive) return;
    const { data } = await supabase.rpc('story_sticker_results', { p_story: sid });
    setRes((data ?? {}) as Results);
  }, [sid, hasLive]);
  useEffect(() => { setRes({}); load(); }, [load]);

  if (!story || !width || !items.length) return null;

  async function vote(o: Overlay, i: number) {
    tick();
    setRes((r) => {
      const cur = r.polls?.[o.id] ?? { counts: [0, 0, 0, 0], mine: null };
      const counts = [...cur.counts]; counts[i] = (counts[i] ?? 0) + 1;
      return { ...r, polls: { ...r.polls, [o.id]: { counts, mine: i } } };
    });
    await supabase.from('story_poll_votes').upsert({ story_id: story!.id, sticker_id: o.id, option: i }).then(() => load(), () => {});
  }
  async function slide(o: Overlay, v: number) {
    tick();
    await supabase.from('story_slider_votes').upsert({ story_id: story!.id, sticker_id: o.id, value: v }).then(() => load(), () => {});
  }
  async function remind(o: Overlay) {
    tick();
    const on = res.countdowns?.[o.id]?.mine;
    if (on) await supabase.from('story_countdown_subscribers').delete().eq('story_id', story!.id).eq('sticker_id', o.id).eq('user_id', (await supabase.auth.getUser()).data.user?.id ?? '');
    else await supabase.from('story_countdown_subscribers').insert({ story_id: story!.id, sticker_id: o.id });
    if (!on) toast(t('رح نذكّرك لما يخلص العدّاد'));
    load();
  }
  async function sendAnswer() {
    const body = answer.trim();
    if (!ask || !body) return;
    const { error } = await supabase.from('story_question_answers').insert({ story_id: story!.id, sticker_id: ask.id, body });
    setAsk(null); setAnswer(''); onResume();
    if (error) toast(t('ما انبعت ردك، جرّب كمان مرة.')); else { tick(); toast(t('انبعت ردك')); load(); }
  }

  function open(o: Overlay) {
    onPause();
    if (o.kind === 'mention' && o.userId) router.push({ pathname: '/user/[id]', params: { id: o.userId } });
    else if (o.kind === 'link' && o.data?.url) Linking.openURL(o.data.url).catch(() => {});
    else if (o.kind === 'place') router.push({ pathname: '/map', params: o.data?.lat != null ? { lat: String(o.data.lat), lng: String(o.data.lng), name: o.text } : {} });
    else if (o.kind === 'hashtag') router.push({ pathname: '/search', params: { q: `#${o.text.replace(/^#/, '')}` } });
  }

  const strokes = items.filter((o) => o.kind === 'draw').flatMap((o) => o.data?.strokes ?? []);
  const author = mine || !!res.author;

  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, width, height }}>
      <DrawLayer strokes={strokes} width={width} height={height} />
      {items.filter((o) => o.kind !== 'draw').map((o) => {
        const tappable = ['mention', 'link', 'place', 'hashtag'].includes(o.kind) && (o.kind !== 'mention' || !!o.userId);
        const live: Live | undefined = o.kind === 'poll' ? { poll: res.polls?.[o.id], author, onPoll: author ? undefined : (i) => vote(o, i) }
          : o.kind === 'slider' ? { slider: res.sliders?.[o.id], author, onSlide: author ? undefined : (v) => slide(o, v) }
          : o.kind === 'countdown' ? { countdown: res.countdowns?.[o.id], author, onRemind: author ? undefined : () => remind(o) }
          : o.kind === 'question' ? { question: res.questions?.[o.id], author, onAsk: () => { onPause(); if (author) setAnswers(o); else setAsk(o); } }
          : o.kind === 'addyours' ? { author, onAddYours: () => { onPause(); router.push({ pathname: '/post/new', params: { mode: 'story', addyours: o.text } }); } }
          : undefined;
        return (
          <Placed key={o.id} o={o} width={width} height={height} interactive={!!live} onPress={tappable ? () => open(o) : undefined}>
            <StickerBody o={o} width={width} live={live} />
          </Placed>
        );
      })}

      {/* answer a question sticker */}
      <Modal visible={!!ask} transparent animationType="fade" onRequestClose={() => { setAsk(null); onResume(); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 24 }}>
          <Pressable style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} onPress={() => { setAsk(null); onResume(); }} accessibilityLabel={t('إغلاق')} />
          {ask && (
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, gap: 12 }}>
              <Text style={{ fontFamily: F.display, fontSize: 18, color: '#0E1430', textAlign: 'center' }}>{ask.text || t('اسألني سؤال')}</Text>
              <TextInput autoFocus value={answer} onChangeText={(v) => setAnswer(v.slice(0, 300))} placeholder={t('اكتب ردك…')} placeholderTextColor="#8A93AE" multiline
                style={{ minHeight: 64, borderRadius: 14, backgroundColor: '#F2F3F7', padding: 12, fontFamily: F.body, fontSize: 16, color: '#0E1430', textAlign: 'right' }} />
              <Pressable onPress={sendAnswer} disabled={!answer.trim()} accessibilityRole="button"
                style={{ minHeight: 46, borderRadius: 23, backgroundColor: answer.trim() ? '#FF6B4A' : '#E9ECF5', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontFamily: F.bodyBold, fontSize: 15, color: answer.trim() ? '#0E1430' : '#8A93AE' }}>{t('ابعت')}</Text>
              </Pressable>
            </View>
          )}
        </KeyboardAvoidingView>
      </Modal>

      {/* the author reads the answers */}
      <Modal visible={!!answers} transparent animationType="slide" onRequestClose={() => { setAnswers(null); onResume(); }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => { setAnswers(null); onResume(); }} accessibilityLabel={t('إغلاق')} />
        {answers && (
          <View style={{ maxHeight: '70%', backgroundColor: '#17204A', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 10, paddingBottom: insets.bottom + 12 }}>
            <View style={{ alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' }} />
            <Text style={{ fontFamily: F.display, fontSize: 17, color: '#FFFFFF', textAlign: 'center', marginVertical: 12 }}>{answers.text || t('اسألني سؤال')}</Text>
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}>
              {(res.questions?.[answers.id]?.answers ?? []).length === 0 && <Text style={{ fontFamily: F.body, color: '#A5AECB', textAlign: 'center', padding: 20 }}>{t('لسا ما حدا رد')}</Text>}
              {(res.questions?.[answers.id]?.answers ?? []).map((a) => (
                <View key={a.id} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: 12 }}>
                  <Avatar id={a.user_id} name={a.name} url={a.avatar_url} size={36} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ fontFamily: F.bodyBold, fontSize: 13, color: '#A5AECB' }}>{a.name}</Text>
                    <Text style={{ fontFamily: F.body, fontSize: 15, color: '#FFFFFF' }}>{a.body}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </Modal>
    </View>
  );
}
