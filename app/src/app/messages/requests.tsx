import { router } from 'expo-router';
import { BadgeCheck, MessageCircle, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import Animated, { FadeOutLeft } from 'react-native-reanimated';

import { Avatar, Button, Card, Empty, Header, Row, Screen, T, Tag } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { ListSkeleton } from '@/components/Skeleton';
import { reportError } from '@/lib/errors';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { toast } from '@/lib/toast';
import { C } from '@/lib/theme';
import { nm, t } from '@/lib/i18n';

type Req = { id: string; context: string | null; first: string | null; from: { id: string; full_name: string; avatar_url: string | null; is_verified?: boolean; major: { name_ar: string } | null } | null };

export default function Requests() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Req[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const { data } = await supabase.from('conversation_members').select('conversation:conversations(id, context_label, created_by)').eq('user_id', profile.id).eq('state', 'request');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const convs = ((data ?? []) as any[]).map((r) => r.conversation).filter(Boolean);
      const ids = convs.map((c) => c.id); const senders = [...new Set(convs.map((c) => c.created_by).filter(Boolean))];
      const [{ data: from }, { data: msgs }] = ids.length ? await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, is_verified, major:majors!profiles_major_id_fkey(name_ar, name_en)').in('id', senders),
        supabase.from('messages').select('conversation_id, body, created_at').in('conversation_id', ids).order('created_at'),
      ]) : [{ data: [] }, { data: [] }];
      setRows(convs.map((c) => ({
        id: c.id, context: c.context_label,
        first: (msgs ?? []).find((m) => m.conversation_id === c.id)?.body ?? null,
        from: ((from ?? []) as unknown as Req['from'][]).find((p) => p?.id === c.created_by) ?? null,
      })));
    } catch (e) { reportError(e); toast.error(t('تأكد من الإنترنت وجرّب كمان مرة.')); }
    finally { setLoading(false); }
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function answer(id: string, accept: boolean) {
    if (busy) return;
    setBusy(id);
    const r = await run(supabase.rpc('answer_request', { conv: id, accept }));
    setBusy(null);
    if (!r.ok) return;
    setRows((x) => x.filter((y) => y.id !== id));
    if (accept) router.replace({ pathname: '/messages/[id]', params: { id } });
  }

  return (
    <Screen>
      <Header title={t('طلبات المراسلة')} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <Row gap={10} center={false} style={{ backgroundColor: C.card, borderRadius: 20, padding: 14, marginBottom: 4 }}>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}><ShieldCheck size={20} color={C.white} /></View>
            <T v="small" color={C.ink2} style={{ flex: 1 }}>{t('المرسل ما بيعرف إذا شفت رسالته. إذا تجاهلتها، بتختفي بهدوء وما حدا بيعرف.')}</T>
          </Row>
        }
        renderItem={({ item }) => (
          <Animated.View exiting={FadeOutLeft}>
            <Card style={{ gap: 12 }}>
              <Row gap={12}>
                <Avatar id={item.from?.id} name={item.from?.full_name} url={item.from?.avatar_url} size={50} />
                <View style={{ flex: 1 }}>
                  <Row gap={5}><T v="bold">{item.from?.full_name}</T>{item.from?.is_verified && <BadgeCheck size={15} color={C.white} fill={C.primary} />}</Row>
                  <T v="tiny" color={C.muted}>{nm(item.from?.major)}</T>
                </View>
              </Row>
              {item.context && <Tag label={item.context} bg={C.primarySoft} fg={C.primary} />}
              {item.first && <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 12 }}><T v="body">{item.first}</T></View>}
              <Row gap={8}>
                <Button title={t('قبول')} loading={busy === item.id} disabled={!!busy} onPress={() => answer(item.id, true)} style={{ flex: 1, minHeight: 44 }} />
                <Button kind="soft" title={t('تجاهل')} disabled={!!busy} onPress={() => answer(item.id, false)} style={{ flex: 1, minHeight: 44 }} />
                <Button kind="white" title={t('إبلاغ')} onPress={() => router.push({ pathname: '/report', params: { type: 'conversation', id: item.id, user: item.from?.id } })} style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: C.pinkSoft }} />
              </Row>
            </Card>
          </Animated.View>
        )}
        refreshControl={<RefreshControl refreshing={loading && rows.length > 0} onRefresh={load} />}
        ListEmptyComponent={loading ? <ListSkeleton n={3} /> : <Empty icon={<MessageCircle size={28} color={C.primary} />} title={t('ما في طلبات جديدة')} body={t('لما حدا جديد يراسلك، بيوصل هون أول.')} />}
      />
    </Screen>
  );
}
