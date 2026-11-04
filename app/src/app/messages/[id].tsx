import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { Image } from 'expo-image';
import { BadgeCheck, Bookmark, Camera, Plus, Sticker, ChevronRight, EyeOff, Flame, Image as ImageIcon, MoreHorizontal, Phone, Send, ShieldCheck, Timer, Users, Video } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { TitleBadge } from '@/components/TitleBadge';
import { AttachSheet, ContactBubble, FileBubble, LocationBubble, PollBubble, StickerBubble, StickerPanel, saveSticker, type Outgoing } from '@/components/ChatAttach';
import { bubble, DateSep, HeartBurst, inkOn, MessageMenu, ReactionChips, ReactionsSheet, SeenBy, SheetModal, subOn, type Reaction } from '@/components/ChatExtras';
import { Bone } from '@/components/Skeleton';
import { Avatar, Row, T, Tap, Toggle } from '@/components/ui';
import { VoiceBubble, VoiceRecorder } from '@/components/Voice';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import type { Conversation, Message, VanishMode } from '@/lib/types';
import { pickMedia, uploadFile } from '@/lib/upload';
import { timeAgo } from '@/lib/util';
import { flip, isAR, nm, t, ta } from '@/lib/i18n';
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
    <View style={{ gap: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      <T v="tiny" color={C.muted}>{mine ? t('ردّيت على قصته') : t('ردّ على قصتك')}</T>
      {thumb ? <Image source={{ uri: thumb }} style={{ width: 110, height: 150, borderRadius: 16 }} contentFit="cover" />
        : <View style={{ width: 110, height: 150, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, alignItems: 'center', justifyContent: 'center', padding: 8 }}><T v="tiny" color={C.muted} style={{ textAlign: 'center' }}>{gone ? t('القصة خلصت') : '…'}</T></View>}
      <View style={[{ paddingHorizontal: 14, paddingVertical: 10 }, bubble(mine)]}>
        <T v="body" color={inkOn(mine)} style={{ lineHeight: 22 }}>{m.body}</T>
      </View>
    </View>
  );
}

function ChatImage({ path, mine }: { path: string; mine: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { mediaUrl('chat', path).then(setUri); }, [path]);
  return <View style={[{ width: 220, height: 170, overflow: 'hidden' }, bubble(mine, C.card)]}>
    {uri && <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={150} />}
  </View>;
}

function Dot({ d }: { d: number }) {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withDelay(d, withRepeat(withSequence(withTiming(1, { duration: 300 }), withTiming(0, { duration: 300 })), -1)); }, [v, d]);
  const a = useAnimatedStyle(() => ({ opacity: 0.35 + v.value * 0.65, transform: [{ translateY: -v.value * 3 }] }));
  return <Animated.View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: C.muted }, a]} />;
}
function TypingDots() { return <Row gap={4}><Dot d={0} /><Dot d={150} /><Dot d={300} /></Row>; }

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [other, setOther] = useState<{ id: string; full_name: string; avatar_url: string | null; username?: string | null; is_verified?: boolean; academic_title?: string | null; title_verified?: boolean; major?: { name_ar: string; name_en?: string | null } | null } | null>(null);
  const [msgs, setMsgs] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);
  const [myState, setMyState] = useState<string>('active');
  const [people, setPeople] = useState<Record<string, { full_name: string; avatar_url: string | null }>>({});
  const [otherRead, setOtherRead] = useState<string | null>(null);
  const [reads, setReads] = useState<Record<string, string | null>>({}); // everyone's last read time, for "seen"
  const [reactions, setReactions] = useState<Record<string, Reaction[]>>({});
  const [menuFor, setMenuFor] = useState<Message | null>(null);
  const [reactSheet, setReactSheet] = useState<string | null>(null);
  const lastTap = useRef<{ id: string; at: number } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [heart, setHeart] = useState<string | null>(null);
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
    try { sub = ScreenCapture.addScreenshotListener(() => { supabase.rpc('report_screenshot', { conv: id, plat: Platform.OS }).then(() => {}, () => {}); }); } catch { /* not available */ }
    return () => { ScreenCapture.allowScreenCaptureAsync('chat').catch(() => {}); sub?.remove(); };
  }, [shield, id]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: c } = await supabase.from('conversations').select('*').eq('id', id).single();
    setConv(c as Conversation);
    const { data: mem } = await supabase.from('conversation_members').select('user_id, state, last_read_at, profile:profiles(id, full_name, avatar_url, username, is_verified, academic_title, title_verified, major:majors(name_ar, name_en))').eq('conversation_id', id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mem ?? []) as any[];
    setPeople(Object.fromEntries(rows.filter((r) => r.profile).map((r) => [r.user_id, r.profile])));
    setOtherRead(rows.find((m) => m.user_id !== (profile?.id ?? ''))?.last_read_at ?? null);
    setReads(Object.fromEntries(rows.filter((r) => r.user_id !== profile.id && r.state === 'active').map((r) => [r.user_id, r.last_read_at])));
    setOther(rows.find((m) => m.user_id !== (profile?.id ?? ''))?.profile ?? null);
    setMyState(rows.find((m) => m.user_id === (profile?.id ?? ''))?.state ?? 'active');
    const { data: m } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(60);
    setMsgs((m ?? []) as Message[]);
    setLoaded(true);
    loadReactions(((m ?? []) as Message[]).map((x) => x.id));
    supabase.rpc('mark_read', { conv: id }).then(() => {}, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, profile]);

  async function loadReactions(ids: string[]) {
    if (!ids.length) return;
    const { data } = await supabase.from('message_reactions').select('message_id, user_id, emoji').eq('conversation_id', id).in('message_id', ids);
    setReactions((cur) => {
      const next = { ...cur };
      for (const mid of ids) delete next[mid];
      for (const r of data ?? []) (next[r.message_id] ??= []).push({ user_id: r.user_id, emoji: r.emoji });
      return next;
    });
  }

  /** One reaction per person: tapping the same emoji again takes it off. */
  async function react(m: Message, emoji: string) {
    if (!profile) return;
    const me = profile.id;
    const had = (reactions[m.id] ?? []).find((r) => r.user_id === me)?.emoji;
    const set = (e: string | null) => setReactions((cur) => ({ ...cur, [m.id]: [...(cur[m.id] ?? []).filter((r) => r.user_id !== me), ...(e ? [{ user_id: me, emoji: e }] : [])] }));
    if (had === emoji) {
      set(null);
      const { error } = await supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', me);
      if (error) set(had);
    } else {
      set(emoji);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      const { error } = await supabase.from('message_reactions').upsert({ message_id: m.id, user_id: me, conversation_id: id, emoji });
      if (error) set(had ?? null);
    }
  }

  // double-tap a message for ❤️, like Instagram
  function tapMessage(m: Message, single: () => void) {
    const n = Date.now();
    if (lastTap.current?.id === m.id && n - lastTap.current.at < 300) {
      lastTap.current = null;
      setHeart(m.id);
      if ((reactions[m.id] ?? []).find((r) => r.user_id === profile?.id)?.emoji !== '❤️') react(m, '❤️');
      return;
    }
    lastTap.current = { id: m.id, at: n };
    single();
  }

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

  /** Long-press a message: react, save it, unsend it (yours), or report it. */
  const messageMenu = (m: Message) => setMenuFor(m);
  function menuActions(m: Message) {
    const mineMsg = m.sender_id === profile?.id;
    return [
      ...(m.kind === 'sticker' && m.media_url && profile ? [{ label: t('احفظ بستيكراتي'), onPress: async () => { if (await saveSticker(profile.id, m.media_url!)) Alert.alert(t('انحفظ الستيكر ✓'), t('بتلاقيه بستيكراتك بأي محادثة.')); } }] : []),
      { label: m.is_saved ? t('إلغاء الحفظ') : t('احفظ بالمحادثة'), onPress: () => toggleSave(m) },
      mineMsg
        ? { label: t('إلغاء الإرسال'), danger: true, onPress: async () => { setMsgs((cur) => cur.filter((x) => x.id !== m.id)); await supabase.rpc('unsend_message', { msg: m.id }); } }
        : { label: t('إبلاغ'), danger: true, onPress: () => router.push({ pathname: '/report', params: { type: 'conversation', id, user: m.sender_id ?? '' } }) },
    ];
  }

  // "Seen": live when someone reads (and a slow poll as a fallback)
  useEffect(() => {
    if (!profile) return;
    const apply = (rows: { user_id: string; last_read_at: string | null; state?: string }[]) => {
      setReads((cur) => {
        const next = { ...cur };
        for (const r of rows) if (r.user_id !== profile.id && (!r.state || r.state === 'active')) next[r.user_id] = r.last_read_at;
        return next;
      });
      const o = rows.find((r) => r.user_id !== profile.id);
      if (o && conv?.kind === 'direct') setOtherRead(o.last_read_at);
    };
    const tick = async () => {
      const { data } = await supabase.from('conversation_members').select('user_id, last_read_at, state').eq('conversation_id', id);
      apply((data ?? []) as never);
    };
    const ch = supabase.channel(`reads-${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${id}` }, (p) => apply([p.new as never]))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions', filter: `conversation_id=eq.${id}` }, (p) => {
        const r = (p.eventType === 'DELETE' ? p.old : p.new) as { message_id?: string; user_id?: string; emoji?: string };
        if (!r?.message_id || !r.user_id || r.user_id === profile.id) return;
        setReactions((cur) => ({ ...cur, [r.message_id!]: [...(cur[r.message_id!] ?? []).filter((x) => x.user_id !== r.user_id), ...(p.eventType === 'DELETE' ? [] : [{ user_id: r.user_id!, emoji: r.emoji! }])] }));
      })
      .subscribe();
    const tm = setInterval(tick, 15000);
    return () => { clearInterval(tm); supabase.removeChannel(ch); };
  }, [conv?.kind, id, profile]);

  // live messages
  useEffect(() => {
    const ch = supabase.channel(`conv-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p) => {
        const m = p.new as Message;
        setMsgs((cur) => cur.some((x) => x.id === m.id) ? cur : [m, ...cur]);
        if (m.sender_id !== profile?.id) supabase.rpc('mark_read', { conv: id }).then(() => {}, () => {});
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

  const [attach, setAttach] = useState(false);
  const [stickers, setStickers] = useState(false);
  /** stickers, files, location, contacts and polls from the "+" sheet */
  async function sendOut(o: Outgoing) {
    if (!profile) return;
    const { data, error } = await supabase.from('messages').insert({ conversation_id: id, sender_id: profile.id, kind: o.kind, body: o.body ?? null, media_url: o.media ?? null, ref_id: o.ref ?? null }).select().single();
    if (error) { Alert.alert(t('ما انبعتت'), myState === 'request' ? t('لازم تقبل الطلب أول.') : t('جرّب مرة ثانية.')); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setMsgs((cur) => [data as Message, ...cur.filter((x) => x.id !== data.id)]);
  }

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
    loadReactions((data as Message[]).map((m) => m.id));
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
      <SafeAreaView edges={['top']} style={{ backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Row gap={6} style={{ height: 64, paddingHorizontal: 6 }}>
          <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace('/messages'))} accessibilityLabel={t('رجوع')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={24} color={C.ink} strokeWidth={2.2} style={flip} /></Tap>
          <Tap onPress={() => other && conv?.kind === 'direct' && router.push({ pathname: '/user/[id]', params: { id: other.id } })} haptic={false} scale={0.98} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}>
            {conv?.kind === 'direct' ? <Avatar id={other?.id} name={title} url={other?.avatar_url} size={40} /> :
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Users size={19} color={C.ink} /></View>}
            <View style={{ flex: 1 }}>
              <Row gap={5}>
                <T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontFamily: F.bodyBold }}>{title}</T>
                {other?.is_verified && conv?.kind === 'direct' && <BadgeCheck size={15} color={C.onPrimary} fill={C.primary} />}
                {conv?.kind === 'direct' && <TitleBadge title={other?.academic_title} verified={other?.title_verified} />}
                {(conv?.streak_days ?? 0) > 1 && <Row gap={2}><Flame size={14} color="#E8590C" fill="#FF8A00" /><T v="tiny" color="#FF9A1F">{conv?.streak_days}</T></Row>}
              </Row>
              {typing !== null ? <T v="tiny" color={C.primary} numberOfLines={1}>{conv?.kind === 'direct' ? t('عم يكتب…') : t('{0} عم يكتب…', [typing])}</T>
                : conv?.kind === 'direct' ? <T v="tiny" color={C.muted} numberOfLines={1}>{other?.major ? nm(other.major) : other?.username ? `@${other.username}` : ''}</T>
                : <T v="tiny" color={C.muted} numberOfLines={1}>{conv?.context_label || t('{0} أعضاء', [String(Object.keys(people).length)])}</T>}
            </View>
          </Tap>
          {conv?.kind === 'direct' && process.env.EXPO_PUBLIC_CALLS === '1' && <>
            <Tap onPress={() => call('voice')} accessibilityLabel={t('مكالمة صوتية')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Phone size={21} color={C.ink} strokeWidth={1.8} /></Tap>
            <Tap onPress={() => call('video')} accessibilityLabel={t('مكالمة فيديو')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Video size={23} color={C.ink} strokeWidth={1.8} /></Tap>
          </>}
          <Tap onPress={() => setSheet(true)} accessibilityLabel={t('إعدادات المحادثة')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={22} color={C.ink} /></Tap>
        </Row>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          ref={list}
          inverted
          onEndReached={loadOlder}
          onEndReachedThreshold={0.3}
          ListHeaderComponent={typing !== null ? (
            <Animated.View entering={FadeIn} accessibilityLabel={conv?.kind === 'direct' ? t('عم يكتب…') : t('{0} عم يكتب…', [typing])} style={{ alignSelf: 'flex-start', backgroundColor: C.soft, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 13, marginTop: 6 }}>
              <TypingDots />
            </Animated.View>
          ) : undefined}
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingVertical: 12, gap: 6 }}
          ListEmptyComponent={!loaded ? (
            <View style={{ gap: 10, paddingTop: 20, transform: [{ scaleY: -1 }] }}>
              {[150, 210, 120, 180, 230].map((w, i) => <Bone key={i} w={w} h={40} r={20} style={{ alignSelf: i % 2 ? 'flex-end' : 'flex-start' }} />)}
            </View>
          ) : undefined}
          ListFooterComponent={
            <View style={{ alignItems: 'center', gap: 6, marginBottom: 10 }}>
              {/* like Instagram: who you're talking to, at the top of the chat */}
              {conv?.kind === 'direct' && other && (!more || visible.length < 60) && (
                <Animated.View entering={FadeIn} style={{ alignItems: 'center', gap: 4, paddingVertical: 18 }}>
                  <Avatar id={other.id} name={other.full_name} url={other.avatar_url} size={92} ring />
                  <Row gap={5} style={{ marginTop: 8 }}>
                    <T v="h2">{other.full_name}</T>
                    {other.is_verified && <BadgeCheck size={18} color={C.onPrimary} fill={C.primary} />}
                    <TitleBadge title={other.academic_title} verified={other.title_verified} size="md" />
                  </Row>
                  {other.username ? <T v="small" color={C.muted} style={{ writingDirection: 'ltr' }}>@{other.username}</T> : null}
                  {other.major ? <T v="tiny" color={C.muted}>{nm(other.major)}</T> : null}
                  <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: other.id } })} style={{ marginTop: 10, minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft }}>
                    <T v="bold" style={{ fontSize: 14 }}>{t('شوف البروفايل')}</T>
                  </Tap>
                </Animated.View>
              )}
              <Tap onPress={() => setSheet(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, paddingHorizontal: 12, minHeight: 34, borderRadius: 999 }}>
                <Timer size={14} color={C.ink2} /><T v="tiny" color={C.ink2}>{conv?.vanish === 'never' ? t('الرسائل ما بتختفي') : t('الرسائل بتختفي {0}', [isAR ? vanishLabel : vanishLabel.toLowerCase()])} {t('· بدون أرقام')}</T>
              </Tap>
              {shield && <Row gap={6} style={{ backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}><ShieldCheck size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('محادثة محمية من التصوير')}</T></Row>}
            </View>
          }
          renderItem={({ item: m, index }) => {
            const mine = m.sender_id === profile?.id;
            const older = visible[index + 1];
            const newer = index > 0 ? visible[index - 1] : undefined;
            const newDay = !older || new Date(older.created_at).toDateString() !== new Date(m.created_at).toDateString();
            const sep = newDay || (older && new Date(m.created_at).getTime() - new Date(older.created_at).getTime() > 60 * 60000);
            const showName = conv?.kind !== 'direct' && !mine && m.sender_id && (older?.sender_id !== m.sender_id || sep);
            const lastMine = mine && index === visible.findIndex((x) => x.sender_id === profile?.id);
            // a time under the last bubble of each run, like Instagram
            const endOfRun = !newer || newer.sender_id !== m.sender_id || new Date(newer.created_at).getTime() - new Date(m.created_at).getTime() > 5 * 60000;
            const seenDirect = otherRead && otherRead >= m.created_at;
            if (m.kind === 'system') return <View>{sep && <DateSep iso={m.created_at} />}<Animated.View entering={FadeIn} style={{ alignSelf: 'center', backgroundColor: C.soft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><T v="tiny" color={C.ink2}>{m.body}</T></Animated.View></View>;
            const plain = !['image', 'voice', 'story_reply', 'sticker', 'file', 'location', 'contact', 'poll', 'view_once'].includes(m.kind) || ((m.kind === 'image' || m.kind === 'voice' || m.kind === 'file') && !m.media_url);
            return (
              <View>
                {sep && <DateSep iso={m.created_at} />}
                <Animated.View entering={FadeInUp.springify().damping(20).stiffness(260)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '78%', gap: 3, marginTop: showName ? 6 : 0 }}>
                  {showName && people[m.sender_id!] && (
                    <Row gap={6}>
                      <Avatar id={m.sender_id} name={people[m.sender_id!].full_name} url={people[m.sender_id!].avatar_url} size={20} />
                      <T v="tiny" color={C.muted}>{people[m.sender_id!].full_name}</T>
                    </Row>
                  )}
                  <Pressable onPress={() => tapMessage(m, async () => { if (m.kind === 'image' && m.media_url) setViewer(await mediaUrl('chat', m.media_url)); })}
                    onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); messageMenu(m); }} delayLongPress={320}
                    accessibilityHint={t('اكبس مرتين للايك، ومطوّل للتفاعلات')}>
                    {m.kind === 'image' && m.media_url ? <ChatImage path={m.media_url} mine={mine} /> :
                     m.kind === 'voice' && m.media_url ? <VoiceBubble path={m.media_url} seconds={Number(m.body) || 0} mine={mine} /> :
                     m.kind === 'story_reply' ? <StoryReplyBubble m={m} mine={mine} /> :
                     m.kind === 'sticker' ? <StickerBubble m={m} /> :
                     m.kind === 'file' && m.media_url ? <FileBubble m={m} mine={mine} /> :
                     m.kind === 'location' ? <LocationBubble m={m} mine={mine} /> :
                     m.kind === 'contact' ? <ContactBubble m={m} mine={mine} /> :
                     m.kind === 'poll' ? <PollBubble m={m} mine={mine} me={profile?.id} /> :
                     m.kind === 'view_once' ? (
                      <Tap onPress={() => !mine && !m.viewed_once_at && openOnce(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: m.viewed_once_at ? C.line : C.pink, backgroundColor: C.card }}>
                        <Camera size={20} color={m.viewed_once_at ? C.faint : C.pink} />
                        <T v="bold" color={m.viewed_once_at ? C.faint : C.pinkInk} style={{ fontSize: 14 }}>{m.viewed_once_at ? t('تمت المشاهدة') : mine ? t('صورة بتنشاف مرة') : t('صورة، اكبس لتشوفها مرة')}</T>
                      </Tap>
                    ) : plain ? (
                      <View style={[{ paddingHorizontal: 14, paddingVertical: 10 }, bubble(mine)]}>
                        <T v="body" color={inkOn(mine)} style={{ fontSize: 15, lineHeight: 22, fontFamily: mine ? F.bodyMd : F.body }}>{m.body}</T>
                      </View>
                    ) : null}
                    {heart === m.id && <HeartBurst onDone={() => setHeart(null)} />}
                  </Pressable>
                  <ReactionChips list={reactions[m.id] ?? []} mine={mine} me={profile?.id} onPress={() => setReactSheet(m.id)} />
                  {(endOfRun || lastMine || m.is_saved) && (
                    <Row gap={4} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', paddingHorizontal: 4 }}>
                      {m.is_saved && <Bookmark size={11} color={C.primary} fill={C.primary} />}
                      {lastMine && conv?.kind === 'direct'
                        ? <T v="tiny" color={C.muted} style={{ fontSize: 11 }}>{seenDirect ? t('شوهدت') : `${t('انبعتت')} · ${timeAgo(m.created_at)}`}</T>
                        : endOfRun ? <T v="tiny" color={C.faint} style={{ fontSize: 11 }}>{timeAgo(m.created_at)}</T> : null}
                      {lastMine && conv?.kind !== 'direct' && (() => {
                        const others = Object.keys(reads);
                        const seen = others.filter((u) => (reads[u] ?? '') >= m.created_at);
                        return <SeenBy readers={seen} total={others.length} people={people} onPress={() => Alert.alert(t('شافها'), seen.map((u) => people[u]?.full_name ?? '').join('\n'))} />;
                      })()}
                    </Row>
                  )}
                </Animated.View>
              </View>
            );
          }}
        />

        {myState === 'request' ? (
          <View style={{ backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.line, padding: 14, paddingBottom: insets.bottom + 10, gap: 10 }}>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('هاد طلب مراسلة. اقبله عشان تقدر ترد.')}</T>
            <Row gap={8}>
              <Tap onPress={() => answerHere(true)} disabled={answering} style={{ flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><T v="bold" color={C.onPrimary}>{t('قبول')}</T></Tap>
              <Tap onPress={() => answerHere(false)} disabled={answering} style={{ flex: 1, minHeight: 46, borderRadius: 23, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><T v="bold">{t('تجاهل')}</T></Tap>
            </Row>
          </View>
        ) : (
          <Row gap={6} style={{ backgroundColor: C.bg, paddingHorizontal: 10, paddingTop: 8, paddingBottom: insets.bottom + 10 }}>
            {!recording && <Tap onPress={() => setAttach(true)} accessibilityLabel={t('إرفاق')} style={{ width: 40, height: 50, alignItems: 'center', justifyContent: 'center' }}><Plus size={25} color={C.ink} /></Tap>}
            {/* one stable tree so the voice recorder keeps recording while the rest of the pill hides */}
            <Row gap={2} style={recording ? { flex: 1, minHeight: 50 } : { flex: 1, minHeight: 50, borderRadius: 25, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, paddingStart: 5, paddingEnd: 4 }}>
              {!recording && <Tap onPress={() => sendPhoto(true, true)} disabled={uploading} accessibilityLabel={t('الكاميرا · صورة بتنشاف مرة')} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: uploading ? 0.6 : 1 }}>{uploading ? <ActivityIndicator color={C.onPrimary} /> : <Camera size={19} color={C.onPrimary} strokeWidth={2} />}</Tap>}
              {!recording && <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={draft} onChangeText={onDraft} placeholder={t('رسالة…')} placeholderTextColor={C.muted} multiline
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta, paddingHorizontal: 8, maxHeight: 110, paddingVertical: 10 }} accessibilityLabel={t('اكتب رسالة')} />}
              {!recording && draft.trim() ? (
                <Animated.View entering={FadeIn.duration(180)}>
                  <Tap onPress={() => send()} accessibilityLabel={t('إرسال')} scale={0.9} style={{ height: 40, width: 52, borderRadius: 20, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
                    <Send size={17} color={C.onPrimary} style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} />
                  </Tap>
                </Animated.View>
              ) : null}
              {(recording || !draft.trim()) && <VoiceRecorder onRecorded={sendVoice} onRecording={setRecording} disabled={uploading} />}
              {!recording && !draft.trim() && <Tap onPress={() => sendPhoto(false)} disabled={uploading} accessibilityLabel={t('صورة')} style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={21} color={C.ink} strokeWidth={1.8} /></Tap>}
              {!recording && !draft.trim() && <Tap onPress={() => setStickers(true)} accessibilityLabel={t('ستيكرات')} style={{ width: 38, height: 44, alignItems: 'center', justifyContent: 'center' }}><Sticker size={21} color={C.ink} strokeWidth={1.8} /></Tap>}
            </Row>
          </Row>
        )}
      </KeyboardAvoidingView>

      <SheetModal open={sheet} onClose={() => setSheet(false)} style={{ gap: 14 }}>
        <T v="h2">{t('متى تختفي الرسائل؟')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {VANISH.map((v) => {
            const on = conv?.vanish === v.key;
            return (
              <Tap key={v.key} onPress={() => setVanish(v.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{ width: '48.5%', minHeight: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? C.inverse : C.line, backgroundColor: on ? C.inverse : C.soft }}>
                <T v="bold" color={on ? C.onInverse : C.ink} style={{ fontSize: 14 }}>{v.label}</T>
                {v.hint ? <T v="tiny" color={on ? C.onInverse : C.muted}>{v.hint}</T> : null}
              </Tap>
            );
          })}
        </View>
        <View style={{ backgroundColor: C.soft, borderRadius: 20, paddingHorizontal: 14 }}>
          <Toggle value={shield} onChange={setShield} label={t('منع تصوير هاي المحادثة')} hint={t('أندرويد: الشاشة بتطلع سودا. آيفون: بنخفيها وبنبلغ الطرف الثاني')}
            icon={<View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}><EyeOff size={19} color={C.white} /></View>} />
        </View>
        <T v="tiny" color={C.muted}>{t('اضغط مطوّل على أي رسالة عشان تحفظها بالمحادثة.')}</T>
        <Tap onPress={() => { setSheet(false); router.push({ pathname: '/report', params: { type: 'conversation', id, user: other?.id ?? '' } }); }} style={{ minHeight: 48, borderRadius: 24, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' }}>
          <T v="bold" color={C.danger}>{t('إبلاغ أو حظر')}</T>
        </Tap>
      </SheetModal>

      <AttachSheet open={attach} onClose={() => setAttach(false)} conv={id} send={sendOut} onStickers={() => setStickers(true)} />
      <StickerPanel open={stickers} onClose={() => setStickers(false)} send={sendOut} />
      <MessageMenu open={!!menuFor} onClose={() => setMenuFor(null)} picked={menuFor ? (reactions[menuFor.id] ?? []).find((r) => r.user_id === profile?.id)?.emoji : null}
        onReact={(e) => menuFor && react(menuFor, e)} actions={menuFor ? menuActions(menuFor) : []} />
      <ReactionsSheet list={reactSheet ? reactions[reactSheet] ?? [] : null} people={people} me={profile?.id} onClose={() => setReactSheet(null)}
        onRemove={() => { const m = msgs.find((x) => x.id === reactSheet); const mineR = reactSheet && (reactions[reactSheet] ?? []).find((r) => r.user_id === profile?.id); if (m && mineR) react(m, mineR.emoji); }} />

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          <T v="small" color="#AEB8D8" style={{ textAlign: 'center', marginTop: 12 }}>{t('بتنشاف مرة وحدة. اكبس عشان تسكّر.')}</T>
        </Pressable>
      </Modal>
    </View>
  );
}
