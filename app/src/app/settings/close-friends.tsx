import { Check, Search, Star } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';

import { Avatar, Empty, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { optimistic } from '@/lib/run';
import { normalize } from '@/lib/util';
import { C, F, isDark } from '@/lib/theme';
import { nm, t, ta } from '@/lib/i18n';

type P = { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null };

/** Settings › close friends (who sees "close friends" stories). */
export default function CloseFriends() {
  const { profile } = useAuth();
  const [people, setPeople] = useState<P[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!profile) return;
    supabase.from('follows').select('p:profiles!follows_follower_id_fkey(id, full_name, avatar_url, major:majors!profiles_major_id_fkey(name_ar, name_en))')
      .eq('followee_id', (profile?.id ?? '')).eq('status', 'accepted')
       
      .then(({ data }) => setPeople(((data ?? []) as any[]).map((x) => x.p).filter(Boolean)));
    supabase.from('close_friends').select('friend_id').eq('owner_id', (profile?.id ?? ''))
      .then(({ data }) => setPicked(new Set((data ?? []).map((x) => x.friend_id))));
  }, [profile]);

  async function toggle(id: string) {
    const on = picked.has(id);
    const set = (v: boolean) => setPicked((s) => { const n = new Set(s); if (v) n.add(id); else n.delete(id); return n; });
    await optimistic(`cf:${id}`, () => set(!on), () => set(on), () => (on
      ? supabase.from('close_friends').delete().eq('owner_id', profile?.id ?? '').eq('friend_id', id)
      : supabase.from('close_friends').insert({ owner_id: profile?.id ?? '', friend_id: id }).then((r) => (r.error?.code === '23505' ? { ...r, error: null } : r))));
  }

  const shown = useMemo(() => {
    const s = normalize(q);
    const list = s ? people.filter((p) => normalize(p.full_name).includes(s)) : people;
    return [...list].sort((a, b) => Number(picked.has(b.id)) - Number(picked.has(a.id)));
  }, [people, q, picked]);

  return (
    <Screen>
      <Header title={t('الأصدقاء المقربين')} subtitle={t('{0} شخص', [picked.size])} />
      <View style={{ paddingHorizontal: 18, gap: 10 }}>
        <Row gap={10} style={{ backgroundColor: C.greenSoft, borderRadius: 18, padding: 12 }}>
          <Star size={18} color={C.green} fill={C.green} />
          <T v="small" color={C.ink2} style={{ flex: 1 }}>{t('بس هدول بيشوفوا الستوري اللي بتحطها «للمقربين»، وما حدا بيعرف إنه بالقائمة.')}</T>
        </Row>
        <Row gap={8} style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('دوّر بين متابعينك')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
        </Row>
      </View>
      <FlatList
        data={shown}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 18, gap: 6 }}
        renderItem={({ item }) => {
          const on = picked.has(item.id);
          return (
            <Tap scale={0.98} onPress={() => toggle(item.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 12 }}>
              <Avatar id={item.id} name={item.full_name} url={item.avatar_url} size={44} />
              <View style={{ flex: 1 }}><T v="bodyMd">{item.full_name}</T><T v="tiny" color={C.muted}>{nm(item.major) ?? ''}</T></View>
              <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: on ? 0 : 2, borderColor: C.line, backgroundColor: on ? C.green : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {on && <Check size={16} color={C.white} strokeWidth={3} />}
              </View>
            </Tap>
          );
        }}
        ListEmptyComponent={<Empty title={t('ما في متابعين لهلأ')} body={t('لما حدا يتابعك بتقدر تضيفه للمقربين.')} />}
      />
    </Screen>
  );
}
