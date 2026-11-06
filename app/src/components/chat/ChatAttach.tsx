import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BadgeCheck, BarChart3, Camera, Check, Clock3, FileText, Image as ImageIcon, MapPin, Plus, Search, Smile, Sparkles, Sticker, UserRound, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { canCutBackground, cutBackground } from '@/lib/stickerCut';
import { getPref, setPref } from '@/lib/prefs';
import { AvatarCropper } from '@/components/profile/AvatarCropper';
import { Avatar, Button, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { rtTopic } from '@/lib/realtime';
import { C, F, isDark } from '@/lib/theme';
import { bubble, SheetModal, subOn } from '@/components/chat/ChatExtras';
import type { Message } from '@/lib/types';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { userMessage } from '@/lib/run';
import { t, ta } from '@/lib/i18n';

export type Outgoing = { kind: 'image' | 'view_once' | 'sticker' | 'file' | 'location' | 'contact' | 'poll'; media?: string | null; body?: string | null; ref?: string | null };
type Send = (o: Outgoing) => Promise<void>;

const BIG_EMOJI = ['😂', '🤣', '😭', '🥹', '😍', '🥰', '😎', '🤔', '🙄', '😴', '🤯', '😡', '🥳', '😅', '🙏', '👏', '💪', '🔥', '❤️', '💔', '👀', '✅', '📚', '☕', '🎓', '💯', '🤝', '😬', '🫡', '🫠', '😤', '🤭'];
const fmtSize = (b?: number | null) => (!b ? '' : b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

/** The "+" sheet in the chat composer, like WhatsApp: photos, camera, document, location, contact, poll, stickers. */
export function AttachSheet({ open, onClose, conv, send, onStickers }: { open: boolean; onClose: () => void; conv: string; send: Send; onStickers: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [contactOpen, setContactOpen] = useState(false);

  async function run(key: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (e) { Alert.alert(t('ما انبعت'), userMessage(e)); } finally { setBusy(null); }
  }
  // like WhatsApp / Instagram: the sheet closes, you pick, crop freely in the editor, then "ابعت"
  const photo = (camera: boolean) => run(camera ? 'camera' : 'photos', async () => {
    onClose();
    await new Promise((r) => setTimeout(r, Platform.OS === 'ios' ? 420 : 60)); // let the sheet's window close first
    const f = await pickMedia({ camera, crop: 'chat' });
    if (!f) return;
    await send({ kind: 'image', media: await uploadFile('chat', conv, f) });
  });
  const doc = () => run('doc', async () => {
    const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (r.canceled || !r.assets?.[0]) return;
    const a = r.assets[0];
    if ((a.size ?? 0) > 25 * 1048576) { Alert.alert(t('الملف كبير'), t('أكبر حجم 25 ميغا.')); return; }
    onClose();
    const path = await uploadFile('chat', conv, { uri: a.uri, mime: a.mimeType || 'application/octet-stream' });
    await send({ kind: 'file', media: path, body: JSON.stringify({ name: a.name, size: a.size ?? null }) });
  });
  const location = () => run('loc', async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') { Alert.alert(t('الموقع مسكّر'), t('اسمح ليونيميت يوصل لموقعك عشان تبعته.')); return; }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    onClose();
    await send({ kind: 'location', body: `${pos.coords.latitude.toFixed(6)},${pos.coords.longitude.toFixed(6)}` });
  });

  const items: { key: string; label: string; color: string; icon: React.ReactNode; onPress: () => void }[] = [
    { key: 'photos', label: t('الصور'), color: '#2E7BFF', icon: <ImageIcon size={26} color="#fff" />, onPress: () => photo(false) },
    { key: 'camera', label: t('الكاميرا'), color: '#3A4150', icon: <Camera size={26} color="#fff" />, onPress: () => photo(true) },
    { key: 'doc', label: t('مستند'), color: '#4A90E2', icon: <FileText size={26} color="#fff" />, onPress: doc },
    { key: 'loc', label: t('الموقع'), color: '#18B47B', icon: <MapPin size={26} color="#fff" />, onPress: location },
    { key: 'contact', label: t('جهة اتصال'), color: '#6B7280', icon: <UserRound size={26} color="#fff" />, onPress: () => setContactOpen(true) },
    { key: 'poll', label: t('استطلاع رأي'), color: '#F5B400', icon: <BarChart3 size={26} color="#fff" />, onPress: () => setPollOpen(true) },
    { key: 'stickers', label: t('ستيكرات'), color: '#F0386B', icon: <Sticker size={26} color="#fff" />, onPress: () => { onClose(); onStickers(); } },
  ];

  return (
    <>
      <SheetModal open={open} onClose={onClose}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, paddingTop: 4 }}>
            {items.map((it) => (
              <Tap key={it.key} onPress={it.onPress} disabled={!!busy} scale={0.92} accessibilityLabel={it.label} style={{ width: '25%', alignItems: 'center', gap: 7 }}>
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: it.color, alignItems: 'center', justifyContent: 'center' }}>
                  {busy === it.key ? <ActivityIndicator color="#fff" /> : it.icon}
                </View>
                <T v="tiny" color={C.ink2}>{it.label}</T>
              </Tap>
            ))}
          </View>
      </SheetModal>
      <PollComposer open={pollOpen} onClose={() => setPollOpen(false)} onSend={async (q, opts) => { setPollOpen(false); onClose(); await send({ kind: 'poll', body: JSON.stringify({ q, options: opts }) }); }} />
      <ContactPicker open={contactOpen} onClose={() => setContactOpen(false)} onPick={async (p) => { setContactOpen(false); onClose(); await send({ kind: 'contact', ref: p.id, body: p.full_name }); }} />
    </>
  );
}

function PollComposer({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (q: string, opts: string[]) => void }) {
  const [q, setQ] = useState('');
  const [opts, setOpts] = useState(['', '']);
  useEffect(() => { if (open) { setQ(''); setOpts(['', '']); } }, [open]);
  const ok = q.trim().length >= 2 && opts.filter((o) => o.trim()).length >= 2;
  const input = { minHeight: 46, borderRadius: 14, backgroundColor: C.field, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta } as const;
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10, paddingBottom: 40, maxHeight: '85%' }}>
        <T v="h3">{t('استطلاع رأي')}</T>
        <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
          <TextInput value={q} onChangeText={setQ} placeholder={t('السؤال، مثلاً متى نعمل الدراسة؟')} placeholderTextColor={C.faint} maxLength={140} keyboardAppearance={isDark ? 'dark' : 'light'} style={input} />
          {opts.map((o, i) => (
            <Row key={i} gap={8}>
              <TextInput value={o} onChangeText={(v) => setOpts((x) => x.map((y, j) => (j === i ? v : y)))} placeholder={t('خيار {0}', [String(i + 1)])} placeholderTextColor={C.faint} maxLength={60} keyboardAppearance={isDark ? 'dark' : 'light'} style={[input, { flex: 1 }]} />
              {opts.length > 2 && <Tap onPress={() => setOpts((x) => x.filter((_, j) => j !== i))} accessibilityLabel={t('شيل')}><X size={20} color={C.muted} /></Tap>}
            </Row>
          ))}
          {opts.length < 8 && <Tap onPress={() => setOpts((x) => [...x, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}><Plus size={18} color={C.primary} /><T v="small" color={C.primaryDark}>{t('ضيف خيار')}</T></Tap>}
        </ScrollView>
        <Button title={t('ابعت الاستطلاع')} disabled={!ok} onPress={() => onSend(q.trim(), opts.map((o) => o.trim()).filter(Boolean))} />
      </Animated.View>
    </Modal>
  );
}

type Person = { id: string; full_name: string; avatar_url: string | null; username: string | null; is_verified?: boolean };
function ContactPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (p: Person) => void }) {
  const { profile } = useAuth();
  const [q, setQ] = useState('');
  const [list, setList] = useState<Person[]>([]);
  useEffect(() => {
    if (!open || !profile) return;
    const h = setTimeout(async () => {
      const s = q.trim();
      const sel = 'id, full_name, avatar_url, username, is_verified';
      const { data } = s.length >= 2
        ? await supabase.from('profiles').select(sel).or(`full_name.ilike.%${s}%,username.ilike.%${s.toLowerCase()}%`).neq('id', profile.id).limit(30)
        : await supabase.from('profiles').select(sel).eq('university_id', profile.university_id ?? '').neq('id', profile.id).not('username', 'is', null).limit(30);
      setList((data ?? []) as Person[]);
    }, 250);
    return () => clearTimeout(h);
  }, [q, open, profile]);
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={onClose} />
      <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10, height: '75%' }}>
        <T v="h3">{t('ابعت حساب حدا')}</T>
        <TextInput value={q} onChangeText={setQ} placeholder={t('دوّر بالاسم أو اليوزر')} placeholderTextColor={C.faint} keyboardAppearance={isDark ? 'dark' : 'light'}
          style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.field, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
        <FlatList data={list} keyExtractor={(p) => p.id} keyboardShouldPersistTaps="handled" renderItem={({ item }) => (
          <Tap onPress={() => onPick(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 }}>
            <Avatar id={item.id} name={item.full_name} url={item.avatar_url} size={42} />
            <View style={{ flex: 1 }}><T v="bodyMd">{item.full_name}</T>{item.username ? <T v="tiny" color={C.muted}>@{item.username}</T> : null}</View>
          </Tap>
        )} />
      </Animated.View>
    </Modal>
  );
}

/** Sticker drawer: my saved stickers (kept in my account) and big emoji. Make a sticker from any photo. */
type RecentSticker = { url?: string; emoji?: string };
function recentStickers(): RecentSticker[] {
  try { return JSON.parse(getPref('recent_stickers') ?? '[]') as RecentSticker[]; } catch { return []; }
}
function pushRecent(x: RecentSticker): RecentSticker[] {
  const key = x.url ?? x.emoji;
  const list = [x, ...recentStickers().filter((r) => (r.url ?? r.emoji) !== key)].slice(0, 24);
  setPref('recent_stickers', JSON.stringify(list));
  return list;
}

export function StickerPanel({ open, onClose, send }: { open: boolean; onClose: () => void; send: Send }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'recent' | 'pack' | 'mine' | 'emoji'>(() => (recentStickers().length ? 'recent' : 'pack'));
  const [q, setQ] = useState('');
  const [peek, setPeek] = useState<{ url?: string; emoji?: string; mineId?: string } | null>(null);
  const [recent, setRecent] = useState(recentStickers);
  const [mine, setMine] = useState<{ id: string; url: string }[] | null>(null);
  const [pack, setPack] = useState<{ id: string; url: string; animated: boolean; tags: string[] | null }[] | null>(null);
  const [lifted, setLifted] = useState<{ uri: string; original: { uri: string; width: number; height: number } } | null>(null);
  useEffect(() => {
    if (!open || pack) return;
    supabase.from('pack_stickers').select('id, url, animated, tags').order('position').then(({ data }) => setPack((data ?? []) as never), () => setPack([]));
  }, [open, pack]);
  const [cropSrc, setCropSrc] = useState<{ uri: string; width: number; height: number } | null>(null);
  const [making, setMaking] = useState(false);
  const load = useCallback(() => {
    if (!profile) return;
    supabase.from('my_stickers').select('id, url').eq('user_id', profile.id).order('created_at', { ascending: false }).then(({ data }) => setMine(data ?? []), () => setMine([]));
  }, [profile]);
  useEffect(() => { if (open) load(); }, [open, load]);

  // like WhatsApp: cut the person/object out of the photo (iPhone, iOS 17+); otherwise crop it
  async function make() {
    const f = await pickMedia({ maxWidth: 1600 });
    if (!f) return;
    const original = { uri: f.uri, width: f.width ?? 800, height: f.height ?? 800 };
    if (canCutBackground()) {
      setMaking(true);
      try { const r = await cutBackground(f.uri); setLifted({ uri: r.uri, original }); }
      catch { Alert.alert(t('ما لقينا شخص أو إشي واضح بالصورة'), t('بنقصها بإيدك بدالها.')); setCropSrc(original); }
      finally { setMaking(false); }
    } else setCropSrc(original);
  }
  async function cropped(f: { uri: string; mime: string }) {
    setCropSrc(null); setLifted(null);
    if (!profile) return;
    setMaking(true);
    try {
      const path = await uploadFile('stickers', profile.id, f);
      const url = publicUrl('stickers', path);
      await supabase.from('my_stickers').insert({ user_id: profile.id, url });
      load();
    } catch { Alert.alert(t('ما انعمل الستيكر'), t('جرّب كمان مرة.')); }
    finally { setMaking(false); }
  }
  async function remove(id: string) {
    setMine((m) => (m ?? []).filter((x) => x.id !== id));
    await supabase.from('my_stickers').delete().eq('id', id);
  }

  function pick(x: { url?: string; emoji?: string }) {
    onClose();
    setRecent(pushRecent(x));
    send(x.url ? { kind: 'sticker', media: x.url } : { kind: 'sticker', body: x.emoji });
  }
  const s = q.trim().toLowerCase();
  const packShown = (pack ?? []).filter((p) => !s || (p.tags ?? []).some((g) => g.toLowerCase().includes(s)));
  const TABS = [
    { k: 'recent' as const, icon: Clock3, label: t('الأخيرة') },
    { k: 'pack' as const, icon: Sparkles, label: t('يونيميت') },
    { k: 'mine' as const, icon: Sticker, label: t('ستيكراتي') },
    { k: 'emoji' as const, icon: Smile, label: t('إيموجي كبير') },
  ];
  const tile = { width: '25%' as const, aspectRatio: 1, padding: 5 };
  const soft = { flex: 1, borderRadius: 18, backgroundColor: C.soft, alignItems: 'center' as const, justifyContent: 'center' as const, overflow: 'hidden' as const };
  const Tile = ({ x, mineId, k }: { x: { url?: string; emoji?: string }; mineId?: string; k: string }) => (
    <Tap key={k} onPress={() => pick(x)} onLongPress={() => setPeek({ ...x, mineId })} scale={0.98} haptic={false} accessibilityLabel={x.emoji ?? t('ستيكر')} style={tile}>
      <View style={soft}>
        {x.url ? <Image source={{ uri: x.url }} style={{ width: '86%', height: '86%' }} contentFit="contain" autoplay cachePolicy="memory-disk" /> : <T style={{ fontSize: 40, lineHeight: 50 }}>{x.emoji}</T>}
      </View>
    </Tap>
  );

  return (
    <SheetModal open={open} onClose={onClose} dim={false} style={{ height: 470, paddingHorizontal: 0, paddingBottom: 0, gap: 0 }}>
      {/* tabs: icon + short label, the selected one filled like Instagram */}
      <Row gap={6} style={{ paddingHorizontal: 12, paddingBottom: 10 }}>
        {TABS.map(({ k, icon: Icon, label }) => {
          const on = tab === k;
          return (
            <Tap key={k} onPress={() => setTab(k)} haptic={false} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 44, borderRadius: 22, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.inverse : C.soft }}>
              <Icon size={17} color={on ? C.onInverse : C.muted} />
              {on ? <T v="small" color={C.onInverse} numberOfLines={1}>{label}</T> : null}
            </Tap>
          );
        })}
        <Tap onPress={onClose} accessibilityLabel={t('إغلاق')} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={20} color={C.muted} /></Tap>
      </Row>
      {tab === 'pack' && (
        <Row gap={8} style={{ marginHorizontal: 14, marginBottom: 8, minHeight: 42, borderRadius: 21, backgroundColor: C.soft, paddingHorizontal: 14 }}>
          <Search size={16} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('دوّر: ضحك، قهوة، امتحان…')} placeholderTextColor={C.muted}
            style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
          {q ? <Tap onPress={() => setQ('')} accessibilityLabel={t('امسح')}><X size={16} color={C.muted} /></Tap> : null}
        </Row>
      )}
      <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 9, paddingBottom: 34 }} keyboardShouldPersistTaps="handled">
        {tab === 'recent' && (recent.length
          ? recent.map((x, i) => <Tile key={`r${i}`} k={`r${i}`} x={x} />)
          : <T v="small" color={C.muted} style={{ padding: 18 }}>{t('الستيكرات اللي بتبعتها بتطلع هون.')}</T>)}
        {tab === 'pack' && <>
          {pack === null && Array.from({ length: 12 }, (_, i) => <View key={i} style={tile}><View style={soft} /></View>)}
          {packShown.map((p) => <Tile key={p.id} k={p.id} x={{ url: p.url }} />)}
          {pack && s && !packShown.length ? <T v="small" color={C.muted} style={{ padding: 18 }}>{t('ما لقينا ستيكر بهالكلمة.')}</T> : null}
        </>}
        {tab === 'emoji' && BIG_EMOJI.map((e) => <Tile key={e} k={e} x={{ emoji: e }} />)}
        {tab === 'mine' && <>
          <Tap onPress={make} disabled={making} accessibilityLabel={t('اعمل ستيكر')} style={tile}>
            <View style={{ flex: 1, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center', gap: 4, padding: 4 }}>
              {making ? <ActivityIndicator color={C.primaryDark} /> : <Plus size={24} color={C.primaryDark} />}
              <T v="tiny" color={C.primaryDark} style={{ fontSize: 10, textAlign: 'center' }}>{making ? t('عم نشيل الخلفية…') : t('اعمل ستيكر')}</T>
            </View>
          </Tap>
          {mine === null && Array.from({ length: 3 }, (_, i) => <View key={i} style={tile}><View style={soft} /></View>)}
          {(mine ?? []).map((m) => <Tile key={m.id} k={m.id} x={{ url: m.url }} mineId={m.id} />)}
          {mine && mine.length === 0 && <T v="small" color={C.muted} style={{ width: '70%', padding: 14 }}>{t('اعمل ستيكر من أي صورة (بنشيل الخلفية)، أو اكبس مطوّل على ستيكر بالمحادثة واحفظه. بيضلوا بحسابك.')}</T>}
        </>}
      </ScrollView>
      {/* long press: see it big, then send / keep / delete */}
      <Modal visible={!!peek} transparent animationType="fade" onRequestClose={() => setPeek(null)}>
        <Pressable onPress={() => setPeek(null)} style={{ flex: 1, backgroundColor: 'rgba(5,8,24,0.72)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
          <View style={{ width: 240, height: 240, alignItems: 'center', justifyContent: 'center' }}>
            {peek?.url ? <Image source={{ uri: peek.url }} style={{ width: 230, height: 230 }} contentFit="contain" autoplay /> : <T style={{ fontSize: 140, lineHeight: 168 }}>{peek?.emoji}</T>}
          </View>
          <Row gap={10}>
            <Button title={t('ابعت')} onPress={() => { const x = peek; setPeek(null); if (x) pick(x); }} style={{ minWidth: 110 }} />
            {peek?.mineId
              ? <Button kind="danger" title={t('شيله')} onPress={() => { const id = peek.mineId!; setPeek(null); remove(id); }} style={{ minWidth: 110 }} />
              : peek?.url && profile ? <Button kind="white" title={t('احفظه عندي')} onPress={async () => { const u = peek.url!; setPeek(null); if (await saveSticker(profile.id, u)) { load(); } }} style={{ minWidth: 110 }} /> : null}
          </Row>
        </Pressable>
      </Modal>
      <AvatarCropper src={cropSrc} onCancel={() => setCropSrc(null)} onDone={cropped} />
      <Modal visible={!!lifted} transparent animationType="fade" onRequestClose={() => setLifted(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(10,14,30,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
          <T v="h3" color="#fff">{t('هاد الستيكر')}</T>
          <View style={{ width: 260, height: 260, borderRadius: 24, backgroundColor: '#ECE5DD', alignItems: 'center', justifyContent: 'center' }}>
            {lifted && <Image source={{ uri: lifted.uri }} style={{ width: 230, height: 230 }} contentFit="contain" />}
          </View>
          <Row gap={10}>
            <Button kind="white" title={t('بالخلفية')} onPress={() => { const o = lifted?.original; setLifted(null); if (o) setCropSrc(o); }} style={{ minWidth: 120 }} />
            <Button title={t('احفظه')} onPress={() => lifted && cropped({ uri: lifted.uri, mime: 'image/png' })} style={{ minWidth: 120 }} />
          </Row>
          <Tap onPress={() => setLifted(null)}><T v="small" color="#AEB8D8">{t('إلغاء')}</T></Tap>
        </View>
      </Modal>
    </SheetModal>
  );
}

/** Save a sticker someone sent into my own collection. */
export async function saveSticker(userId: string, url: string) {
  const { error } = await supabase.from('my_stickers').upsert({ user_id: userId, url }, { onConflict: 'user_id,url', ignoreDuplicates: true });
  return !error;
}

// ---------- bubbles ----------

export function StickerBubble({ m }: { m: Message }) {
  if (m.media_url) return <Image source={{ uri: m.media_url }} style={{ width: 150, height: 150 }} contentFit="contain" />;
  return <T style={{ fontSize: 72, lineHeight: 86 }}>{m.body}</T>;
}

export function FileBubble({ m, mine }: { m: Message; mine: boolean }) {
  let meta: { name?: string; size?: number | null } = {};
  try { meta = JSON.parse(m.body ?? '{}'); } catch { /* */ }
  const [busy, setBusy] = useState(false);
  async function open() {
    setBusy(true);
    const url = await mediaUrl('chat', m.media_url);
    setBusy(false);
    if (!url) return;
    if (Platform.OS === 'web') Linking.openURL(url); else WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url));
  }
  const ext = (meta.name?.split('.').pop() ?? 'FILE').toUpperCase().slice(0, 4);
  return (
    <Tap onPress={open} haptic={false} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 240, padding: 10, borderRadius: 18, }, bubble(mine)]}>
      <View style={{ width: 42, height: 50, borderRadius: 8, backgroundColor: mine ? 'rgba(14,20,48,0.14)' : C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={mine ? C.onPrimary : C.primary} /> : <T v="tiny" color={mine ? C.onPrimary : C.primary} style={{ fontSize: 10 }}>{ext}</T>}
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyMd" numberOfLines={2} color={mine ? C.onPrimary : C.ink}>{meta.name ?? t('ملف')}</T>
        <T v="tiny" color={mine ? subOn(true) : C.muted}>{[fmtSize(meta.size), t('اكبس لتفتحه')].filter(Boolean).join(' · ')}</T>
      </View>
    </Tap>
  );
}

/** Body is "lat,lng" (my location) or "lat,lng,place name" (shared from the campus map). */
function parseLocation(body?: string | null) {
  const [la, ln, ...rest] = (body ?? '').split(',');
  const lat = Number(la), lng = Number(ln);
  return { lat, lng, name: rest.join(',').trim() || null, ok: Number.isFinite(lat) && Number.isFinite(lng) };
}

/** A place card: accent pin tile, the place name, walking minutes from you, and it opens the campus map there. */
export function LocationBubble({ m, mine }: { m: Message; mine: boolean }) {
  const { lat, lng, name, ok } = parseLocation(m.body);
  const [mins, setMins] = useState<number | null>(null);
  useEffect(() => {
    if (!ok || Platform.OS === 'web') return;
    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const p = await Location.getLastKnownPositionAsync();
      if (!p) return;
      const r = Math.PI / 180, dLat = (lat - p.coords.latitude) * r, dLng = (lng - p.coords.longitude) * r;
      const x = Math.sin(dLat / 2) ** 2 + Math.cos(p.coords.latitude * r) * Math.cos(lat * r) * Math.sin(dLng / 2) ** 2;
      const meters = 2 * 6371000 * Math.asin(Math.sqrt(x)) * 1.25; // paths are ~25% longer than a straight line
      if (meters < 8000) setMins(Math.max(1, Math.round(meters / 80)));
    })().catch(() => {});
  }, [lat, lng, ok]);
  const open = () => {
    if (!ok) return;
    router.push({ pathname: '/map', params: { lat: String(lat), lng: String(lng), name: name ?? '' } });
  };
  const external = () => {
    const url = Platform.OS === 'ios' ? `maps://?q=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
  };
  return (
    <Tap onPress={open} onLongPress={external} haptic={false} accessibilityRole="button" accessibilityLabel={`${name ?? t('موقعي')} · ${t('افتح بالخريطة')}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 250, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
        <MapPin size={20} color={C.onPrimary} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1 }}>
        <T v="bold" numberOfLines={1} style={{ fontSize: 14 }}>{name ?? (mine ? t('موقعي') : t('موقعه'))}</T>
        <T v="tiny" color={C.muted} numberOfLines={1}>{mins != null ? t('{0} دقائق مشي · افتح بالخريطة', [String(mins)]) : t('افتح بالخريطة')}</T>
      </View>
    </Tap>
  );
}

export function ContactBubble({ m, mine }: { m: Message; mine: boolean }) {
  const [p, setP] = useState<Person | null>(null);
  useEffect(() => { if (m.ref_id) supabase.from('profiles').select('id, full_name, avatar_url, username, is_verified').eq('id', m.ref_id).maybeSingle().then(({ data }) => setP(data as Person | null), () => {}); }, [m.ref_id]);
  return (
    <View style={[{ width: 240, borderRadius: 18, padding: 12, gap: 10, }, bubble(mine)]}>
      <Row gap={10}>
        <Avatar id={m.ref_id} name={p?.full_name ?? m.body ?? ''} url={p?.avatar_url ?? null} size={44} />
        <View style={{ flex: 1 }}>
          <Row gap={4}><T v="bodyMd" numberOfLines={1} color={mine ? C.onPrimary : C.ink} style={{ flexShrink: 1 }}>{p?.full_name ?? m.body}</T>{p?.is_verified && <BadgeCheck size={14} color="#fff" fill={C.verified} />}</Row>
          {p?.username ? <T v="tiny" color={mine ? subOn(true) : C.muted}>@{p.username}</T> : null}
        </View>
      </Row>
      <Tap onPress={() => m.ref_id && router.push({ pathname: '/user/[id]', params: { id: m.ref_id } })} style={{ minHeight: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(14,20,48,0.14)' : C.primarySoft }}>
        <T v="small" color={mine ? C.onPrimary : C.primary}>{t('شوف الحساب')}</T>
      </Tap>
    </View>
  );
}

export function PollBubble({ m, mine, me }: { m: Message; mine: boolean; me?: string }) {
  let poll: { q: string; options: string[] } = { q: '', options: [] };
  try { poll = JSON.parse(m.body ?? '{}'); } catch { /* */ }
  const [votes, setVotes] = useState<{ user_id: string; option: number }[]>([]);
  const load = useCallback(() => {
    supabase.from('poll_answers').select('user_id, option').eq('message_id', m.id).then(({ data }) => setVotes((data ?? []) as never), () => {});
  }, [m.id]);
  useEffect(() => {
    load();
    const ch = supabase.channel(rtTopic(`poll-${m.id}`)).on('postgres_changes', { event: '*', schema: 'public', table: 'poll_answers', filter: `message_id=eq.${m.id}` }, load).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [m.id, load]);
  const mineVote = votes.find((v) => v.user_id === me)?.option;
  async function vote(i: number) {
    if (!me) return;
    if (mineVote === i) {
      setVotes((v) => v.filter((x) => x.user_id !== me));
      await supabase.from('poll_answers').delete().eq('message_id', m.id).eq('user_id', me);
    } else {
      setVotes((v) => [...v.filter((x) => x.user_id !== me), { user_id: me, option: i }]);
      await supabase.from('poll_answers').upsert({ message_id: m.id, user_id: me, conversation_id: m.conversation_id, option: i });
    }
  }
  const total = votes.length;
  const fg = mine ? C.onPrimary : C.ink;
  return (
    <View style={[{ width: 260, borderRadius: 18, padding: 12, gap: 8, }, bubble(mine)]}>
      <Row gap={6}><BarChart3 size={16} color={mine ? C.onPrimary : C.primary} /><T v="tiny" color={mine ? subOn(true) : C.muted}>{t('استطلاع رأي')}</T></Row>
      <T v="bold" color={fg}>{poll.q}</T>
      {poll.options.map((o, i) => {
        const n = votes.filter((v) => v.option === i).length;
        const pct = total ? n / total : 0;
        const on = mineVote === i;
        return (
          <Tap key={i} onPress={() => vote(i)} haptic={false} accessibilityState={{ selected: on }} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: mine ? 'rgba(14,20,48,0.1)' : C.soft }}>
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.round(pct * 100)}%`, backgroundColor: mine ? 'rgba(14,20,48,0.2)' : C.primarySoft }} />
            <Row gap={8} style={{ minHeight: 40, paddingHorizontal: 10 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: mine ? C.onPrimary : C.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (mine ? C.onPrimary : C.primary) : 'transparent' }}>
                {on && <Check size={12} color={mine ? C.primary : C.onPrimary} />}
              </View>
              <T v="small" color={fg} style={{ flex: 1 }}>{o}</T>
              <T v="tiny" color={mine ? subOn(true) : C.muted}>{n}</T>
            </Row>
          </Tap>
        );
      })}
      <T v="tiny" color={mine ? subOn(true) : C.muted}>{total ? t('{0} صوّتوا', [String(total)]) : t('ما حدا صوّت لهلأ')}</T>
    </View>
  );
}

