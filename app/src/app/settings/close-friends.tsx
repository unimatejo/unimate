import { Check, Search, Star } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { Avatar, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';

type P = { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null };

export default function CloseFriends() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<P[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!profile) return;
    supabase.from('follows').select('p:profiles!follows_follower_id_fkey(id, full_name, avatar_url, major:majors(name_ar))')
      .eq('followee_id', (profile?.id ?? '')).eq('status', 'accepted')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => setPeople(((data ?? []) as any[]).map((x) => x.p).filter(Boolean)));
    supabase.from('close_friends').select('friend_id').eq('owner_id', (profile?.id ?? ''))
      .then(({ data }) => setPicked(new Set((data ?? []).map((x) => x.friend_id))));
  }, [profile]);

  async function toggle(id: string) {
    const on = picked.has(id);
    setPicked((s) => { const n = new Set(s); if (on) n.delete(id); else n.add(id); return n; });
    if (on) await supabase.from('close_friends').delete().eq('owner_id', (profile?.id ?? '')).eq('friend_id', id);
    else await supabase.from('close_friends').insert({ owner_id: (profile?.id ?? ''), friend_id: id });
  }

  const shown = useMemo(() => {
    const s = q.trim();
    const list = s ? people.filter((p) => p.full_name.includes(s)) : people;
    return [...list].sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)));
  }, [people, q, picked]);

  return (
    <Screen>
      <Header title="الأصدقاء المقربين" subtitle={`${picked.size} شخص`} />
      <View style={{ paddingHorizontal: 18, gap: 10 }}>
        <Row gap={10} style={{ backgroundColor: C.greenSoft, borderRadius: 18, padding: 12 }}>
          <Star size={18} color={C.green} fill={C.green} />
          <T v="small" color={C.ink2} style={{ flex: 1 }}>بس هدول بيشوفوا الستوري اللي بتحطها «للمقربين»، وما حدا بيعرف إنه بالقائمة.</T>
        </Row>
        <Row gap={8} style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.white, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder="دوّر بين متابعينك" placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: 'right' }} />
        </Row>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 18, gap: 6 }}
        renderItem={({ item }) => {
          const on = picked.has(item.id);
          return (
            <Tap scale={0.98} onPress={() => toggle(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 12 }}>
              <Avatar id={item.id} name={item.full_name} url={item.avatar_url} size={44} />
              <View style={{ flex: 1 }}><T v="bodyMd">{item.full_name}</T><T v="tiny" color={C.muted}>{item.major?.name_ar ?? ''}</T></View>
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: on ? 0 : 2, borderColor: C.line, backgroundColor: on ? C.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Check size={16} color={C.white} strokeWidth={3} />}
              </View>
            </Tap>
          );
        }}
        ListEmptyComponent={<Empty title="ما في متابعين لهلأ" body="لما حدا يتابعك بتقدر تضيفه للمقربين." />}
      />
    </Screen>
  );
}
