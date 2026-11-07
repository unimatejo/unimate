import { useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Filters, Item, Muted, Panel, Sheet, State, Status, audit, done, fmtDate, useLoad } from '@/components/admin/kit';
import { Field, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

type Ticket = { id: string; user_id: string; subject: string; body: string; status: string; reply: string | null; created_at: string; user: { full_name: string } | null };

/** Admin › support messages from students. */
export default function Support() {
  const [filter, setFilter] = useState<'open' | 'answered' | 'closed' | 'all'>('open');
  const [sel, setSel] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useLoad<Ticket[]>(() => {
    let q = supabase.from('support_tickets').select('*, user:profiles!support_tickets_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    return q as unknown as PromiseLike<{ data: Ticket[] | null; error: { message: string } | null }>;
  }, [filter]);

  async function answer(close: boolean) {
    if (!sel) return;
    setBusy(true);
    try {
      await supabase.from('support_tickets').update({ reply: reply.trim() || sel.reply, status: close ? 'closed' : 'answered' }).eq('id', sel.id);
      if (reply.trim()) await supabase.rpc('admin_notify', { title: 'رد فريق يونيميت', body: reply.trim().slice(0, 120), target: sel.user_id, uni: null });
      await audit('ticket_reply', 'ticket', sel.id, { close });
      done(); setReply(''); setSel(null); reload();
    } finally { setBusy(false); }
  }

  return (
    <AdminScreen title={t('الدعم')}>
      <Filters items={[['open', t('المفتوحة')], ['answered', t('تم الرد عليها')], ['closed', t('المغلقة')], ['all', t('الكل')]]} value={filter} onChange={setFilter} />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((x) => (
            <Item key={x.id} onPress={() => { setSel(x); setReply(x.reply ?? ''); }} title={x.subject}
              sub={`${x.user?.full_name ?? '—'} · ${fmtDate(x.created_at)}\n${x.body.slice(0, 100)}`} end={<Status s={x.status} />} />
          ))}
        </View>
      </State>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.subject}>
        {sel && (
          <>
            <Status s={sel.status} />
            <Muted>{`${sel.user?.full_name ?? '—'} · ${fmtDate(sel.created_at)}`}</Muted>
            <Panel><T v="body" selectable>{sel.body}</T></Panel>
            <Field label={t('الرد (سيصله إشعار)')} value={reply} onChangeText={setReply} multiline style={{ minHeight: 100, paddingTop: 14 }} />
            <Actions>
              <Act label={t('أرسل الرد')} kind="primary" onPress={() => answer(false)} disabled={!reply.trim()} loading={busy} />
              <Act label={t('إغلاق الطلب')} onPress={() => answer(true)} />
            </Actions>
          </>
        )}
      </Sheet>
    </AdminScreen>
  );
}
