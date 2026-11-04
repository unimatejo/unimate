import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { ChatViewer, type Member } from '@/components/admin/ChatViewer';
import { Act, AdminScreen, Muted, Panel, fmtDate } from '@/components/admin/kit';
import { Field, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Conv = { id: string; kind: string; title: string | null; context_label: string | null; last_message_at: string; members: (Member & { state: string })[] };

export default function Conversations() {
  const params = useLocalSearchParams<{ id?: string }>();
  const [id, setId] = useState(params.id ?? '');
  const [conv, setConv] = useState<Conv | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function find(v = id.trim()) {
    setErr(null); setConv(null);
    const { data } = await supabase.from('conversations').select('id, kind, title, context_label, last_message_at').eq('id', v).maybeSingle();
    if (!data) { setErr(t('ما لقينا محادثة بهالرقم. لتشوف محادثات شخص، افتحه من صفحة المستخدمين.')); return; }
    const { data: m } = await supabase.from('conversation_members').select('user_id, state, p:profiles(full_name)').eq('conversation_id', v);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConv({ ...data, members: ((m ?? []) as any[]).map((x) => ({ id: x.user_id, name: x.p?.full_name ?? t('؟'), state: x.state })) });
  }
  useEffect(() => { if (params.id) find(params.id); }, [params.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AdminScreen title={t('المحادثات')} subtitle={t('افتح أي محادثة برقمها، أو من صفحة المستخدم أو البلاغ')}>
      <Panel>
        <Field value={id} onChangeText={setId} placeholder={t('رقم المحادثة (UUID)')} autoCapitalize="none" autoCorrect={false} style={{ writingDirection: 'ltr', textAlign: 'left' }} />
        <Act label={t('جيب')} kind="primary" onPress={() => find()} disabled={id.trim().length < 30} />
      </Panel>
      {err && <Panel><T v="small" color={C.red}>{err}</T></Panel>}
      {conv && (
        <Panel>
          <T v="h3">{conv.title ?? conv.members.map((m) => m.name).join('، ')}</T>
          <Muted>{[conv.context_label, t('آخر رسالة {0}', [fmtDate(conv.last_message_at)]), conv.members.map((m) => `${m.name}${m.state === 'request' ? ` (${t('طلب')})` : m.state === 'left' ? ` (${t('طلع')})` : ''}`).join('، ')].filter(Boolean).join(' · ')}</Muted>
          <ChatViewer conversationId={conv.id} members={conv.members} />
        </Panel>
      )}
    </AdminScreen>
  );
}
