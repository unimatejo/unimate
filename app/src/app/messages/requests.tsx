import { router } from 'expo-router';
import { BadgeCheck, MessageCircle, ShieldCheck } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, View } from 'react-native';
import Animated, { FadeOutLeft, LinearTransition } from 'react-native-reanimated';

import { Avatar, Button, Card, Empty, Header, Row, Screen, T, Tag } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

type Req = { id: string; context: string | null; first: string | null; from: { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null } | null };

export default function Requests() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Req[]>([]);

  const load = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('conversation_members').select('conversation:conversations(id, context_label, created_by)').eq('user_id', profile.id).eq('state', 'request');
    const out: Req[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const r of (data ?? []) as any[]) {
      const c = r.conversation;
      const [{ data: from }, { data: msg }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, major:majors(name_ar)').eq('id', c.created_by).single(),
        supabase.from('messages').select('body').eq('conversation_id', c.id).order('created_at').limit(1).maybeSingle(),
      ]);
      out.push({ id: c.id, context: c.context_label, first: msg?.body ?? null, from: from as Req['from'] });
    }
    setRows(out);
  }, [profile]);

  useEffect(() => { load(); }, [load]);

  async function answer(id: string, accept: boolean) {
    await supabase.rpc('answer_request', { conv: id, accept });
    setRows((r) => r.filter((x) => x.id !== id));
    if (accept) router.replace({ pathname: '/messages/[id]', params: { id } });
  }

  return (
    <Screen>
      <Header title="طلبات المراسلة" />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 12, paddingBottom: 40 }}
        ListHeaderComponent={
          <Row gap={10} center={false} style={{ backgroundColor: C.white, borderRadius: 20, padding: 14, marginBottom: 4 }}>
            <View style={{ width: 38, height: 38, borderRadius: 13, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}><ShieldCheck size={20} color={C.white} /></View>
            <T v="small" color={C.ink2} style={{ flex: 1 }}>المرسل ما بيعرف إذا شفت رسالته. إذا تجاهلتها، بتختفي بهدوء وما حدا بيعرف.</T>
          </Row>
        }
        renderItem={({ item }) => (
          <Animated.View exiting={FadeOutLeft} layout={LinearTransition}>
            <Card style={{ gap: 12 }}>
              <Row gap={12}>
                <Avatar id={item.from?.id} name={item.from?.full_name} url={item.from?.avatar_url} size={50} />
                <View style={{ flex: 1 }}>
                  <Row gap={5}><T v="bold">{item.from?.full_name}</T><BadgeCheck size={15} color={C.white} fill={C.primary} /></Row>
                  <T v="tiny" color={C.muted}>{item.from?.major?.name_ar ?? ''}</T>
                </View>
              </Row>
              {item.context && <Tag label={item.context} bg={C.primarySoft} fg={C.primary} />}
              {item.first && <View style={{ backgroundColor: C.bg, borderRadius: 16, padding: 12 }}><T v="body">{item.first}</T></View>}
              <Row gap={8}>
                <Button title="قبول" onPress={() => answer(item.id, true)} style={{ flex: 1, minHeight: 44 }} />
                <Button kind="soft" title="تجاهل" onPress={() => answer(item.id, false)} style={{ flex: 1, minHeight: 44 }} />
                <Button kind="white" title="إبلاغ" onPress={() => router.push({ pathname: '/report', params: { type: 'conversation', id: item.id, user: item.from?.id } })} style={{ flex: 1, minHeight: 44, borderWidth: 1, borderColor: '#FFD1DA' }} />
              </Row>
            </Card>
          </Animated.View>
        )}
        ListEmptyComponent={<Empty icon={<MessageCircle size={28} color={C.primary} />} title="ما في طلبات جديدة" body="لما حدا جديد يراسلك، بيوصل هون أول." />}
      />
    </Screen>
  );
}
