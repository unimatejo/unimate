import { Ban } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';

import { Avatar, Button, Empty, Header, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { run } from '@/lib/run';
import { C } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t } from '@/lib/i18n';

type B = { blocked_id: string; created_at: string; p: { full_name: string; avatar_url: string | null } | null };

/** Settings › blocked accounts. */
export default function Blocked() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<B[]>([]);

  useEffect(() => {
    if (!profile) return;
    supabase.from('blocks').select('blocked_id, created_at, p:profiles!blocks_blocked_id_fkey(full_name, avatar_url)').eq('blocker_id', (profile?.id ?? '')).order('created_at', { ascending: false })
      .then(({ data }) => setRows((data ?? []) as unknown as B[]));
  }, [profile]);

  function unblock(id: string) {
    const who = rows.find((x) => x.blocked_id === id)?.p?.full_name ?? '';
    Alert.alert(t('إلغاء حظر {0}؟', [who]), t('سيتمكن من رؤية حسابك ومراسلتك مرة أخرى.'), [
      { text: t('إلغاء'), style: 'cancel' },
      { text: t('إلغاء الحظر'), style: 'destructive', onPress: async () => {
        const prev = rows;
        setRows((r) => r.filter((x) => x.blocked_id !== id));
        const r = await run(supabase.from('blocks').delete().eq('blocker_id', profile?.id ?? '').eq('blocked_id', id));
        if (!r.ok) setRows(prev);
      } },
    ]);
  }

  return (
    <Screen>
      <Header title={t('المحظورون')} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.blocked_id}
        contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 6 }}
        renderItem={({ item }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, backgroundColor: C.card, borderRadius: 18, paddingHorizontal: 12 }}>
            <Avatar id={item.blocked_id} name={item.p?.full_name} url={item.p?.avatar_url} size={44} />
            <View style={{ flex: 1 }}><T v="bodyMd">{item.p?.full_name ?? t('مستخدم')}</T><T v="tiny" color={C.muted}>{t('تم الحظر')} {timeAgo(item.created_at)}</T></View>
            <Button kind="soft" title={t('إلغاء الحظر')} onPress={() => unblock(item.blocked_id)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
          </View>
        )}
        ListEmptyComponent={<Empty icon={<Ban size={28} color={C.primary} />} title={t('لم تحظر أحدًا')} body={t('لن يتمكن من تحظره من رؤية ملفك الشخصي أو مراسلتك، ولن يعرف أنك حظرته.')} />}
      />
    </Screen>
  );
}
