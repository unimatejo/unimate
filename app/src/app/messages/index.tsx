import { router, useFocusEffect } from 'expo-router';
import { Camera, MessageCircle, PenSquare, Search, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Empty, Header, IconButton, Row, Screen, Segmented, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { timeAgo } from '@/lib/util';

type Item = {
  id: string; kind: string; title: string; other?: { id: string; full_name: string; avatar_url: string | null } | null;
  last?: string | null; last_at: string; unread: boolean; streak: number; state: string;
};

export default function Messages() {
  const { profile } = useAuth();
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const [requests, setRequests] = useState(0);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const { data: mine } = await supabase.from('conversation_members')
      .select('state, last_read_at, conversation:conversations(id, kind, title, context_label, streak_days, last_message_at)')
      .eq('user_id', (profile?.id ?? '')).neq('state', 'left');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (mine ?? []) as any[];
    setRequests(rows.filter((r) => r.state === 'request').length);
    const convIds = rows.map((r) => r.conversation.id);
    const { data: members } = convIds.length ? await supabase.from('conversation_members')
      .select('conversation_id, user_id, profile:profiles(id, full_name, avatar_url)').in('conversation_id', convIds).neq('user_id', (profile?.id ?? '')) : { data: [] };
    const out: Item[] = [];
    for (const r of rows.filter((x) => x.state === 'active')) {
      const c = r.conversation;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const other = c.kind === 'direct' ? ((members ?? []) as any[]).find((m) => m.conversation_id === c.id)?.profile : null;
      const { data: last } = await supabase.from('messages').select('body, kind, sender_id').eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
      out.push({
        id: c.id, kind: c.kind, state: r.state, title: other?.full_name ?? c.title ?? 'محادثة', other,
        last: last ? (last.kind === 'image' ? 'صورة' : last.kind === 'view_once' ? 'صورة بتنشاف مرة' : last.kind === 'voice' ? 'رسالة صوتية' : last.body) : c.context_label,
        last_at: c.last_message_at, unread: !r.last_read_at || new Date(c.last_message_at) > new Date(r.last_read_at),
        streak: c.streak_days,
      });
    }
    out.sort((a, b) => b.last_at.localeCompare(a.last_at));
    setItems(out);
    setLoading(false);
  }, [profile]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = items.filter((i) => (tab === 0 ? i.kind === 'direct' : i.kind !== 'direct') && (!q || i.title.includes(q)));

  return (
    <Screen>
      <Header title="الرسائل" right={<IconButton label="رسالة جديدة" onPress={() => router.push('/search')}><PenSquare size={20} color={C.ink} /></IconButton>} />
      <FlatList
        data={shown}
        keyExtractor={(i) => i.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 40, gap: 4 }}
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 8 }}>
            <Row gap={8} style={{ minHeight: 46, borderRadius: 15, backgroundColor: '#E7EAF3', paddingHorizontal: 14 }}>
              <Search size={19} color={C.muted} />
              <TextInput value={q} onChangeText={setQ} placeholder="ابحث بالمحادثات" placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 15, textAlign: 'right', color: C.ink }} />
            </Row>
            <Segmented items={['الخاص', 'الجروبات']} value={tab} onChange={setTab} />
            {requests > 0 && (
              <Tap onPress={() => router.push('/messages/requests')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 20, backgroundColor: C.primarySoft }}>
                <View style={{ width: 46, height: 46, borderRadius: 16, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' }}><MessageCircle size={22} color={C.white} /></View>
                <View style={{ flex: 1 }}>
                  <T v="bold">{requests} طلبات مراسلة جديدة</T>
                  <T v="small" color="#1E3A8A">من زملاء بموادك. إنت بتقرر تقبل أو لا.</T>
                </View>
              </Tap>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 40)}>
            <Tap scale={0.98} onPress={() => router.push({ pathname: '/messages/[id]', params: { id: item.id } })}
              style={[{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 74, paddingHorizontal: 12, borderRadius: 20, backgroundColor: C.white }, item.unread && shadow]}>
              {item.kind === 'direct' ? <Avatar id={item.other?.id} name={item.title} url={item.other?.avatar_url} size={52} /> :
                <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: C.greenSoft, alignItems: 'center', justifyContent: 'center' }}><Users size={24} color={C.greenInk} /></View>}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Row gap={6}>
                  <T v={item.unread ? 'bold' : 'bodyMd'} numberOfLines={1} style={{ flex: 1 }}>{item.title}</T>
                  {item.streak > 1 && <T v="tiny" color="#E8590C">🔥 {item.streak}</T>}
                  <T v="tiny" color={item.unread ? C.primary : C.muted}>{timeAgo(item.last_at)}</T>
                </Row>
                <T v="small" numberOfLines={1} color={item.unread ? C.ink : C.muted}>{item.last ?? ''}</T>
              </View>
              {item.kind === 'direct' && <Camera size={21} color={C.faint} />}
            </Tap>
          </Animated.View>
        )}
        ListEmptyComponent={loading ? undefined : <Empty icon={<MessageCircle size={28} color={C.primary} />} title="ما في محادثات لهلأ" body="ابدأ من بروفايل زميل، أو من جروب مادتك." />}
      />
    </Screen>
  );
}
