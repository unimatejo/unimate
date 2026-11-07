import { View } from 'react-native';

import { AdminScreen, Item, State, fmtDate, go, useLoad } from '@/components/admin/kit';
import { supabase } from '@/lib/supabase';
import { t } from '@/lib/i18n';

type Row = { id: number; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown>; created_at: string; admin: { full_name: string } | null };
const ACTION: Record<string, string> = {
  open_conversation: t('فتح محادثة'), delete_message: t('حذف رسالة'), set_status: t('غيّر حالة الحساب'), edit_profile: t('تعديل ملف شخصي'), remove_avatar: t('أزال صورة'),
  hide: t('أخفى محتوى'), unhide: t('أعاد محتوى'), notify: t('أرسل إشعاراً'), ticket_reply: t('ردّ على الدعم'), add_admin: t('أضاف مشرفًا'), remove_admin: t('أزال مشرفًا'),
};

/** Admin › log: every action any admin took. */
export default function Audit() {
  const { data, loading, error } = useLoad<Row[]>(() => supabase.from('admin_audit_log').select('*, admin:profiles!admin_audit_log_admin_id_fkey(full_name)').order('created_at', { ascending: false }).limit(300) as never, []);
  return (
    <AdminScreen ownerOnly title={t('سجل الإدارة')} subtitle={t('كل إجراء يقوم به المشرف يُسجَّل هنا، ولا يُحذف')}>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((r) => (
            <Item key={r.id}
              title={`${ACTION[r.action] ?? r.action}${r.target_type ? ` · ${r.target_type}` : ''}`}
              sub={[r.admin?.full_name, fmtDate(r.created_at), Object.entries(r.meta ?? {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')].filter(Boolean).join(' · ')}
              onPress={r.target_type === 'conversation' && r.target_id ? () => go(`/admin/chats?id=${r.target_id}`) : r.target_type === 'user' && r.target_id ? () => go(`/admin/user/${r.target_id}`) : undefined} />
          ))}
        </View>
      </State>
    </AdminScreen>
  );
}
