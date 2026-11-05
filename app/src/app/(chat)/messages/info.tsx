import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import {
  Bell, BellOff, Ban, ChevronLeft, ChevronRight, FileText, Flag, Images, Link2, LogOut, MessageCircleMore, MoreHorizontal, Search, ShieldCheck, Timer, UserPlus, UserRound, Users, UsersRound,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, ScrollView, Share, TextInput, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SheetModal } from '@/components/chat/ChatExtras';
import { ImageViewer } from '@/components/media/ImageViewer';
import { TitleBadge } from '@/components/profile/TitleBadge';
import { Avatar, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { flip, isAR, t, ta } from '@/lib/i18n';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F, R, isDark } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { Conversation, Message, VanishMode } from '@/lib/types';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { timeAgo } from '@/lib/util';

export type Member = { user_id: string; full_name: string; username: string | null; avatar_url: string | null; role: 'owner' | 'admin' | 'member'; state: string; academic_title: string | null; title_verified: boolean | null; is_verified: boolean | null };

const VANISH: { key: VanishMode; label: string }[] = [
  { key: 'never', label: t('أبداً') }, { key: 'after_view', label: t('بعد ما تنشاف') }, { key: 'h24', label: t('بعد 24 ساعة') }, { key: 'd7', label: t('بعد أسبوع') },
];

export const inviteUrl = (code: string) => `https://app.unimate.my/join/${code}`;

async function copyOrShare(text: string) {
  if (Platform.OS === 'web') {
    try { await navigator.clipboard.writeText(text); toast(t('انتسخ الرابط')); return; } catch { /* fall through to share */ }
  }
  Share.share({ message: text }).catch(() => {});
}

/** One row of the details list, Instagram style: icon, title, grey subtitle, chevron. */
function InfoRow({ icon, title, sub, onPress, danger, right }: { icon: ReactNode; title: string; sub?: string; onPress?: () => void; danger?: boolean; right?: ReactNode }) {
  return (
    <Tap onPress={onPress} disabled={!onPress} haptic={false} accessibilityRole="button" accessibilityLabel={title}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingHorizontal: 18, paddingVertical: 8 }}>
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <View style={{ flex: 1, gap: 1 }}>
        <T v="bodyMd" color={danger ? C.danger : C.ink} style={{ fontSize: 16 }}>{title}</T>
        {sub ? <T v="small" color={C.muted} numberOfLines={1}>{sub}</T> : null}
      </View>
      {right ?? (onPress && !danger ? <ChevronLeft size={20} color={C.faint} style={isAR ? undefined : { transform: [{ scaleX: -1 }] }} /> : null)}
    </Tap>
  );
}

function Action({ icon, label, onPress, on }: { icon: ReactNode; label: string; onPress: () => void; on?: boolean }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ alignItems: 'center', gap: 6, minWidth: 66, minHeight: 60 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? C.inverse : C.soft }}>{icon}</View>
      <T v="tiny" color={C.ink2}>{label}</T>
    </Tap>
  );
}

/** The group picture: its photo, or two member faces overlapping like Instagram. */
function GroupFace({ conv, members, size = 96 }: { conv: Conversation; members: Member[]; size?: number }) {
  if (conv.photo_url) return <Image source={{ uri: conv.photo_url }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  const two = members.slice(0, 2);
  if (two.length < 2) return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Users size={size * 0.4} color={C.ink} /></View>;
  const s = size * 0.72;
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', top: 0, left: 0 }}><Avatar id={two[1].user_id} name={two[1].full_name} url={two[1].avatar_url} size={s} /></View>
      <View style={{ position: 'absolute', bottom: 0, right: 0, borderRadius: s, borderWidth: 3, borderColor: C.bg }}><Avatar id={two[0].user_id} name={two[0].full_name} url={two[0].avatar_url} size={s} /></View>
    </View>
  );
}

/** Instagram-like chat details: header, quick actions, settings rows, then shared photos and files. */
export default function ChatInfo() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [role, setRole] = useState<string>('member');
  const [muted, setMuted] = useState(false);
  const [tab, setTab] = useState<0 | 1>(0);
  const [media, setMedia] = useState<{ id: string; path: string; url: string | null }[] | null>(null);
  const [files, setFiles] = useState<Message[]>([]);
  const [gallery, setGallery] = useState<number | null>(null);
  const [sheet, setSheet] = useState<null | 'edit' | 'controls' | 'privacy' | 'options' | 'add' | 'search' | 'vanish'>(null);
  const [invite, setInvite] = useState<string | null>(null);

  const group = conv?.kind === 'group' || conv?.kind === 'community';
  const manager = role === 'owner' || role === 'admin';
  const other = conv?.kind === 'direct' ? members.find((m) => m.user_id !== profile?.id) : undefined;
  const title = conv?.kind === 'direct' ? other?.full_name ?? '' : conv?.title || members.map((m) => m.full_name.split(' ')[0]).slice(0, 3).join('، ');

  const load = useCallback(async () => {
    if (!id) return;
    const [{ data: c }, { data: ms }, { data: r }, { data: me }] = await Promise.all([
      supabase.from('conversations').select('*').eq('id', id).maybeSingle(),
      supabase.rpc('group_members', { conv: id }),
      supabase.rpc('conv_role', { conv: id }),
      supabase.from('conversation_members').select('muted').eq('conversation_id', id).eq('user_id', profile?.id ?? '').maybeSingle(),
    ]);
    if (c) setConv(c as Conversation);
    setMembers((ms ?? []) as Member[]);
    setRole((r as string) ?? 'member');
    setMuted(!!me?.muted);
  }, [id, profile?.id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  // shared photos and files
  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('messages').select('id, conversation_id, sender_id, kind, body, media_url, ref_id, is_saved, viewed_once_at, vanishes_at, deleted_at, created_at')
        .eq('conversation_id', id).in('kind', ['image', 'file', 'text']).is('deleted_at', null).order('created_at', { ascending: false }).limit(300);
      const live = ((data ?? []) as Message[]).filter((m) => m.is_saved || !m.vanishes_at || new Date(m.vanishes_at) > new Date());
      const pics = live.filter((m) => m.kind === 'image' && m.media_url).slice(0, 90);
      const urls = await Promise.all(pics.map((m) => (/^https?:/.test(m.media_url!) ? Promise.resolve(m.media_url) : mediaUrl('chat', m.media_url))));
      setMedia(pics.map((m, i) => ({ id: m.id, path: m.media_url!, url: urls[i] })));
      setFiles(live.filter((m) => m.kind === 'file' || (m.kind === 'text' && /https?:\/\/\S+/.test(m.body ?? ''))).slice(0, 60));
    })();
  }, [id]);

  async function toggleMute() {
    const v = !muted; setMuted(v);
    const { error } = await supabase.from('conversation_members').update({ muted: v }).eq('conversation_id', id).eq('user_id', profile?.id ?? '');
    if (error) setMuted(!v); else toast(v ? t('كتمت المحادثة') : t('رجعت الإشعارات'));
  }
  async function openInvite() {
    const { data, error } = await supabase.rpc('group_invite_link', { conv: id, p_reset: false });
    if (error) { Alert.alert(t('ما زبط'), t('بس المشرفين بيقدروا يشوفوا رابط الدعوة.')); return; }
    setInvite(data as string);
  }
  async function leave() {
    Alert.alert(t('تطلع من الجروب؟'), t('ما رح توصلك رسائله، وبتقدر ترجع إذا حدا ضافك.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('اطلع'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.rpc('group_leave', { conv: id });
        if (error) { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
        router.replace('/messages');
      } },
    ]);
  }
  async function block() {
    if (!other || !profile) return;
    Alert.alert(t('تحظر {0}؟', [other.full_name]), t('ما رح يقدر يبعتلك أو يشوف حسابك.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('احظر'), style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('blocks').insert({ blocker_id: profile.id, blocked_id: other.user_id });
        if (error && error.code !== '23505') { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); return; }
        toast(t('انحظر')); router.replace('/messages');
      } },
    ]);
  }

  const names = useMemo(() => {
    const first = members.filter((m) => m.user_id !== profile?.id).map((m) => m.username || m.full_name.split(' ')[0]);
    return first.length > 3 ? `${first.slice(0, 3).join('، ')} ${t('و{0} غيرهم', [String(first.length - 3)])}` : first.join('، ');
  }, [members, profile?.id]);

  const cell = Math.floor(width / 3);
  if (!conv) return <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.muted} /></SafeAreaView>;

  const header = (
    <View>
      <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 18, gap: 10 }}>
        {conv.kind === 'direct'
          ? <Avatar id={other?.user_id} name={other?.full_name} url={other?.avatar_url} size={96} />
          : <GroupFace conv={conv} members={members.filter((m) => m.user_id !== profile?.id)} />}
        <View style={{ alignItems: 'center', gap: 2, paddingHorizontal: 24 }}>
          <Row gap={6} style={{ justifyContent: 'center' }}>
            <T v="h2" numberOfLines={2} style={{ textAlign: 'center' }}>{title}</T>
            {conv.kind === 'direct' && <TitleBadge title={other?.academic_title} verified={other?.title_verified} />}
          </Row>
          {conv.kind === 'direct' && other?.username ? <T v="small" color={C.muted}>{`⁦@${other.username}⁩`}</T> : null}
          {group && conv.context_label ? <T v="small" color={C.muted}>{conv.context_label}</T> : null}
          {group && manager && <Tap onPress={() => setSheet('edit')} haptic={false} style={{ minHeight: 36, justifyContent: 'center' }}><T v="bodyMd" color={C.primaryDark}>{t('تغيير الاسم والصورة')}</T></Tap>}
          {conv.kind === 'direct' && other && <Tap onPress={() => router.push({ pathname: '/user/[id]', params: { id: other.user_id } })} style={{ marginTop: 8, minHeight: 36, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.soft, justifyContent: 'center' }}><T v="bold" style={{ fontSize: 13 }}>{t('عرض البروفايل')}</T></Tap>}
        </View>
      </View>

      <Row gap={4} style={{ justifyContent: 'space-evenly', paddingHorizontal: 12, paddingBottom: 14 }}>
        {conv.kind === 'direct'
          ? <Action icon={<UserRound size={21} color={C.ink} />} label={t('البروفايل')} onPress={() => other && router.push({ pathname: '/user/[id]', params: { id: other.user_id } })} />
          : (conv.kind === 'group' && (manager || conv.members_can_add)) ? <Action icon={<UserPlus size={21} color={C.ink} />} label={t('إضافة')} onPress={() => setSheet('add')} />
          : null}
        <Action icon={<Search size={21} color={C.ink} />} label={t('بحث')} onPress={() => setSheet('search')} />
        <Action icon={muted ? <BellOff size={21} color={C.onInverse} /> : <Bell size={21} color={C.ink} />} label={muted ? t('مكتومة') : t('كتم')} on={muted} onPress={toggleMute} />
        <Action icon={<MoreHorizontal size={21} color={C.ink} />} label={t('خيارات')} onPress={() => setSheet('options')} />
      </Row>

      <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 6 }}>
        {group && <InfoRow icon={<UsersRound size={23} color={C.ink} />} title={t('الأعضاء')} sub={names ? `${members.length} · ${names}` : t('{0} · إنت بس لحد هلأ', [String(members.length)])} onPress={() => router.push({ pathname: '/messages/members', params: { id } })} />}
        {conv.kind === 'group' && manager && <InfoRow icon={<Link2 size={23} color={C.ink} />} title={t('رابط الدعوة')} sub={invite ? inviteUrl(invite) : t('اكبس عشان تشوف الرابط')} onPress={() => (invite ? copyOrShare(inviteUrl(invite)) : openInvite())} />}
        {group && manager && <InfoRow icon={<MessageCircleMore size={23} color={C.ink} />} title={t('التحكم بالمحادثة')} sub={t('مين بيضيف، الموافقة على الدخول، الرسائل المختفية')} onPress={() => setSheet('controls')} />}
        {conv.kind === 'direct' && <InfoRow icon={<Timer size={23} color={C.ink} />} title={t('الرسائل المختفية')} sub={VANISH.find((v) => v.key === conv.vanish)?.label} onPress={() => setSheet('vanish')} />}
        <InfoRow icon={<ShieldCheck size={23} color={C.ink} />} title={t('الخصوصية والأمان')} sub={conv.block_screenshots ? t('منع التصوير شغّال') : undefined} onPress={() => setSheet('privacy')} />
        <InfoRow icon={<Users size={23} color={C.ink} />} title={conv.kind === 'direct' && other ? t('اعمل جروب مع {0}', [other.full_name.split(' ')[0]]) : t('إنشاء جروب جديد')} onPress={() => router.push({ pathname: '/messages/new', params: { group: '1' } })} />
        <InfoRow icon={<Flag size={23} color={C.ink} />} title={t('في مشكلة؟')} sub={t('إبلاغ عن المحادثة')} onPress={() => router.push({ pathname: '/report', params: { type: 'conversation', id, user: other?.user_id ?? '' } })} />
        {conv.kind === 'direct' && <InfoRow icon={<Ban size={23} color={C.danger} />} title={t('حظر')} danger onPress={block} />}
        {group && <InfoRow icon={<LogOut size={23} color={C.danger} />} title={t('مغادرة الجروب')} danger onPress={leave} />}
      </View>

      <Row style={{ borderTopWidth: 1, borderTopColor: C.line }}>
        {([[0, Images, t('الوسائط')], [1, FileText, t('الملفات والروابط')]] as const).map(([k, Icon, label]) => (
          <Tap key={k} onPress={() => setTab(k)} haptic={false} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === k }}
            style={{ flex: 1, height: 48, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: tab === k ? C.ink : 'transparent' }}>
            <Icon size={22} color={tab === k ? C.ink : C.muted} />
          </Tap>
        ))}
      </Row>
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: C.bg }}>
      <Row style={{ height: 52, paddingHorizontal: 8 }}>
        <Tap onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/messages/[id]', params: { id } }))} accessibilityLabel={t('رجوع')}
          style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: C.soft }}>
          <ChevronRight size={22} color={C.ink} style={flip} />
        </Tap>
      </Row>
      {tab === 0 ? (
        <FlatList
          data={media ?? []}
          keyExtractor={(m) => m.id}
          numColumns={3}
          ListHeaderComponent={header}
          ListEmptyComponent={media ? <T v="small" color={C.muted} style={{ textAlign: 'center', padding: 30 }}>{t('ما في صور بالمحادثة لسا.')}</T> : <ActivityIndicator color={C.muted} style={{ padding: 30 }} />}
          renderItem={({ item, index }) => (
            <Tap onPress={() => setGallery(index)} haptic={false} accessibilityLabel={t('صورة')} style={{ width: cell, height: cell, padding: 1 }}>
              {item.url ? <Image source={{ uri: item.url }} style={{ flex: 1, backgroundColor: C.soft }} contentFit="cover" transition={150} /> : <View style={{ flex: 1, backgroundColor: C.soft }} />}
            </Tap>
          )}
          contentContainerStyle={{ paddingBottom: 60 }}
        />
      ) : (
        <FlatList
          data={files}
          keyExtractor={(m) => m.id}
          ListHeaderComponent={header}
          ListEmptyComponent={<T v="small" color={C.muted} style={{ textAlign: 'center', padding: 30 }}>{t('ما في ملفات أو روابط لسا.')}</T>}
          renderItem={({ item }) => {
            let name = '';
            if (item.kind === 'file') { try { name = JSON.parse(item.body ?? '{}').name ?? ''; } catch { /* */ } }
            const link = item.kind === 'text' ? /https?:\/\/\S+/.exec(item.body ?? '')?.[0] : null;
            return (
              <InfoRow icon={item.kind === 'file' ? <FileText size={22} color={C.ink} /> : <Link2 size={22} color={C.ink} />}
                title={item.kind === 'file' ? name || t('ملف') : link ?? ''} sub={timeAgo(item.created_at)}
                onPress={async () => {
                  const url = item.kind === 'file' ? await mediaUrl('chat', item.media_url) : link;
                  if (url) { const { openURL } = await import('expo-linking'); openURL(url); }
                }} />
            );
          }}
          contentContainerStyle={{ paddingBottom: 60 }}
        />
      )}

      <ImageViewer images={gallery !== null ? (media ?? []).map((m) => m.url ?? '').filter(Boolean) : undefined} index={gallery ?? 0} onClose={() => setGallery(null)} />
      <EditSheet open={sheet === 'edit'} conv={conv} onClose={() => setSheet(null)} onSaved={load} />
      <ControlsSheet open={sheet === 'controls'} conv={conv} onClose={() => setSheet(null)} onSaved={load} />
      <VanishSheet open={sheet === 'vanish' || false} conv={conv} onClose={() => setSheet(null)} onSaved={load} />
      <PrivacySheet open={sheet === 'privacy'} conv={conv} canEdit={!group || manager} onClose={() => setSheet(null)} onSaved={load} />
      <AddSheet open={sheet === 'add'} conv={conv} members={members} onClose={() => setSheet(null)} onSaved={load} />
      <SearchSheet open={sheet === 'search'} conv={conv} onClose={() => setSheet(null)} />
      <SheetModal open={sheet === 'options'} onClose={() => setSheet(null)} style={{ gap: 4 }}>
        {conv.kind === 'group' && manager && <InfoRow icon={<Link2 size={22} color={C.ink} />} title={t('شارك رابط الدعوة')} onPress={async () => { setSheet(null); const { data } = await supabase.rpc('group_invite_link', { conv: id, p_reset: false }); if (data) copyOrShare(inviteUrl(data as string)); }} />}
        {conv.kind === 'group' && manager && <InfoRow icon={<Link2 size={22} color={C.ink} />} title={t('غيّر رابط الدعوة')} sub={t('الرابط القديم بيوقف')} onPress={async () => { setSheet(null); const { data } = await supabase.rpc('group_invite_link', { conv: id, p_reset: true }); if (data) { setInvite(data as string); toast(t('انعمل رابط جديد')); } }} />}
        <InfoRow icon={muted ? <Bell size={22} color={C.ink} /> : <BellOff size={22} color={C.ink} />} title={muted ? t('رجّع الإشعارات') : t('اكتم الإشعارات')} onPress={() => { setSheet(null); toggleMute(); }} />
        <InfoRow icon={<Flag size={22} color={C.danger} />} title={t('إبلاغ')} danger onPress={() => { setSheet(null); router.push({ pathname: '/report', params: { type: 'conversation', id, user: other?.user_id ?? '' } }); }} />
        {group && <InfoRow icon={<LogOut size={22} color={C.danger} />} title={t('مغادرة الجروب')} danger onPress={() => { setSheet(null); leave(); }} />}
      </SheetModal>
    </SafeAreaView>
  );
}

type SheetProps = { open: boolean; conv: Conversation; onClose: () => void; onSaved: () => void };

function EditSheet({ open, conv, onClose, onSaved }: SheetProps) {
  const [name, setName] = useState(conv.title ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(conv.title ?? ''); }, [open, conv.title]);
  async function photo() {
    const f = await pickMedia({ crop: 'avatar' }).catch(() => null);
    if (!f) return;
    setBusy(true);
    try {
      const me = (await supabase.auth.getUser()).data.user?.id ?? '';
      const path = await uploadFile('avatars', me, f);
      const { error } = await supabase.rpc('group_update', { conv: conv.id, p_photo: publicUrl('avatars', path) });
      if (error) throw error;
      onSaved(); toast(t('تغيّرت صورة الجروب'));
    } catch { Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); } finally { setBusy(false); }
  }
  async function save() {
    if (name.trim().length < 2 || name.trim() === conv.title) { onClose(); return; }
    setBusy(true);
    const { error } = await supabase.rpc('group_update', { conv: conv.id, p_title: name.trim() });
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط'), t('بس المشرفين بيقدروا يغيّروا الاسم.')); return; }
    onSaved(); onClose();
  }
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 14 }}>
      <T v="h2">{t('تغيير الاسم والصورة')}</T>
      <Row gap={12}>
        <Tap onPress={photo} disabled={busy} accessibilityLabel={t('غيّر الصورة')} style={{ width: 64, height: 64, borderRadius: 32, overflow: 'hidden', backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}>
          {conv.photo_url ? <Image source={{ uri: conv.photo_url }} style={{ width: 64, height: 64 }} contentFit="cover" /> : <Images size={24} color={C.ink} />}
        </Tap>
        <View style={{ flex: 1 }}><Field value={name} onChangeText={setName} placeholder={t('اسم الجروب')} maxLength={60} /></View>
      </Row>
      {conv.photo_url ? <Tap onPress={async () => { await supabase.rpc('group_update', { conv: conv.id, p_clear_photo: true }); onSaved(); }} haptic={false} style={{ minHeight: 40, justifyContent: 'center' }}><T v="small" color={C.danger}>{t('شيل الصورة')}</T></Tap> : null}
      <Tap onPress={save} disabled={busy} style={{ minHeight: 50, borderRadius: 25, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={C.onPrimary} /> : <T v="bold" color={C.onPrimary}>{t('حفظ')}</T>}
      </Tap>
    </SheetModal>
  );
}

function VanishPick({ conv, onSaved }: { conv: Conversation; onSaved: () => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {VANISH.map((v) => {
        const on = conv.vanish === v.key;
        return (
          <Tap key={v.key} accessibilityRole="radio" accessibilityState={{ selected: on }}
            onPress={async () => { const { error } = await supabase.rpc('set_conversation_vanish', { conv: conv.id, mode: v.key }); if (error) Alert.alert(t('ما زبط'), t('بس المشرفين بيقدروا يغيّروها.')); else onSaved(); }}
            style={{ width: '48.5%', minHeight: 54, borderRadius: R.md, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: on ? C.inverse : C.line, backgroundColor: on ? C.inverse : C.soft }}>
            <T v="bold" color={on ? C.onInverse : C.ink} style={{ fontSize: 14 }}>{v.label}</T>
          </Tap>
        );
      })}
    </View>
  );
}

function VanishSheet({ open, conv, onClose, onSaved }: SheetProps) {
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 14 }}>
      <T v="h2">{t('متى تختفي الرسائل؟')}</T>
      <VanishPick conv={conv} onSaved={onSaved} />
    </SheetModal>
  );
}

function ControlsSheet({ open, conv, onClose, onSaved }: SheetProps) {
  async function set(k: 'p_members_can_add' | 'p_approve_joins', v: boolean) {
    const { error } = await supabase.rpc('group_settings', { conv: conv.id, [k]: v });
    if (error) Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')); else onSaved();
  }
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 12 }}>
      <T v="h2">{t('التحكم بالمحادثة')}</T>
      {conv.kind === 'group' && (
        <View style={{ backgroundColor: C.soft, borderRadius: R.lg, paddingHorizontal: 14 }}>
          <Toggle value={!!conv.members_can_add} onChange={(v) => set('p_members_can_add', v)} label={t('الكل بيقدر يضيف أعضاء')} hint={t('إذا مسكّرة، بس المشرفين بيضيفوا')} />
          <Toggle value={!!conv.approve_joins} onChange={(v) => set('p_approve_joins', v)} label={t('الموافقة على الدخول من الرابط')} hint={t('اللي بيدخل من رابط الدعوة بيستنى موافقة')} />
        </View>
      )}
      <T v="bold">{t('الرسائل المختفية')}</T>
      <VanishPick conv={conv} onSaved={onSaved} />
    </SheetModal>
  );
}

function PrivacySheet({ open, conv, canEdit, onClose, onSaved }: SheetProps & { canEdit: boolean }) {
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 12 }}>
      <T v="h2">{t('الخصوصية والأمان')}</T>
      <View style={{ backgroundColor: C.soft, borderRadius: R.lg, paddingHorizontal: 14, opacity: canEdit ? 1 : 0.6 }}>
        <Toggle value={conv.block_screenshots} onChange={async (v) => { if (!canEdit) return; await supabase.from('conversations').update({ block_screenshots: v }).eq('id', conv.id); onSaved(); }}
          label={t('منع تصوير هاي المحادثة')} hint={canEdit ? t('أندرويد: الشاشة بتطلع سودا. آيفون: بنخفيها وبنبلغ الطرف الثاني') : t('بس المشرفين بيغيّروها')} />
      </View>
      <T v="tiny" color={C.muted}>{t('اضغط مطوّل على أي رسالة عشان تحفظها أو تبلّغ عنها.')}</T>
    </SheetModal>
  );
}

type P = { id: string; full_name: string; username: string | null; avatar_url: string | null };
function AddSheet({ open, conv, members, onClose, onSaved }: SheetProps & { members: Member[] }) {
  const [q, setQ] = useState('');
  const [list, setList] = useState<P[]>([]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const inside = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  useEffect(() => {
    if (!open) { setPicked([]); setQ(''); return; }
    const h = setTimeout(async () => {
      const s = q.trim().replace(/^@/, '').replace(/[,()]/g, ' ');
      const me = (await supabase.auth.getUser()).data.user?.id ?? '';
      if (!s) {
        const { data } = await supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, full_name, username, avatar_url)').eq('follower_id', me).eq('status', 'accepted').limit(80);
         
        setList(((data ?? []) as any[]).map((x) => x.p).filter(Boolean));
      } else {
        const { data } = await supabase.from('profiles').select('id, full_name, username, avatar_url').or(`full_name.ilike.%${s}%,username.ilike.%${s.toLowerCase()}%`).neq('id', me).limit(30);
        setList((data ?? []) as P[]);
      }
    }, 250);
    return () => clearTimeout(h);
  }, [q, open]);
  async function add() {
    if (!picked.length) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('group_add_members', { conv: conv.id, uids: picked });
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط'), t('بس المشرفين بيقدروا يضيفوا بهالجروب.')); return; }
    toast(t('انضاف {0}', [String(data ?? picked.length)])); onSaved(); onClose();
  }
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 10, maxHeight: '85%' }}>
      <T v="h2">{t('إضافة أعضاء')}</T>
      <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث بالاسم أو اليوزر')} placeholderTextColor={C.muted}
        style={{ minHeight: 46, borderRadius: R.md, backgroundColor: C.soft, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
      <ScrollView style={{ maxHeight: 380 }}>
        {list.filter((p) => !inside.has(p.id)).map((p) => {
          const on = picked.includes(p.id);
          return (
            <Tap key={p.id} haptic={false} onPress={() => setPicked((x) => (on ? x.filter((y) => y !== p.id) : [...x, p.id]))}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58 }}>
              <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={44} />
              <View style={{ flex: 1 }}><T v="bodyMd" numberOfLines={1}>{p.full_name}</T>{p.username ? <T v="tiny" color={C.muted}>{`⁦@${p.username}⁩`}</T> : null}</View>
              <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : 'transparent' }} />
            </Tap>
          );
        })}
      </ScrollView>
      <Tap onPress={add} disabled={busy || !picked.length} style={{ minHeight: 50, borderRadius: 25, backgroundColor: picked.length ? C.primary : C.soft, alignItems: 'center', justifyContent: 'center' }}>
        {busy ? <ActivityIndicator color={C.onPrimary} /> : <T v="bold" color={picked.length ? C.onPrimary : C.muted}>{picked.length ? t('ضيف {0}', [String(picked.length)]) : t('اختار ناس')}</T>}
      </Tap>
    </SheetModal>
  );
}

function SearchSheet({ open, conv, onClose }: { open: boolean; conv: Conversation; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Message[]>([]);
  useEffect(() => {
    if (!open) { setQ(''); setHits([]); return; }
    const s = q.trim().replace(/[%_,()]/g, ' ');
    if (s.length < 2) { setHits([]); return; }
    const h = setTimeout(async () => {
      const { data } = await supabase.from('messages').select('id, conversation_id, sender_id, kind, body, media_url, is_saved, viewed_once_at, vanishes_at, deleted_at, created_at')
        .eq('conversation_id', conv.id).eq('kind', 'text').is('deleted_at', null).ilike('body', `%${s}%`).order('created_at', { ascending: false }).limit(40);
      setHits(((data ?? []) as Message[]).filter((m) => m.is_saved || !m.vanishes_at || new Date(m.vanishes_at) > new Date()));
    }, 250);
    return () => clearTimeout(h);
  }, [q, open, conv.id]);
  return (
    <SheetModal open={open} onClose={onClose} style={{ gap: 10, maxHeight: '85%' }}>
      <T v="h2">{t('بحث بالمحادثة')}</T>
      <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} autoFocus value={q} onChangeText={setQ} placeholder={t('اكتب كلمة…')} placeholderTextColor={C.muted}
        style={{ minHeight: 46, borderRadius: R.md, backgroundColor: C.soft, paddingHorizontal: 14, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
      <ScrollView style={{ maxHeight: 420 }}>
        {q.trim().length >= 2 && !hits.length ? <T v="small" color={C.muted} style={{ textAlign: 'center', padding: 20 }}>{t('ما لقينا إشي.')}</T> : null}
        {hits.map((m) => (
          <View key={m.id} style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, gap: 2 }}>
            <T v="body" numberOfLines={3}>{m.body}</T>
            <T v="tiny" color={C.muted}>{timeAgo(m.created_at)}</T>
          </View>
        ))}
      </ScrollView>
    </SheetModal>
  );
}
