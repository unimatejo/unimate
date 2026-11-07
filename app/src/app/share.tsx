import { router, useLocalSearchParams } from 'expo-router';
import { Check, Search, Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';

import { Avatar, Button, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { normalize } from '@/lib/util';
import { C, F, isDark } from '@/lib/theme';
import { t, ta } from '@/lib/i18n';

type P = { id: string; full_name: string; avatar_url: string | null };

/** Send a post to friends or groups in a chat. */
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
       
      .then(({ data }) => setPeople(((data ?? []) as any[]).map((x) => x.p).filter(Boolean)));
  }, [profile]);

  const shown = useMemo(() => { const k = normalize(q); return k ? people.filter((p) => normalize(p.full_name).includes(k)) : people; }, [people, q]);

  function toggle(id: string) {
    setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function send() {
    if (!profile || busy || picked.size === 0) return;
    setBusy(true);
    let ok = 0;
    const sent: string[] = [];
    try {
      for (const id of picked) {
        try {
          const { data: conv } = await supabase.rpc('start_direct', { target: id, context: t('مشاركة منشور') });
          if (!conv) continue;
          const { error } = await supabase.from('messages').insert({ conversation_id: conv, sender_id: profile.id, kind: 'post_share', ref_id: post, body: note.trim() || null });
          if (!error) { ok++; sent.push(id); }
        } catch { /* try the next person */ }
      }
    } finally { setBusy(false); }
    if (!ok) { Alert.alert(t('تعذّر ذلك'), t('حاول مرة أخرى.')); return; }
    if (ok < picked.size) {
      // keep only the ones that failed selected, so a second tap retries them
      setPicked((s) => { const n = new Set(s); sent.forEach((x) => n.delete(x)); return n; });
      Alert.alert(t('تم الإرسال إلى {0} من {1}. تعذّر إرسال الباقي.', [ok, ok + picked.size - sent.length]));
      return;
    }
    toast(t('تم الإرسال'));
    router.back();
  }

  return (
    <Screen>
      <Header title={t('أرسل لصديق')} />
      <View style={{ paddingHorizontal: 18 }}>
        <Row gap={8} style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 12 }}>
          <Search size={18} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث')} placeholderTextColor={C.faint} style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
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
                {on && <View style={{ position: 'absolute', bottom: -2, left: -2, width: 24, height: 24, borderRadius: 12, backgroundColor: C.primary, borderWidth: 2.5, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}><Check size={13} color={C.onPrimary} strokeWidth={3} /></View>}
              </View>
              <T v="tiny" numberOfLines={1} style={{ textAlign: 'center' }}>{(item.full_name ?? '').split(' ')[0]}</T>
            </Tap>
          );
        }}
        ListEmptyComponent={<T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('تابع أشخاصاً لتتمكن من مراسلتهم.')}</T>}
      />
      {picked.size > 0 && (
        <View style={{ padding: 18, gap: 10, borderTopWidth: 0.5, borderTopColor: C.line, backgroundColor: C.bg }}>
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={note} onChangeText={setNote} placeholder={t('اكتب رسالة...')} placeholderTextColor={C.faint}
            style={{ minHeight: 46, borderRadius: 14, backgroundColor: C.card, paddingHorizontal: 14, fontFamily: F.body, fontSize: 14, color: C.ink, textAlign: ta }} />
          <Button title={picked.size > 1 ? t('أرسل لـ {0}', [picked.size]) : t('أرسل')} icon={<Send size={17} color={C.white} />} onPress={send} loading={busy} />
        </View>
      )}
    </Screen>
  );
}
