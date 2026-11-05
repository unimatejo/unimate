import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Act, Actions, AdminScreen, UniPicker, Filters, Item, Muted, Panel, Sheet, State, Status, confirm, done, fmtDate, go, useAdminRole, useLoad } from '@/components/admin/kit';
import { TITLE_ORDER, TitleBadge, titleLabel } from '@/components/profile/TitleBadge';
import { C, F } from '@/lib/theme';
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
  const owner = useAdminRole() === 'owner'; // importing the staff list is for the owner
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [sel, setSel] = useState<Req | null>(null);
  const [busy, setBusy] = useState(false);
  const [imp, setImp] = useState(false);
  const [text, setText] = useState('');
  const [uni, setUni] = useState('');
  const [res, setRes] = useState<string | null>(null);

  // one person per line: email, title (English key or Arabic, e.g. «عميد»), department
  function parse() {
    return text.split(/\n+/).map((l) => l.split(/[,\t،]/).map((x) => x.trim())).filter((c) => c[0]?.includes('@')).map(([email, title, department]) => {
      const k = TITLE_ORDER.find((o) => o === title || titleLabel(o) === title) ?? 'doctor';
      return { email: email.toLowerCase(), title: k, department: department || null };
    });
  }
  async function importList() {
    const rows = parse();
    if (!rows.length) return;
    setBusy(true);
    const r = await run(supabase.rpc('admin_import_staff_titles', { p_rows: rows, p_university: uni || null }));
    setBusy(false);
    if (!r.ok) return;
    const d = r.data as { saved: number; bad: number; matched: number };
    done(); setRes(t('انحفظ {0} · طابق {1} حساب مسجّل · {2} سطر غلط', [String(d.saved), String(d.matched), String(d.bad)]));
  }
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
      {owner && <Panel onPress={() => { setRes(null); setImp(true); }}>
        <T v="bodyMd">{t('استيراد قائمة الكادر الرسمية')}</T>
        <Muted>{t('الصق قائمة الجامعة (إيميل، رتبة، قسم) وكل واحد بياخد رتبته تلقائي — هلأ ولما يسجّل بعدين.')}</Muted>
      </Panel>}
      <Filters items={[['pending', t('بانتظار')], ['approved', t('موثّقة')], ['rejected', t('مرفوضة')], ['all', t('الكل')]]} value={filter} onChange={setFilter} />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((x) => (
            <Item key={x.id} onPress={() => setSel(x)} title={x.user?.full_name ?? '—'}
              sub={`${titleLabel(x.title)}${x.department ? ' · ' + x.department : ''} · ${fmtDate(x.created_at)}`} end={<Status s={x.status} />} />
          ))}
        </View>
      </State>
      <Sheet open={imp} onClose={() => setImp(false)} title={t('قائمة الكادر الرسمية')}>
        <Muted>{t('كل سطر شخص: الإيميل، الرتبة، القسم. الرتبة بالعربي متل «عميد» أو «أستاذ مشارك».')}</Muted>
        <UniPicker value={uni} onChange={setUni} allowAll={false} />
        <TextInput multiline value={text} onChangeText={setText} placeholder={'dean.it@hu.edu.jo, عميد, كلية تكنولوجيا المعلومات\nahmad@hu.edu.jo, أستاذ مشارك, علم الحاسوب'}
          placeholderTextColor={C.faint} style={{ minHeight: 160, backgroundColor: C.soft, borderRadius: 14, padding: 12, fontFamily: F.body, fontSize: 13, color: C.ink, textAlignVertical: 'top', textAlign: 'left' }} />
        <Muted>{t('{0} شخص جاهزين', [String(parse().length)])}</Muted>
        {res && <T v="bodyMd" color={C.greenInk}>{res}</T>}
        <Actions><Act label={t('استورد')} kind="primary" onPress={importList} loading={busy} disabled={!parse().length} /></Actions>
      </Sheet>
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
