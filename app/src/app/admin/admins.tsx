import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Act, AdminScreen, Filters, Item, Muted, Panel, Pill, SearchBox, Section, State, audit, confirm, done, fmtDate, useLoad } from '@/components/admin/kit';
import type { UserRow } from '@/components/admin/UserDetail';
import { Avatar, T } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type A = { user_id: string; role: string; created_at: string; p: { full_name: string } | null };

/** Owner only: add and remove moderators. Pick people by search instead of pasting ids. */
export default function Admins() {
  const { data, loading, error, reload } = useLoad<A[]>(() => supabase.from('admins').select('*, p:profiles(full_name)').order('created_at') as never, []);
  const [role, setRole] = useState<'moderator' | 'owner'>('moderator');
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const found = useLoad<UserRow[]>(() => term.length >= 2 ? supabase.rpc('admin_find_users', { q: term, lim: 10 }) : Promise.resolve({ data: [], error: null }), [term]);
  useEffect(() => { const x = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(x); }, [q]);

  async function add(u: UserRow) {
    if (!(await confirm(t('تضيف {0}؟', [u.full_name]), role === 'owner' ? t('رح يصير مالك وإله كل الصلاحيات، ومنها إضافة وشيل المشرفين.') : t('رح يصير مشرف ويقدر يراجع البلاغات والمحتوى.'), t('أضف')))) return;
    const { error: e } = await supabase.from('admins').insert({ user_id: u.id, role });
    if (e) { setMsg(e.message); return; }
    await audit('add_admin', 'user', u.id, { role }); done(); setQ(''); setMsg(null); reload();
  }
  async function remove(a: A) {
    if (!(await confirm(t('تشيل {0} من المشرفين؟', [a.p?.full_name ?? '']), t('ما رح يقدر يفتح لوحة الإدارة بعدها.'), t('شيل')))) return;
    await supabase.from('admins').delete().eq('user_id', a.user_id);
    await audit('remove_admin', 'user', a.user_id); done(); reload();
  }

  return (
    <AdminScreen title={t('المشرفين')} subtitle={t('المالك بس بيقدر يضيف ويشيل مشرفين')} ownerOnly>
      <State loading={loading} error={error}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((a) => (
            <Item key={a.user_id} title={a.p?.full_name ?? '—'} sub={fmtDate(a.created_at)}
              end={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pill label={a.role === 'owner' ? t('مالك') : t('مشرف')} tone={a.role === 'owner' ? 'violet' : 'blue'} />
                {a.role !== 'owner' && <Act label={t('شيل')} kind="danger" onPress={() => remove(a)} />}
              </View>} />
          ))}
        </View>
      </State>
      <Section title={t('أضف مشرف')} />
      <Panel>
        <Filters items={[['moderator', t('مشرف')], ['owner', t('مالك')]]} value={role} onChange={setRole} />
        <SearchBox value={q} onChange={setQ} placeholder={t('دوّر بالاسم أو اليوزر أو الإيميل')} />
        {(found.data ?? []).map((u) => (
          <Item key={u.id} start={<Avatar id={u.id} name={u.full_name} url={u.avatar_url} size={38} />} title={u.full_name}
            sub={[u.username ? `@${u.username}` : null, u.university].filter(Boolean).join(' · ')}
            end={u.is_admin ? <Pill label={t('مشرف')} tone="violet" /> : <Act label={t('أضف')} kind="primary" onPress={() => add(u)} />} />
        ))}
        {term.length >= 2 && !found.loading && (found.data ?? []).length === 0 && <Muted>{t('ما لقينا حدا.')}</Muted>}
        {msg && <T v="small" color={C.red}>{msg}</T>}
      </Panel>
    </AdminScreen>
  );
}
