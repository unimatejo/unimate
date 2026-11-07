import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { AdminScreen, Item, Pill, SearchBox, State, Status, go, useLoad } from '@/components/admin/kit';
import type { UserRow } from '@/components/admin/UserDetail';
import { Avatar } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

/** Admin › users: search by name, @username, email or student number. */
export default function UsersPage() {
  const [q, setQ] = useState('');
  const [term, setTerm] = useState('');
  const { data, loading, error } = useLoad<UserRow[]>(() => supabase.rpc('admin_find_users', { q: term, lim: 100 }), [term]);
  useEffect(() => { const x = setTimeout(() => setTerm(q.trim()), 300); return () => clearTimeout(x); }, [q]);

  return (
    <AdminScreen title={t('المستخدمون')} subtitle={t('ابحث بالاسم أو اسم المستخدم أو البريد الإلكتروني أو الرقم الجامعي')}>
      <SearchBox value={q} onChange={setQ} placeholder={t('بحث…')} />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((u) => (
            <Item key={u.id} onPress={() => go(`/admin/user/${u.id}`)}
              start={<Avatar id={u.id} name={u.full_name} url={u.avatar_url} size={42} />}
              title={u.full_name}
              sub={[u.username ? `\u2066@${u.username}\u2069` : null, u.university, u.major, u.email ? `\u2066${u.email}\u2069` : null].filter(Boolean).join(' · ')}
              end={<View style={{ alignItems: 'flex-end', gap: 4 }}><Status s={u.status} />{u.is_admin && <Pill label={t('مشرف')} tone="violet" />}</View>} />
          ))}
        </View>
      </State>
    </AdminScreen>
  );
}
