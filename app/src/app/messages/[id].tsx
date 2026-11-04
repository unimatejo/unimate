import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { Image } from 'expo-image';
import { Bookmark, Camera, ChevronRight, EyeOff, Flame, Image as ImageIcon, MoreHorizontal, Phone, Send, ShieldCheck, Timer, Users, Video } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, SlideInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap, Toggle } from '@/components/ui';
import { VoiceBubble, VoiceRecorder } from '@/components/Voice';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import type { Conversation, Message, VanishMode } from '@/lib/types';
import { pickMedia, uploadFile } from '@/lib/upload';
import { timeAgo } from '@/lib/util';
import { flip, isAR, t, ta } from '@/lib/i18n';
import { optimistic, run } from '@/lib/run';

const VANISH: { key: VanishMode; label: string; hint: string }[] = [
  { key: 'after_view', label: t('بعد المشاهدة'), hint: t('زي السناب') },
  { key: 'h24', label: t('بعد 24 ساعة'), hint: t('الافتراضي') },
  { key: 'd7', label: t('بعد أسبوع'), hint: '' },
  { key: 'never', label: t('ما تختفي'), hint: t('بتنحفظ') },
];

/** A reply to a story, like Instagram: the story's photo (while it still exists) above the text. */
function StoryReplyBubble({ m, mine }: { m: Message; mine: boolean }) {
  const [thumb, setThumb] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  useEffect(() => {
    if (!m.ref_id) { setGone(true); return; }
    supabase.from('stories').select('media_url, kind, author_id').eq('id', m.ref_id).maybeSingle().then(async ({ data }) => {
      if (!data || data.kind !== 'image') { setGone(!data); return; }
      setThumb(await mediaUrl('stories', data.media_url));
    }, () => setGone(true));
  }, [m.ref_id]);
  return (
    <View style={{ gap: 6, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <T v="tiny" color={C.muted}>{mine ? t('رديت على قصته') : t('رد على قصتك')}</T>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: C.line }} />
        {thumb ? <Image source={{ uri: thumb }} style={{ width: 92, height: 150, borderRadius: 14 }} contentFit="cover" />
          : <View style={{ width: 92, height: 150, borderRadius: 14, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center', padding: 8 }}><T v="tiny" color={C.muted} style={{ textAlign: 'center' }}>{gone ? t('القصة خلصت') : '…'}</T></View>}
      </View>
      <View style={[{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: mine ? C.primary : C.card }, mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }]}>
        <T v="body" color={mine ? C.white : C.ink}>{m.body}</T>
      </View>
    </View>
  );
}

function ChatImage({ path, mine }: { path: string; mine: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { mediaUrl('chat', path).then(setUri); }, [path]);
  return <View style={{ width: 210, height: 160, borderRadius: 22, borderBottomRightRadius: mine ? 6 : 22, borderBottomLeftRadius: mine ? 22 : 6, overflow: 'hidden', backgroundColor: C.primarySoft }}>
    {uri && <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={150} />}
  </View>;
}

function Dot({ d }: { d: number }) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withDelay(d, withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1)); }, [v, d]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.65, transform: [{ translateY: -v.value * 3 }] }));
  return <Animated.View style={[{ width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted }, a]} />;
}
function TypingDots() { return <Row gap={3}><Dot d={0} /><Dot d={150} /><Dot d={300} /></Row>; }

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [other, setOther] = useState<{ id: string; full_name: string; avatar_url: string | null } | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [myState, setMyState] = useState<string>('active');
  const [people, setPeople] = useState<Record<string, { full_name: string; avatar_url: string | null }>>({});
  const [otherRead, setOtherRead] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const typingCh = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTyped = useRef(0);

  const shield = !!conv?.block_screenshots;
  // Android: the screen shows black in screenshots and recordings. iOS: we hide while recording and tell the other side.
  useEffect(() => {
    if (!shield) return;
    if (Platform.OS === 'web') return; // browsers can't block or detect screenshots
    ScreenCapture.preventScreenCaptureAsync('chat').catch(() => {});
    let sub: { remove: () => void } | null = null;
    try { sub = ScreenCapture.addScreenshotListener(() => { supabase.rpc('report_screenshot', { conv: id, plat: Platform.OS }); }); } catch { /* not available */ }
    return () => { ScreenCapture.allowScreenCaptureAsync('chat').catch(() => {}); sub?.remove(); };
  }, [shield, id]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: c } = await supabase.from('conversations').select('*').eq('id', id).single();
    setConv(c as Conversation);
    const { data: mem } = await supabase.from('conversation_members').select('user_id, state, last_read_at, profile:profiles(id, full_name, avatar_url)').eq('conversation_id', id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mem ?? []) as any[];
    setPeople(Object.fromEntries(rows.filter((r) => r.profile).map((r) => [r.user_id, r.profile])));
    setOtherRead(rows.find((m) => m.user_id !== (profile?.id ?? ''))?.last_read_at ?? null);
    setOther(rows.find((m) => m.user_id !== (profile?.id ?? ''))?.profile ?? null);
    setMyState(rows.find((m) => m.user_id === (profile?.id ?? ''))?.state ?? 'active');
    const { data: m } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(60);
    setMsgs((m ?? []) as Message[]);
    supabase.rpc('mark_read', { conv: id });
  }, [id, profile]);

  useEffect(() => { load(); }, [load]);

  // "typing…" like Instagram, over a realtime broadcast channel (nothing is stored)
  useEffect(() => {
    if (!profile) return;
    let clear: ReturnType<typeof setTimeout> | null = null;
    const ch = supabase.channel(`typing-${id}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.user === profile.id) return;
        setTyping(payload?.name ?? '');
        if (clear) clearTimeout(clear);
        clear = setTimeout(() => setTyping(null), 3500);
      })
      .subscribe();
    typingCh.current = ch;
    return () => { if (clear) clearTimeout(clear); supabase.removeChannel(ch); typingCh.current = null; };
  }, [id, profile]);

  function onDraft(v: string) {
    setDraft(v);
    const now = Date.now();
    if (v && now - lastTyped.current > 2000 && typingCh.current) {
      lastTyped.current = now;
      typingCh.current.send({ type: 'broadcast', event: 'typing', payload: { user: profile?.id, name: profile?.full_name?.split(' ')[0] } });
    }
  }

  /** Long-press a message: save it, unsend it (yours), or report it. */
  function messageMenu(m: Message) {
    const mineMsg = m.sender_id === profile?.id;
    const opts: [string, () => void][] = [
      [m.is_saved ? t('إلغاء الحفظ') : t('احفظ بالمحادثة'), () => toggleSave(m)],
      ...(mineMsg ? [[t('إلغاء الإرسال'), async () => {
        setMsgs((cur) => cur.filter((x) => x.id !== m.id));
        await supabase.rpc('unsend_message', { msg: m.id });
      }] as [string, () => void]] : [[t('إبلاغ'), () => router.push({ pathname: '/report', params: { type: 'conversation', id, user: m.sender_id ?? '' } })] as [string, () => void]]),
    ];
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: [...opts.map((o) => o[0]), t('إلغاء')], cancelButtonIndex: opts.length, destructiveButtonIndex: opts.length - 1 }, (i) => opts[i]?.[1]());
    else Alert.alert('', undefined, [...opts.map(([text, onPress]) => ({ text, onPress })), { text: t('إلغاء'), style: 'cancel' as const }]);
  }

  // "Seen": refresh when the other side reads
  useEffect(() => {
    if (conv?.kind !== 'direct' || !profile) return;
    const tick = async () => {
      const { data } = await supabase.from('conversation_members').select('last_read_at').eq('conversation_id', id).neq('user_id', profile.id).maybeSingle();
      setOtherRead(data?.last_read_at ?? null);
    };
    const tm = setInterval(tick, 8000);
    return () => clearInterval(tm);
  }, [conv?.kind, id, profile]);

  // live messages
  useEffect(() => {
    const ch = supabase.channel(`conv-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p) => {
        const m = p.new as Message;
        setMsgs((cur) => cur.some((x) => x.id === m.id) ? cur : [m, ...cur]);
        if (m.sender_id !== profile?.id) supabase.rpc('mark_read', { conv: id });
      })
      // saved / unsent / viewed-once / vanished messages change live too
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p) => {
        const m = p.new as Message;
        setMsgs((cur) => cur.map((x) => (x.id === m.id ? { ...x, ...m } : x)));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p) => {
        const old = p.old as { id?: string };
        if (old?.id) setMsgs((cur) => cur.filter((x) => x.id !== old.id));
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, (p) => setConv(p.new as Conversation))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function send(kind: 'text' | 'image' | 'view_once' | 'voice' = 'text', media?: string, extra?: string) {
    if (!profile) return;
    const body = kind === 'text' ? draft.trim() : kind === 'voice' ? extra ?? null : null;
    if (kind === 'text' && !body) return;
    if (kind === 'text') setDraft('');
    const { data, error } = await supabase.from('messages').insert({ conversation_id: id, sender_id: (profile?.id ?? ''), kind, body, media_url: media ?? null }).select().single();
    if (error) {
      if (kind === 'text' && body) setDraft((d) => d || body); // give the text back
      Alert.alert(t('ما انبعتت'), myState === 'request' ? t('لازم تقبل الطلب أول.') : t('جرّب مرة ثانية.')); return;
    }
    setMsgs((cur) => [data as Message, ...cur.filter((x) => x.id !== data.id)]);
  }

  const [uploading, setUploading] = useState(false);
  async function sendPhoto(viewOnce: boolean, camera = false) {
    if (uploading) return;
    try {
      const f = await pickMedia({ camera });
      if (!f) return;
      setUploading(true);
      const path = await uploadFile('chat', id, f);
      await send(viewOnce ? 'view_once' : 'image', path);
    } catch (e) { Alert.alert(t('ما انبعتت الصورة'), (e as Error).message); }
    finally { setUploading(false); }
  }

  const [recording, setRecording] = useState(false);
  async function sendVoice(file: { uri: string; mime: string }, seconds: number) {
    const path = await uploadFile('chat', id, file);
    await send('voice', path, String(seconds));
  }

  // older messages when you scroll up
  const [more, setMore] = useState(true);
  const loadingOlder = useRef(false);
  async function loadOlder() {
    if (!more || loadingOlder.current || msgs.length < 60) return;
    loadingOlder.current = true;
    const oldest = msgs[msgs.length - 1]?.created_at;
    const { data } = await supabase.from('messages').select('*').eq('conversation_id', id).lt('created_at', oldest).order('created_at', { ascending: false }).limit(60);
    loadingOlder.current = false;
    if (!data?.length) { setMore(false); return; }
    setMsgs((cur) => [...cur, ...(data as Message[]).filter((m) => !cur.some((x) => x.id === m.id))]);
  }

  const [answering, setAnswering] = useState(false);
  async function answerHere(accept: boolean) {
    if (answering) return;
    setAnswering(true);
    const r = await run(supabase.rpc('answer_request', { conv: id, accept }));
    setAnswering(false);
    if (!r.ok) return;
    if (accept) setMyState('active'); else if (router.canGoBack()) router.back();
  }

  async function openOnce(m: Message) {
    const { data } = await supabase.rpc('open_view_once', { msg: m.id });
    if (data) { setViewer(await mediaUrl('chat', data as string)); setMsgs((cur) => cur.map((x) => x.id === m.id ? { ...x, viewed_once_at: new Date().toISOString() } : x)); }
  }

  async function toggleSave(m: Message) {
    await supabase.from('messages').update({ is_saved: !m.is_saved }).eq('id', m.id);
    setMsgs((cur) => cur.map((x) => x.id === m.id ? { ...x, is_saved: !m.is_saved } : x));
  }

  async function setVanish(v: VanishMode) {
    const before = conv?.vanish;
    await optimistic(`vanish-${id}`, () => setConv((c) => (c ? { ...c, vanish: v } : c)), () => setConv((c) => (c && before ? { ...c, vanish: before } : c)),
      () => supabase.rpc('set_conversation_vanish', { conv: id, mode: v }));
  }

  async function setShield(v: boolean) {
    setConv((c) => c ? { ...c, block_screenshots: v } : c);
    await supabase.from('conversations').update({ block_screenshots: v }).eq('id', id);
  }

  async function call(kind: 'voice' | 'video') {
    const { data, error } = await supabase.from('calls').insert({ conversation_id: id, caller_id: (profile?.id ?? ''), kind }).select().single();
    if (error) return;
    router.push({ pathname: '/call/[id]', params: { id: data.id, name: other?.full_name ?? conv?.title ?? '', kind } });
  }

  // re-check every 20s so vanished messages leave the screen on time
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const tm = setInterval(() => setNow(Date.now()), 20000); return () => clearInterval(tm); }, []);
  const visible = useMemo(() => msgs.filter((m) => !m.deleted_at && (m.is_saved || !m.vanishes_at || new Date(m.vanishes_at).getTime() > now)), [msgs, now]);
  const title = conv?.kind === 'direct' ? other?.full_name ?? '' : conv?.title ?? '';
  const vanishLabel = VANISH.find((v) => v.key === conv?.vanish)?.label ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.glass, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Row gap={4} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Tap onPress={() => router.back()} accessibilityLabel={t('رجوع')} style={{ width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={24} color={C.ink} style={flip} /></Tap>
          <Tap onPress={() => other && router.push({ pathname: '/user/[id]', params: { id: other.id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            {conv?.kind === 'direct' ? <Avatar id={other?.id} name={title} url={other?.avatar_url} size={40} /> :
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Users size={20} color={C.greenInk} /></View>}
            <View style={{ flex: 1 }}>
              <Row gap={5}>
                <T v="h3" numberOfLines={1}>{title}</T>
                {(conv?.streak_days ?? 0) > 1 && <Row gap={2}><Flame size={15} color="#E8590C" fill="#FF8A00" /><T v="tiny" color="#E8590C">{conv?.streak_days}</T></Row>}
              </Row>
              {conv?.context_label ? <T v="tiny" color={C.muted} numberOfLines={1}>{conv.context_label}</T> : null}
            </View>
          </Tap>
          {conv?.kind === 'direct' && <>
            {process.env.EXPO_PUBLIC_CALLS === '1' && <>
            <Tap onPress={() => call('voice')} accessibilityLabel={t('مكالمة صوتية')} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><Phone size={21} color={C.ink} /></Tap>
            <Tap onPress={() => call('video')} accessibilityLabel={t('مكالمة فيديو')} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><Video size={23} color={C.ink} /></Tap>
            </>}
          </>}
          <Tap onPress={() => setSheet(true)} accessibilityLabel={t('إعدادات المحادثة')} style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={22} color={C.ink} /></Tap>
        </Row>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          ref={list}
          inverted
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={typing !== null ? (
            <Animated.View entering={FadeIn} style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9, marginTop: 6 }}>
              <TypingDots />
              <T v="tiny" color={C.muted}>{conv?.kind === 'direct' ? t('عم يكتب…') : t('{0} عم يكتب…', [typing])}</T>
            </Animated.View>
          ) : undefined}
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          ListFooterComponent={
            <View style={{ alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Tap onPress={() => setSheet(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
                <Timer size={14} color={C.ink2} /><T v="tiny" color={C.ink2}>{conv?.vanish === 'never' ? t('الرسائل ما بتختفي') : t('الرسائل بتختفي {0}', [isAR ? vanishLabel : vanishLabel.toLowerCase()])} {t('· بدون أرقام')}</T>
              </Tap>
              {shield && <Row gap={6} style={{ backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}><ShieldCheck size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('محادثة محمية من التصوير')}</T></Row>}
            </View>
          }
          renderItem={({ item: m, index }) => {
            const mine = m.sender_id === profile?.id;
            const older = visible[index + 1];
            const showName = conv?.kind !== 'direct' && !mine && m.sender_id && older?.sender_id !== m.sender_id;
            const lastMine = mine && index === visible.findIndex((x) => x.sender_id === profile?.id);
            if (m.kind === 'system') return <Animated.View entering={FadeIn} style={{ alignSelf: 'center', backgroundColor: C.soft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><T v="tiny" color={C.ink2}>{m.body}</T></Animated.View>;
            return (
              <Animated.View entering={FadeInUp.springify().damping(16)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 3 }}>
                {showName && people[m.sender_id!] && (
                  <Row gap={6} style={{ marginTop: 6 }}>
                    <Avatar id={m.sender_id} name={people[m.sender_id!].full_name} url={people[m.sender_id!].avatar_url} size={20} />
                    <T v="tiny" color={C.muted}>{people[m.sender_id!].full_name}</T>
                  </Row>
                )}
                <Pressable onPress={async () => { if (m.kind === 'image' && m.media_url) setViewer(await mediaUrl('chat', m.media_url)); }} onLongPress={() => messageMenu(m)} delayLongPress={350}>
                  {m.kind === 'image' && m.media_url ? <ChatImage path={m.media_url} mine={mine} /> :
                   m.kind === 'voice' && m.media_url ? <VoiceBubble path={m.media_url} seconds={Number(m.body) || 0} mine={mine} /> :
                   m.kind === 'story_reply' ? <StoryReplyBubble m={m} mine={mine} /> :
                   m.kind === 'view_once' ? (
                    <Tap onPress={() => !mine && !m.viewed_once_at && openOnce(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: m.viewed_once_at ? C.line : C.pink, backgroundColor: C.card }}>
                      <Camera size={20} color={m.viewed_once_at ? C.faint : C.pinkInk} />
                      <T v="bold" color={m.viewed_once_at ? C.faint : C.pinkInk} style={{ fontSize: 14 }}>{m.viewed_once_at ? t('تمت المشاهدة') : mine ? t('صورة بتنشاف مرة') : t('صورة، اكبس لتشوفها مرة')}</T>
                    </Tap>
                  ) : (
                    <View style={[{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: mine ? C.primary : C.card },
                      mine ? { borderBottomRightRadius: 6, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } } : { borderBottomLeftRadius: 6 }]}>
                      <T v="body" color={mine ? C.white : C.ink}>{m.body}</T>
                    </View>
                  )}
                </Pressable>
                <Row gap={4} style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                  {m.is_saved && <Bookmark size={11} color={C.primary} fill={C.primary} />}
                  <T v="tiny" color={C.faint} style={{ fontSize: 10 }}>{timeAgo(m.created_at)}</T>
                  {lastMine && conv?.kind === 'direct' && <T v="tiny" color={otherRead && otherRead >= m.created_at ? C.primary : C.faint} style={{ fontSize: 10 }}>{otherRead && otherRead >= m.created_at ? t('شافها') : t('انبعتت')}</T>}
                </Row>
              </Animated.View>
            );
          }}
        />

        {myState === 'request' ? (
          <View style={{ backgroundColor: C.card, padding: 14, paddingBottom: insets.bottom + 10, gap: 8 }}>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('هاد طلب مراسلة. اقبله عشان تقدر ترد.')}</T>
            <Row gap={8}>
              <Tap onPress={() => answerHere(true)} disabled={answering} style={{ flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><T v="bold" color={C.white}>{t('قبول')}</T></Tap>
              <Tap onPress={() => answerHere(false)} disabled={answering} style={{ flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><T v="bold">{t('تجاهل')}</T></Tap>
            </Row>
          </View>
        ) : (
          <Row gap={6} style={{ backgroundColor: C.glass, paddingHorizontal: 10, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: C.line }}>
            {!recording && <>
            <Tap onPress={() => sendPhoto(true, true)} disabled={uploading} accessibilityLabel={t('صورة بتنشاف مرة')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.6 : 1 }}>{uploading ? <ActivityIndicator color={C.white} /> : <Camera size={21} color={C.white} />}</Tap>
            <Row gap={0} style={{ flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: C.field, paddingHorizontal: 6 }}>
              <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={draft} onChangeText={onDraft} placeholder={t('رسالة...')} placeholderTextColor={C.faint} multiline
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta, paddingHorizontal: 10, maxHeight: 110, paddingVertical: 10 }} accessibilityLabel={t('اكتب رسالة')} />
              <Tap onPress={() => sendPhoto(false)} disabled={uploading} accessibilityLabel={t('صورة من الاستوديو')} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={21} color={C.ink2} /></Tap>
            </Row>
            </>}
            {draft.trim() && !recording ? (
              <Animated.View entering={FadeIn}>
                <Tap onPress={() => send()} accessibilityLabel={t('إرسال')} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Send size={19} color={C.white} style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} /></Tap>
              </Animated.View>
            ) : <VoiceRecorder onRecorded={sendVoice} onRecording={setRecording} disabled={uploading} />}
          </Row>
        )}
      </KeyboardAvoidingView>

      <Modal visible={sheet} transparent animationType="fade" onRequestClose={() => setSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setSheet(false)} />
        <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: insets.bottom + 20, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <T v="h2">{t('متى تختفي الرسائل؟')}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {VANISH.map((v) => {
              const on = conv?.vanish === v.key;
              return (
                <Tap key={v.key} onPress={() => setVanish(v.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={{ width: '48.5%', minHeight: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.card }}>
                  <T v="bold" color={on ? C.primaryDark : C.ink} style={{ fontSize: 14 }}>{v.label}</T>
                  {v.hint ? <T v="tiny" color={C.muted}>{v.hint}</T> : null}
                </Tap>
              );
            })}
          </View>
          <View style={{ backgroundColor: C.bg, borderRadius: 18, paddingHorizontal: 14 }}>
            <Toggle value={shield} onChange={setShield} label={t('منع تصوير هاي المحادثة')} hint={t('أندرويد: الشاشة بتطلع سودا. آيفون: بنخفيها وبنبلغ الطرف الثاني')}
              icon={<View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}><EyeOff size={19} color={C.white} /></View>} />
          </View>
          <T v="tiny" color={C.muted}>{t('اضغط مطوّل على أي رسالة عشان تحفظها بالمحادثة.')}</T>
          <Tap onPress={() => { setSheet(false); router.push({ pathname: '/report', params: { type: 'conversation', id, user: other?.id ?? '' } }); }} style={{ minHeight: 48, borderRadius: 16, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' }}>
            <T v="bold" color={C.danger}>{t('إبلاغ أو حظر')}</T>
          </Tap>
        </Animated.View>
      </Modal>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          <T v="small" color="#AEB8D8" style={{ textAlign: 'center', marginTop: 12 }}>{t('بتنشاف مرة وحدة. اكبس عشان تسكّر.')}</T>
        </Pressable>
      </Modal>
    </View>
  );
}
