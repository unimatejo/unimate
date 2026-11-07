import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, TextInput, View } from 'react-native';

import { SheetModal } from '@/components/chat/ChatExtras';
import { Bone } from '@/components/ui/Skeleton';
import { Avatar, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sendLater } from '@/lib/chatOutbox';
import { C, F, isDark } from '@/lib/theme';
import { t, ta } from '@/lib/i18n';

type Chat = { id: string; kind: string; name: string; avatar: string | null; other?: string; at: string };

/** Pick a chat and send it a place from the campus map (a location message with the place's name). */
export function ShareToChat({ place, onClose }: { place: { lat: number; lng: number; name: string } | null; onClose: () => void }) {
  const { profile } = useAuth();
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!place || !profile || chats) return;
    (async () => {
      const { data } = await supabase.from('conversation_members').select('conversation:conversations(id, kind, title, last_message_at)').eq('user_id', profile.id).eq('state', 'active');
       
      const convs = ((data ?? []) as any[]).map((r) => r.conversation).filter((c) => c && (c.kind === 'direct' || c.kind === 'group'));
      const direct = convs.filter((c) => c.kind === 'direct').map((c) => c.id);
      const { data: others } = direct.length
        ? await supabase.from('conversation_members').select('conversation_id, user_id, profile:profiles!conversation_members_user_id_fkey(full_name, avatar_url)').in('conversation_id', direct).neq('user_id', profile.id)
        : { data: [] };
       
      const by = Object.fromEntries(((others ?? []) as any[]).map((o) => [o.conversation_id, o]));
      setChats(convs.map((c) => ({
        id: c.id, kind: c.kind, at: c.last_message_at ?? '',
        name: c.kind === 'direct' ? by[c.id]?.profile?.full_name ?? '' : c.title ?? t('مجموعة'),
        avatar: c.kind === 'direct' ? by[c.id]?.profile?.avatar_url ?? null : null, other: by[c.id]?.user_id,
      })).filter((c) => c.name).sort((a, b) => b.at.localeCompare(a.at)));
    })().catch(() => setChats([]));
  }, [place, profile, chats]);

  const shown = useMemo(() => (chats ?? []).filter((c) => !q.trim() || c.name.includes(q.trim())).slice(0, 40), [chats, q]);

  async function share(c: Chat) {
    if (!place || !profile || busy) return;
    setBusy(c.id);
    const body = `${place.lat.toFixed(6)},${place.lng.toFixed(6)},${place.name.replace(/\s+/g, ' ').trim()}`;
    // through the outbox: without internet it waits on the phone and goes once there's a connection
    await sendLater({ conversation_id: c.id, sender_id: profile.id, kind: 'location', body });
    setBusy(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onClose();
    router.push({ pathname: '/messages/[id]', params: { id: c.id } });
  }

  return (
    <SheetModal open={!!place} onClose={onClose} style={{ maxHeight: '80%' }}>
      <T v="h3">{t('شارك {0} مع…', [place?.name ?? ''])}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 46, borderRadius: 16, backgroundColor: C.soft, paddingHorizontal: 14 }}>
        <Search size={18} color={C.muted} />
        <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث عن زميل أو مجموعة')} placeholderTextColor={C.muted}
          style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} accessibilityLabel={t('ابحث عن زميل أو مجموعة')} />
      </View>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 2 }} keyboardShouldPersistTaps="handled">
        {chats === null && [0, 1, 2, 3].map((i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}><Bone w={46} h={46} r={23} /><Bone w="50%" h={14} /></View>)}
        {chats?.length === 0 && <T v="small" color={C.muted} style={{ paddingVertical: 20, textAlign: 'center' }}>{t('ما عندك محادثات لهلأ.')}</T>}
        {shown.map((c) => (
          <Tap key={c.id} onPress={() => share(c)} disabled={!!busy} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, opacity: busy && busy !== c.id ? 0.5 : 1 }}>
            {c.kind === 'direct' ? <Avatar id={c.other} name={c.name} url={c.avatar} size={46} />
              : <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><Users size={20} color={C.ink} /></View>}
            <T v="bodyMd" numberOfLines={1} style={{ flex: 1 }}>{c.name}</T>
            <View style={{ minHeight: 34, paddingHorizontal: 16, borderRadius: 17, backgroundColor: C.primary, justifyContent: 'center' }}>
              <T v="bold" color={C.onPrimary} style={{ fontSize: 13 }}>{busy === c.id ? '…' : t('ابعت')}</T>
            </View>
          </Tap>
        ))}
      </ScrollView>
    </SheetModal>
  );
}
