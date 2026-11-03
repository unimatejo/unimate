import { router, useLocalSearchParams } from 'expo-router';
import * as ScreenCapture from 'expo-screen-capture';
import { Image } from 'expo-image';
import { Bookmark, Camera, ChevronRight, EyeOff, Flame, Image as ImageIcon, MoreHorizontal, Phone, Send, ShieldCheck, Timer, Users, Video } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp, SlideInDown } from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Row, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import type { Conversation, Message, VanishMode } from '@/lib/types';
import { pickMedia, uploadFile } from '@/lib/upload';
import { timeAgo } from '@/lib/util';

const VANISH: { key: VanishMode; label: string; hint: string }[] = [
  { key: 'after_view', label: 'بعد المشاهدة', hint: 'زي السناب' },
  { key: 'h24', label: 'بعد 24 ساعة', hint: 'الافتراضي' },
  { key: 'd7', label: 'بعد أسبوع', hint: '' },
  { key: 'never', label: 'ما تختفي', hint: 'بتنحفظ' },
];

function ChatImage({ path, mine }: { path: string; mine: boolean }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { mediaUrl('chat', path).then(setUri); }, [path]);
  return <View style={{ width: 210, height: 160, borderRadius: 22, borderBottomRightRadius: mine ? 6 : 22, borderBottomLeftRadius: mine ? 22 : 6, overflow: 'hidden', backgroundColor: '#DDE4FF' }}>
    {uri && <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={150} />}
  </View>;
}

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
  const list = useRef<FlatList<Message>>(null);

  const shield = !!conv?.block_screenshots;
  // Android: the screen shows black in screenshots and recordings. iOS: we hide while recording and tell the other side.
  useEffect(() => {
    if (!shield) return;
    ScreenCapture.preventScreenCaptureAsync('chat').catch(() => {});
    const sub = ScreenCapture.addScreenshotListener(() => { supabase.rpc('report_screenshot', { conv: id, plat: Platform.OS }); });
    return () => { ScreenCapture.allowScreenCaptureAsync('chat').catch(() => {}); sub.remove(); };
  }, [shield, id]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data: c } = await supabase.from('conversations').select('*').eq('id', id).single();
    setConv(c as Conversation);
    const { data: mem } = await supabase.from('conversation_members').select('user_id, state, profile:profiles(id, full_name, avatar_url)').eq('conversation_id', id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mem ?? []) as any[];
    setOther(rows.find((m) => m.user_id !== profile.id)?.profile ?? null);
    setMyState(rows.find((m) => m.user_id === profile.id)?.state ?? 'active');
    const { data: m } = await supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(60);
    setMsgs((m ?? []) as Message[]);
    supabase.rpc('mark_read', { conv: id });
  }, [id, profile]);

  useEffect(() => { load(); }, [load]);

  // live messages
  useEffect(() => {
    const ch = supabase.channel(`conv-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (p) => {
        setMsgs((cur) => cur.some((x) => x.id === (p.new as Message).id) ? cur : [p.new as Message, ...cur]);
        supabase.rpc('mark_read', { conv: id });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${id}` }, (p) => setConv(p.new as Conversation))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id]);

  async function send(kind: 'text' | 'image' | 'view_once' = 'text', media?: string) {
    if (!profile) return;
    const body = kind === 'text' ? draft.trim() : null;
    if (kind === 'text' && !body) return;
    setDraft('');
    const { data, error } = await supabase.from('messages').insert({ conversation_id: id, sender_id: profile.id, kind, body, media_url: media ?? null }).select().single();
    if (error) { Alert.alert('ما انبعتت', myState === 'request' ? 'لازم تقبل الطلب أول.' : 'جرّب مرة ثانية.'); return; }
    setMsgs((cur) => [data as Message, ...cur.filter((x) => x.id !== data.id)]);
  }

  async function sendPhoto(viewOnce: boolean, camera = false) {
    try {
      const f = await pickMedia({ camera });
      if (!f) return;
      const path = await uploadFile('chat', id, f);
      await send(viewOnce ? 'view_once' : 'image', path);
    } catch (e) { Alert.alert('ما انبعتت الصورة', (e as Error).message); }
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
    setConv((c) => c ? { ...c, vanish: v } : c);
    await supabase.from('conversations').update({ vanish: v }).eq('id', id);
    await supabase.from('messages').insert({ conversation_id: id, sender_id: profile!.id, kind: 'text', body: `غيّرت مدة اختفاء الرسائل: ${VANISH.find((x) => x.key === v)?.label}` });
  }

  async function setShield(v: boolean) {
    setConv((c) => c ? { ...c, block_screenshots: v } : c);
    await supabase.from('conversations').update({ block_screenshots: v }).eq('id', id);
  }

  async function call(kind: 'voice' | 'video') {
    const { data, error } = await supabase.from('calls').insert({ conversation_id: id, caller_id: profile!.id, kind }).select().single();
    if (error) return;
    router.push({ pathname: '/call/[id]', params: { id: data.id, name: other?.full_name ?? conv?.title ?? '', kind } });
  }

  const visible = useMemo(() => msgs.filter((m) => !m.deleted_at && (m.is_saved || !m.vanishes_at || new Date(m.vanishes_at) > new Date())), [msgs]);
  const title = conv?.kind === 'direct' ? other?.full_name ?? '' : conv?.title ?? '';
  const vanishLabel = VANISH.find((v) => v.key === conv?.vanish)?.label ?? '';

  return (
    <View style={{ flex: 1, backgroundColor: '#F3F4FA' }}>
      <SafeAreaView edges={['top']} style={{ backgroundColor: 'rgba(255,255,255,0.95)', borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Row gap={4} style={{ paddingHorizontal: 8, paddingVertical: 8 }}>
          <Tap onPress={() => router.back()} accessibilityLabel="رجوع" style={{ width: 42, height: 44, alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={24} color={C.ink} /></Tap>
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
            <Tap onPress={() => call('voice')} accessibilityLabel="مكالمة صوتية" style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><Phone size={21} color={C.ink} /></Tap>
            <Tap onPress={() => call('video')} accessibilityLabel="مكالمة فيديو" style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><Video size={23} color={C.ink} /></Tap>
          </>}
          <Tap onPress={() => setSheet(true)} accessibilityLabel="إعدادات المحادثة" style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}><MoreHorizontal size={22} color={C.ink} /></Tap>
        </Row>
      </SafeAreaView>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          ref={list}
          inverted
          data={visible}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          ListFooterComponent={
            <View style={{ alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Tap onPress={() => setSheet(true)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.white, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999 }}>
                <Timer size={14} color={C.ink2} /><T v="tiny" color={C.ink2}>الرسائل بتختفي من المحادثة {vanishLabel} · بدون أرقام</T>
              </Tap>
              {shield && <Row gap={6} style={{ backgroundColor: C.greenSoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 }}><ShieldCheck size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>محادثة محمية من التصوير</T></Row>}
            </View>
          }
          renderItem={({ item: m }) => {
            const mine = m.sender_id === profile?.id;
            if (m.kind === 'system') return <Animated.View entering={FadeIn} style={{ alignSelf: 'center', backgroundColor: '#E7EAF3', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}><T v="tiny" color={C.ink2}>{m.body}</T></Animated.View>;
            return (
              <Animated.View entering={FadeInUp.springify().damping(16)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', gap: 3 }}>
                <Pressable onLongPress={() => toggleSave(m)} delayLongPress={350}>
                  {m.kind === 'image' && m.media_url ? <ChatImage path={m.media_url} mine={mine} /> :
                   m.kind === 'view_once' ? (
                    <Tap onPress={() => !mine && !m.viewed_once_at && openOnce(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1.5, borderColor: m.viewed_once_at ? C.line : C.pink, backgroundColor: C.white }}>
                      <Camera size={20} color={m.viewed_once_at ? C.faint : C.pinkInk} />
                      <T v="bold" color={m.viewed_once_at ? C.faint : C.pinkInk} style={{ fontSize: 14 }}>{m.viewed_once_at ? 'تمت المشاهدة' : mine ? 'صورة بتنشاف مرة' : 'صورة، اكبس لتشوفها مرة'}</T>
                    </Tap>
                  ) : (
                    <View style={[{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, backgroundColor: mine ? C.primary : C.white },
                      mine ? { borderBottomRightRadius: 6, shadowColor: C.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 5 } } : { borderBottomLeftRadius: 6 }]}>
                      <T v="body" color={mine ? C.white : C.ink}>{m.body}</T>
                    </View>
                  )}
                </Pressable>
                <Row gap={4} style={{ alignSelf: mine ? 'flex-end' : 'flex-start' }}>
                  {m.is_saved && <Bookmark size={11} color={C.primary} fill={C.primary} />}
                  <T v="tiny" color={C.faint} style={{ fontSize: 10 }}>{timeAgo(m.created_at)}</T>
                </Row>
              </Animated.View>
            );
          }}
        />

        {myState === 'request' ? (
          <View style={{ backgroundColor: C.white, padding: 14, paddingBottom: insets.bottom + 10, gap: 8 }}>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>هاد طلب مراسلة. اقبله عشان تقدر ترد.</T>
            <Row gap={8}>
              <Tap onPress={async () => { await supabase.rpc('answer_request', { conv: id, accept: true }); setMyState('active'); }} style={{ flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><T v="bold" color={C.white}>قبول</T></Tap>
              <Tap onPress={async () => { await supabase.rpc('answer_request', { conv: id, accept: false }); router.back(); }} style={{ flex: 1, minHeight: 46, borderRadius: 15, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><T v="bold">تجاهل</T></Tap>
            </Row>
          </View>
        ) : (
          <Row gap={6} style={{ backgroundColor: 'rgba(255,255,255,0.95)', paddingHorizontal: 10, paddingTop: 10, paddingBottom: insets.bottom + 10, borderTopWidth: 1, borderTopColor: C.line }}>
            <Tap onPress={() => sendPhoto(true, true)} accessibilityLabel="صورة بتنشاف مرة" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Camera size={21} color={C.white} /></Tap>
            <Row gap={0} style={{ flex: 1, minHeight: 44, borderRadius: 22, backgroundColor: C.field, paddingHorizontal: 6 }}>
              <TextInput value={draft} onChangeText={setDraft} placeholder="رسالة..." placeholderTextColor={C.faint} multiline
                style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: 'right', paddingHorizontal: 10, maxHeight: 110, paddingVertical: 10 }} accessibilityLabel="اكتب رسالة" />
              <Tap onPress={() => sendPhoto(false)} accessibilityLabel="صورة من الاستوديو" style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}><ImageIcon size={21} color={C.ink2} /></Tap>
            </Row>
            {draft.trim() ? (
              <Animated.View entering={FadeIn}>
                <Tap onPress={() => send()} accessibilityLabel="إرسال" style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><Send size={19} color={C.white} style={{ transform: [{ scaleX: -1 }] }} /></Tap>
              </Animated.View>
            ) : null}
          </Row>
        )}
      </KeyboardAvoidingView>

      <Modal visible={sheet} transparent animationType="fade" onRequestClose={() => setSheet(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setSheet(false)} />
        <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 18, paddingBottom: insets.bottom + 20, gap: 14 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#DCE1EE' }} />
          <T v="h2">متى تختفي الرسائل؟</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {VANISH.map((v) => {
              const on = conv?.vanish === v.key;
              return (
                <Tap key={v.key} onPress={() => setVanish(v.key)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                  style={{ width: '48.5%', minHeight: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: on ? 2 : 1, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primarySoft : C.white }}>
                  <T v="bold" color={on ? C.primaryDark : C.ink} style={{ fontSize: 14 }}>{v.label}</T>
                  {v.hint ? <T v="tiny" color={C.muted}>{v.hint}</T> : null}
                </Tap>
              );
            })}
          </View>
          <View style={{ backgroundColor: C.bg, borderRadius: 18, paddingHorizontal: 14 }}>
            <Toggle value={shield} onChange={setShield} label="منع تصوير هاي المحادثة" hint="أندرويد: الشاشة بتطلع سودا. آيفون: بنخفيها وبنبلغ الطرف الثاني"
              icon={<View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}><EyeOff size={19} color={C.white} /></View>} />
          </View>
          <T v="tiny" color={C.muted}>اضغط مطوّل على أي رسالة عشان تحفظها بالمحادثة.</T>
          <Tap onPress={() => { setSheet(false); router.push({ pathname: '/report', params: { type: 'conversation', id, user: other?.id ?? '' } }); }} style={{ minHeight: 48, borderRadius: 16, backgroundColor: '#FFF1F3', alignItems: 'center', justifyContent: 'center' }}>
            <T v="bold" color={C.danger}>إبلاغ أو حظر</T>
          </Tap>
        </Animated.View>
      </Modal>

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable onPress={() => setViewer(null)} style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center' }}>
          {viewer && <Image source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" />}
          <T v="small" color="#AEB8D8" style={{ textAlign: 'center', marginTop: 12 }}>بتنشاف مرة وحدة. اكبس عشان تسكّر.</T>
        </Pressable>
      </Modal>
    </View>
  );
}
