import { router, useLocalSearchParams } from 'expo-router';
import { Check, Search, Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';

import { Avatar, Button, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';

type P = { id: string; full_name: string; avatar_url: string | null };

export default function Share() {
  const { post } = useLocalSearchParams<{ post: string }>();
  const { profile } = useAuth();
  const [people, setPeople] = useState<P[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    supabase.from('follows').select('p:profiles!follows_followee_id_fkey(id, full_name, avatar_url)').eq('follower_id', (profile?.id ?? '')).eq('status', 'accepted').limit(300)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => setPeople(((data ?? []) as any[]).map((x) => x.p).filter(Boolean)));
  }, [profile]);

  const shown = useMemo(() => (q.trim() ? people.filter((p) => p.full_name.includes(q.trim())) : people), [people, q]);

  function toggle(id: string) {
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function send() {
    setBusy(true);
    let ok = 0;
    for (const id of picked) {
      const { data: conv } = await supabase.rpc('start_direct', { target: id, context: 'مشاركة منشور' });
      if (!conv) continue;
      const { error } = await supabase.from('messages').insert({ conversation_id: conv, sender_id: (profile?.id ?? ''), kind: 'post_share', ref_id: post, body: note.trim() || null });
      if (!error) ok++;
    }
    setBusy(false);
    if (!ok) { Alert.alert('ما زبط', 'جرّب كمان مرة.'); return; }
    router.back();
  }

  return (
    <Screen>
      <Header title="أرسل لصديق" />
      <View style={{ paddingHorizontal: 18 }}>
        <Row gap={8} style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="دوّر" placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: 'right' }} />
        </Row>
      </View>
      <FlatList
        data={shown}
        numColumns={4}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 18, gap: 16 }}
        columnWrapperStyle={{ gap: 8 }}
        renderItem={({ item }) => {
          const on = picked.has(item.id);
          return (
            <Tap onPress={() => toggle(item.id)} style={{ width: '23.5%', alignItems: 'center', gap: 6 }}>
              <View>
                <Avatar id={item.id} name={item.full_name} url={item.avatar_url} size={62} />
                {on && <View style={{ position: 'absolute', bottom: -2, left: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, borderWidth: 2.5, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Check size={13} color={C.white} strokeWidth={3} /></View>}
              </View>
              <T v="tiny" numberOfLines={1} style={{ textAlign: 'center' }}>{item.full_name.split(' ')[0]}</T>
            </Tap>
          );
        }}
        ListEmptyComponent={<T v="small" color={C.muted} style={{ textAlign: 'center' }}>تابع ناس عشان تبعتلهم.</T>}
      />
      {picked.size > 0 && (
        <View style={{ padding: 18, gap: 10, borderTopWidth: 0.5, borderTopColor: C.line, backgroundColor: C.bg }}>
          <TextInput value={note} onChangeText={setNote} placeholder="اكتب رسالة..." placeholderTextColor={C.faint}
            style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 14, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: 'right' }} />
          <Button title={picked.size > 1 ? `أرسل لـ ${picked.size}` : 'أرسل'} icon={<Send size={17} color={C.white} />} onPress={send} loading={busy} />
        </View>
      )}
    </Screen>
  );
}
