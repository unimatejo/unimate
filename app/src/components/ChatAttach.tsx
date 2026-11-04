import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { BadgeCheck, BarChart3, Camera, Check, FileText, Image as ImageIcon, MapPin, Plus, Smile, Sticker, UserRound, X } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, Modal, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn, SlideInDown } from 'react-native-reanimated';

import { canLift, liftSubject } from '../../modules/subject-lift';
import { AvatarCropper } from './AvatarCropper';
import { Avatar, Button, Row, T, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, isDark, shadow } from '@/lib/theme';
import type { Message } from '@/lib/types';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
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
    try { await fn(); } catch (e) { Alert.alert(t('ما انبعت'), e instanceof Error ? e.message : t('جرّب كمان مرة.')); } finally { setBusy(null); }
  }
  const photo = (camera: boolean) => run(camera ? 'camera' : 'photos', async () => {
    const f = await pickMedia({ camera });
    if (!f) return;
    onClose();
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
      <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.35)' }} onPress={onClose} />
        <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.card, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, paddingBottom: 40 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 14 }} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 18 }}>
            {items.map((it) => (
              <Tap key={it.key} onPress={it.onPress} disabled={!!busy} scale={0.92} accessibilityLabel={it.label} style={{ width: '25%', alignItems: 'center', gap: 7 }}>
                <View style={[{ width: 62, height: 62, borderRadius: 31, backgroundColor: it.color, alignItems: 'center', justifyContent: 'center' }, shadow]}>
                  {busy === it.key ? <ActivityIndicator color="#fff" /> : it.icon}
                </View>
                <T v="tiny" color={C.ink2}>{it.label}</T>
              </Tap>
            ))}
          </View>
        </Animated.View>
      </Modal>
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
      <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10, paddingBottom: 40, maxHeight: '85%' }}>
        <T v="h3">{t('استطلاع رأي')}</T>
        <ScrollView contentContainerStyle={{ gap: 10 }} keyboardShouldPersistTaps="handled">
          <TextInput value={q} onChangeText={setQ} placeholder={t('السؤال، مثلاً متى نعمل الدراسة؟')} placeholderTextColor={C.faint} maxLength={140} keyboardAppearance={isDark ? 'dark' : 'light'} style={input} />
          {opts.map((o, i) => (
            <Row key={i} gap={8}>
              <TextInput value={o} onChangeText={(v) => setOpts((x) => x.map((y, j) => (j === i ? v : y)))} placeholder={t('خيار {0}', [String(i + 1)])} placeholderTextColor={C.faint} maxLength={60} keyboardAppearance={isDark ? 'dark' : 'light'} style={[input, { flex: 1 }]} />
              {opts.length > 2 && <Tap onPress={() => setOpts((x) => x.filter((_, j) => j !== i))} accessibilityLabel={t('شيل')}><X size={20} color={C.muted} /></Tap>}
            </Row>
          ))}
          {opts.length < 8 && <Tap onPress={() => setOpts((x) => [...x, ''])} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40 }}><Plus size={18} color={C.primary} /><T v="small" color={C.primary}>{t('ضيف خيار')}</T></Tap>}
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
      <Animated.View entering={SlideInDown.springify().damping(18)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 10, height: '75%' }}>
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
export function StickerPanel({ open, onClose, send }: { open: boolean; onClose: () => void; send: Send }) {
  const { profile } = useAuth();
  const [tab, setTab] = useState<'pack' | 'mine' | 'emoji'>('pack');
  const [mine, setMine] = useState<{ id: string; url: string }[] | null>(null);
  const [pack, setPack] = useState<{ id: string; url: string; animated: boolean }[] | null>(null);
  const [lifted, setLifted] = useState<{ uri: string; original: { uri: string; width: number; height: number } } | null>(null);
  useEffect(() => {
    if (!open || pack) return;
    supabase.from('pack_stickers').select('id, url, animated').order('position').then(({ data }) => setPack((data ?? []) as never), () => setPack([]));
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
    if (canLift()) {
      setMaking(true);
      try { const r = await liftSubject(f.uri); setLifted({ uri: r.uri, original }); }
      catch { setCropSrc(original); }
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

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1 }} onPress={onClose} />
      <Animated.View entering={SlideInDown.springify().damping(18)} style={[{ backgroundColor: C.card, borderTopLeftRadius: 26, borderTopRightRadius: 26, height: 360, paddingTop: 10 }, shadow]}>
        <Row gap={8} style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
          <Tap onPress={() => setTab('pack')} style={{ paddingHorizontal: 14, minHeight: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: tab === 'pack' ? C.primarySoft : 'transparent' }}><T v="small" color={tab === 'pack' ? C.primary : C.muted}>{t('يوني')}</T></Tap>
          <Tap onPress={() => setTab('mine')} style={{ paddingHorizontal: 14, minHeight: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: tab === 'mine' ? C.primarySoft : 'transparent' }}><Row gap={6}><Sticker size={17} color={tab === 'mine' ? C.primary : C.muted} /><T v="small" color={tab === 'mine' ? C.primary : C.muted}>{t('ستيكراتي')}</T></Row></Tap>
          <Tap onPress={() => setTab('emoji')} style={{ paddingHorizontal: 14, minHeight: 36, borderRadius: 18, justifyContent: 'center', backgroundColor: tab === 'emoji' ? C.primarySoft : 'transparent' }}><Row gap={6}><Smile size={17} color={tab === 'emoji' ? C.primary : C.muted} /><T v="small" color={tab === 'emoji' ? C.primary : C.muted}>{t('إيموجي كبير')}</T></Row></Tap>
          <View style={{ flex: 1 }} />
          <Tap onPress={onClose} accessibilityLabel={t('إغلاق')}><X size={20} color={C.muted} /></Tap>
        </Row>
        {tab === 'pack' ? (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 30 }}>
            {pack === null && <ActivityIndicator color={C.primary} style={{ margin: 30 }} />}
            {(pack ?? []).map((s) => (
              <Tap key={s.id} onPress={() => { onClose(); send({ kind: 'sticker', media: s.url }); }} scale={0.88} style={{ width: '25%', aspectRatio: 1, padding: 4 }}>
                <Image source={{ uri: s.url }} style={{ flex: 1 }} contentFit="contain" autoplay />
              </Tap>
            ))}
          </ScrollView>
        ) : tab === 'emoji' ? (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 30 }}>
            {BIG_EMOJI.map((e) => (
              <Tap key={e} onPress={() => { onClose(); send({ kind: 'sticker', body: e }); }} scale={0.85} style={{ width: '16.66%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' }}>
                <T style={{ fontSize: 36, lineHeight: 44 }}>{e}</T>
              </Tap>
            ))}
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingBottom: 30 }}>
            <Tap onPress={make} disabled={making} style={{ width: '25%', aspectRatio: 1, padding: 6 }}>
              <View style={{ flex: 1, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.primary, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {making ? <ActivityIndicator color={C.primary} /> : <Plus size={24} color={C.primary} />}
                <T v="tiny" color={C.primary} style={{ fontSize: 10, textAlign: 'center' }}>{canLift() ? t('من صورة (بنشيل الخلفية)') : t('من صورة')}</T>
              </View>
            </Tap>
            {(mine ?? []).map((s) => (
              <Tap key={s.id} onPress={() => { onClose(); send({ kind: 'sticker', media: s.url }); }} onLongPress={() => Alert.alert(t('تشيل الستيكر؟'), '', [{ text: t('لا'), style: 'cancel' }, { text: t('شيله'), style: 'destructive', onPress: () => remove(s.id) }])}
                style={{ width: '25%', aspectRatio: 1, padding: 6 }}>
                <Image source={{ uri: s.url }} style={{ flex: 1, borderRadius: 14 }} contentFit="contain" />
              </Tap>
            ))}
            {mine && mine.length === 0 && <T v="small" color={C.muted} style={{ width: '70%', padding: 14 }}>{t('اعمل ستيكر من أي صورة، أو اكبس مطوّل على ستيكر بالمحادثة واحفظه. بيضلوا بحسابك.')}</T>}
          </ScrollView>
        )}
      </Animated.View>
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
    </Modal>
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
    <Tap onPress={open} haptic={false} style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 240, padding: 10, borderRadius: 18, backgroundColor: mine ? C.primary : C.card }, mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }]}>
      <View style={{ width: 42, height: 50, borderRadius: 8, backgroundColor: mine ? 'rgba(255,255,255,0.2)' : C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={mine ? '#fff' : C.primary} /> : <T v="tiny" color={mine ? '#fff' : C.primary} style={{ fontSize: 10 }}>{ext}</T>}
      </View>
      <View style={{ flex: 1 }}>
        <T v="bodyMd" numberOfLines={2} color={mine ? '#fff' : C.ink}>{meta.name ?? t('ملف')}</T>
        <T v="tiny" color={mine ? '#DCE3FF' : C.muted}>{[fmtSize(meta.size), t('اكبس لتفتحه')].filter(Boolean).join(' · ')}</T>
      </View>
    </Tap>
  );
}

export function LocationBubble({ m, mine }: { m: Message; mine: boolean }) {
  const [lat, lng] = (m.body ?? '').split(',').map(Number);
  const open = () => {
    const url = Platform.OS === 'ios' ? `maps://?q=${lat},${lng}` : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    Linking.openURL(url).catch(() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${lat},${lng}`));
  };
  return (
    <Tap onPress={open} haptic={false} style={[{ width: 230, borderRadius: 18, overflow: 'hidden', backgroundColor: mine ? C.primary : C.card }, mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }]}>
      <View style={{ height: 100, backgroundColor: isDark ? '#1C2B24' : '#DDEFE6', alignItems: 'center', justifyContent: 'center' }}>
        <MapPin size={38} color="#E5383B" fill="#E5383B" />
      </View>
      <View style={{ padding: 10 }}>
        <T v="bodyMd" color={mine ? '#fff' : C.ink}>{t('موقعي')}</T>
        <T v="tiny" color={mine ? '#DCE3FF' : C.muted}>{t('اكبس لتفتحه بالخرائط')}</T>
      </View>
    </Tap>
  );
}

export function ContactBubble({ m, mine }: { m: Message; mine: boolean }) {
  const [p, setP] = useState<Person | null>(null);
  useEffect(() => { if (m.ref_id) supabase.from('profiles').select('id, full_name, avatar_url, username, is_verified').eq('id', m.ref_id).maybeSingle().then(({ data }) => setP(data as Person | null), () => {}); }, [m.ref_id]);
  return (
    <View style={[{ width: 240, borderRadius: 18, padding: 12, gap: 10, backgroundColor: mine ? C.primary : C.card }, mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }]}>
      <Row gap={10}>
        <Avatar id={m.ref_id} name={p?.full_name ?? m.body ?? ''} url={p?.avatar_url ?? null} size={44} />
        <View style={{ flex: 1 }}>
          <Row gap={4}><T v="bodyMd" numberOfLines={1} color={mine ? '#fff' : C.ink} style={{ flexShrink: 1 }}>{p?.full_name ?? m.body}</T>{p?.is_verified && <BadgeCheck size={14} color="#fff" fill={C.primary} />}</Row>
          {p?.username ? <T v="tiny" color={mine ? '#DCE3FF' : C.muted}>@{p.username}</T> : null}
        </View>
      </Row>
      <Tap onPress={() => m.ref_id && router.push({ pathname: '/user/[id]', params: { id: m.ref_id } })} style={{ minHeight: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(255,255,255,0.2)' : C.primarySoft }}>
        <T v="small" color={mine ? '#fff' : C.primary}>{t('شوف الحساب')}</T>
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
    const ch = supabase.channel(`poll-${m.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'poll_answers', filter: `message_id=eq.${m.id}` }, load).subscribe();
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
  const fg = mine ? '#fff' : C.ink;
  return (
    <View style={[{ width: 260, borderRadius: 18, padding: 12, gap: 8, backgroundColor: mine ? C.primary : C.card }, mine ? { borderBottomRightRadius: 6 } : { borderBottomLeftRadius: 6 }]}>
      <Row gap={6}><BarChart3 size={16} color={mine ? '#fff' : C.primary} /><T v="tiny" color={mine ? '#DCE3FF' : C.muted}>{t('استطلاع رأي')}</T></Row>
      <T v="bold" color={fg}>{poll.q}</T>
      {poll.options.map((o, i) => {
        const n = votes.filter((v) => v.option === i).length;
        const pct = total ? n / total : 0;
        const on = mineVote === i;
        return (
          <Tap key={i} onPress={() => vote(i)} haptic={false} accessibilityState={{ selected: on }} style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: mine ? 'rgba(255,255,255,0.15)' : C.soft }}>
            <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${Math.round(pct * 100)}%`, backgroundColor: mine ? 'rgba(255,255,255,0.3)' : C.primarySoft }} />
            <Row gap={8} style={{ minHeight: 40, paddingHorizontal: 10 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: mine ? '#fff' : C.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? (mine ? '#fff' : C.primary) : 'transparent' }}>
                {on && <Check size={12} color={mine ? C.primary : '#fff'} />}
              </View>
              <T v="small" color={fg} style={{ flex: 1 }}>{o}</T>
              <T v="tiny" color={mine ? '#DCE3FF' : C.muted}>{n}</T>
            </Row>
          </Tap>
        );
      })}
      <T v="tiny" color={mine ? '#DCE3FF' : C.muted}>{total ? t('{0} صوّتوا', [String(total)]) : t('ما حدا صوّت لهلأ')}</T>
    </View>
  );
}

