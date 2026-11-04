import { useState } from 'react';
import { View } from 'react-native';

import { ChatViewer, type Member } from '@/components/admin/ChatViewer';
import { Act, Actions, AdminScreen, Filters, Item, Muted, Panel, Pill, Sheet, State, Status, audit, confirm, done, fmtDate, useLoad } from '@/components/admin/kit';
import { UserDetail } from '@/components/admin/UserDetail';
import { Field, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type Report = {
  id: string; reporter_id: string; target_type: string; target_id: string; target_user: string | null; reason: string; details: string | null;
  also_blocked: boolean; status: string; action_taken: string | null; created_at: string; resolved_at: string | null;
  reporter: { full_name: string } | null; accused: { full_name: string } | null;
};
const TYPE: Record<string, string> = { user: t('حساب'), post: t('منشور'), comment: t('تعليق'), story: t('ستوري'), message: t('رسالة'), conversation: t('محادثة') };

function Target({ r, onChanged }: { r: Report; onChanged: () => void }) {
  const table = r.target_type === 'post' ? 'posts' : r.target_type === 'comment' ? 'comments' : r.target_type === 'story' ? 'stories' : null;
  const { data, reload } = useLoad<{ id: string; body?: string; caption?: string; is_hidden: boolean } | null>(
    () => table ? supabase.from(table).select('*').eq('id', r.target_id).maybeSingle() : Promise.resolve({ data: null, error: null }), [r.id]);
  const [conv, setConv] = useState<{ id: string; members: Member[] } | null>(null);
  const [miss, setMiss] = useState(false);

  async function hide(v: boolean) {
    if (!table) return;
    if (v && !(await confirm(t('تخبّيه عن الكل؟'), t('المحتوى ما بيبيّن لحدا لحد ما ترجّعه.'), t('خبّيه')))) return;
    await supabase.from(table).update({ is_hidden: v }).eq('id', r.target_id);
    await audit(v ? 'hide' : 'unhide', r.target_type, r.target_id, { report: r.id });
    done(); reload(); onChanged();
  }
  async function loadConv() {
    let cid: string | null = r.target_id;
    if (r.target_type === 'message') {
      const { data: c } = await supabase.rpc('admin_message_conversation', { msg: r.target_id });
      cid = (c as string | null) ?? null;
    }
    if (!cid) { setMiss(true); return; }
    const { data: mem } = await supabase.from('conversation_members').select('user_id, p:profiles(full_name)').eq('conversation_id', cid);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConv({ id: cid, members: ((mem ?? []) as any[]).map((x) => ({ id: x.user_id, name: x.p?.full_name ?? t('؟') })) });
  }

  if (r.target_type === 'user' && r.target_user) return <UserDetail id={r.target_user} />;
  if (r.target_type === 'conversation' || r.target_type === 'message') {
    if (miss) return <Muted>{t('الرسالة انحذفت نهائياً.')}</Muted>;
    return conv ? <ChatViewer conversationId={conv.id} members={conv.members} presetReason={t('بلاغ: {0}', [r.reason])} /> : <Act label={t('جيب المحادثة')} kind="primary" onPress={loadConv} />;
  }
  if (!table) return <Muted>{t('رقم الهدف: {0}', [r.target_id])}</Muted>;
  if (!data) return <Muted>{t('المحتوى انحذف أو مش موجود.')}</Muted>;
  return (
    <Panel>
      <T v="body">{data.body ?? data.caption ?? '—'}</T>
      <Actions>{data.is_hidden ? <Act label={t('رجّعه')} onPress={() => hide(false)} /> : <Act label={t('خبّيه عن الكل')} kind="danger" onPress={() => hide(true)} />}</Actions>
    </Panel>
  );
}

export default function Reports() {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [sel, setSel] = useState<Report | null>(null);
  const [note, setNote] = useState('');
  const { data, loading, error, reload } = useLoad<Report[]>(() => {
    let q = supabase.from('reports').select('*, reporter:profiles!reports_reporter_id_fkey(full_name), accused:profiles!reports_target_user_fkey(full_name)').order('created_at', { ascending: false }).limit(200);
    if (filter === 'open') q = q.in('status', ['open', 'reviewing']);
    return q as unknown as PromiseLike<{ data: Report[] | null; error: { message: string } | null }>;
  }, [filter]);

  async function setStatus(r: Report, status: string) {
    const { data: me } = await supabase.auth.getUser();
    await supabase.from('reports').update({ status, action_taken: note || null, resolved_by: me.user?.id, resolved_at: ['resolved', 'dismissed'].includes(status) ? new Date().toISOString() : null }).eq('id', r.id);
    await audit(`report_${status}`, 'report', r.id, { note });
    done(); setNote(''); setSel(null); reload();
  }

  return (
    <AdminScreen title={t('البلاغات')} subtitle={t('البلاغ سري، والمبلّغ عليه ما بيعرف مين بلّغ')}>
      <Filters items={[['open', t('المفتوحة')], ['all', t('الكل')]]} value={filter} onChange={setFilter} />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((r) => (
            <Item key={r.id} onPress={() => { setSel(r); setNote(''); }} title={r.reason}
              sub={`${TYPE[r.target_type] ?? r.target_type} · ${t('على {0}', [r.accused?.full_name ?? '—'])} · ${t('من {0}', [r.reporter?.full_name ?? '—'])} · ${fmtDate(r.created_at)}${r.details ? `\n${r.details.slice(0, 80)}` : ''}`}
              end={<Status s={r.status} />} />
          ))}
        </View>
      </State>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.reason}>
        {sel && (
          <>
            <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}><Status s={sel.status} /><Pill label={TYPE[sel.target_type] ?? sel.target_type} />{sel.also_blocked && <Pill label={t('المبلّغ حظره')} tone="orange" />}</View>
            <Muted>{t('من {0} على {1} · {2}', [sel.reporter?.full_name ?? '—', sel.accused?.full_name ?? '—', fmtDate(sel.created_at)])}</Muted>
            {sel.details && <Panel><T v="body">{sel.details}</T></Panel>}
            {sel.action_taken && <Panel style={{ backgroundColor: C.greenSoft }}><T v="small" color={C.greenInk}>{t('الإجراء: {0}', [sel.action_taken])}</T></Panel>}
            <Target r={sel} onChanged={reload} />
            <Field label={t('ملاحظة الإجراء')} value={note} onChangeText={setNote} placeholder={t('مثلاً: انحذف المنشور وتوقف الحساب أسبوع')} />
            <Actions>
              {sel.status === 'open' && <Act label={t('قيد المراجعة')} onPress={() => setStatus(sel, 'reviewing')} />}
              <Act label={t('انحل')} kind="green" onPress={() => setStatus(sel, 'resolved')} />
              <Act label={t('ارفض البلاغ')} onPress={() => setStatus(sel, 'dismissed')} />
            </Actions>
          </>
        )}
      </Sheet>
    </AdminScreen>
  );
}
