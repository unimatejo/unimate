import { useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Filters, Item, Muted, Panel, Sheet, State, Status, confirm, done, fmtDate, go, useLoad } from '@/components/admin/kit';
import { TitleBadge, titleLabel } from '@/components/TitleBadge';
import { T } from '@/components/ui';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

type Req = {
  id: string; user_id: string; title: string; department: string | null; note: string | null; status: string; created_at: string;
  user: { full_name: string; username: string | null; account_type: string | null } | null;
};

/** Faculty / staff asking for a verified title: check, then approve or reject. */
export default function Titles() {
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [sel, setSel] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);
  const { data, loading, error, reload } = useLoad<Req[]>(() => {
    let q = supabase.from('title_requests').select('*, user:profiles!title_requests_user_id_fkey(full_name, username, account_type)').order('created_at', { ascending: false }).limit(200);
    if (filter !== 'all') q = q.eq('status', filter);
    return q as unknown as PromiseLike<{ data: Req[] | null; error: { message: string } | null }>;
  }, [filter]);

  async function review(approve: boolean) {
    if (!sel) return;
    const ok = await confirm(approve ? t('توثيق الحساب؟') : t('رفض الطلب؟'),
      approve ? t('بيظهر «{0}» جنب اسم {1} للكل.', [titleLabel(sel.title), sel.user?.full_name ?? '']) : t('بيوصله إشعار إنه ما انوثّق.'),
      approve ? t('وثّق') : t('ارفض'));
    if (!ok) return;
    setBusy(true);
    const r = await run(supabase.rpc('admin_review_title', { p_request: sel.id, p_approve: approve }));
    setBusy(false);
    if (!r.ok) return;
    done(); setSel(null); reload();
  }

  return (
    <AdminScreen title={t('توثيق الأساتذة')} subtitle={t('الدكاترة والموظفين اللي طلبوا لقب')}>
      <Filters items={[['pending', t('بانتظار')], ['approved', t('موثّقة')], ['rejected', t('مرفوضة')], ['all', t('الكل')]]} value={filter} onChange={setFilter} />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((x) => (
            <Item key={x.id} onPress={() => setSel(x)} title={x.user?.full_name ?? '—'}
              sub={`${titleLabel(x.title)}${x.department ? ' · ' + x.department : ''} · ${fmtDate(x.created_at)}`} end={<Status s={x.status} />} />
          ))}
        </View>
      </State>
      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.user?.full_name}>
        {sel && (
          <>
            <TitleBadge title={sel.title} verified size="md" />
            <Muted>{[sel.user?.username ? '@' + sel.user.username : null, sel.user?.account_type === 'faculty' ? t('إيميله من الجامعة (مش إيميل طالب)') : null, fmtDate(sel.created_at)].filter(Boolean).join(' · ')}</Muted>
            {sel.department ? <Panel><T v="small">{t('القسم')}: {sel.department}</T></Panel> : null}
            {sel.note ? <Panel><T v="body" selectable>{sel.note}</T></Panel> : null}
            <Actions>
              {sel.status === 'pending' && <Act label={t('وثّق')} kind="green" onPress={() => review(true)} loading={busy} />}
              {sel.status === 'pending' && <Act label={t('ارفض')} kind="danger" onPress={() => review(false)} />}
              <Act label={t('افتح المستخدم')} onPress={() => { const u = sel.user_id; setSel(null); go(`/admin/user/${u}`); }} />
            </Actions>
          </>
        )}
      </Sheet>
    </AdminScreen>
  );
}
