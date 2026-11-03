import { fmtDate, supabase, useLoad } from '../lib';
import { State, Top } from '../ui';

type Row = { id: number; action: string; target_type: string | null; target_id: string | null; meta: Record<string, unknown>; created_at: string; admin: { full_name: string } | null };
const ACTION: Record<string, string> = {
  open_conversation: 'فتح محادثة', delete_message: 'حذف رسالة', set_status: 'غيّر حالة حساب', edit_profile: 'عدّل بروفايل', remove_avatar: 'شال صورة',
  hide: 'خبّى محتوى', unhide: 'رجّع محتوى', notify: 'بعت إشعار', ticket_reply: 'رد على دعم',
};

export default function Audit() {
  const { data, loading, error } = useLoad<Row[]>(() => supabase.from('admin_audit_log').select('*, admin:profiles(full_name)').order('created_at', { ascending: false }).limit(300) as never, []);
  return (
    <div className="stack">
      <Top title="سجل الإدارة" sub="كل إجراء بيعمله مشرف بينسجل هون، وما بينحذف" />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="panel scroll"><table>
          <thead><tr><th>متى</th><th>المشرف</th><th>الإجراء</th><th>على</th><th>تفاصيل</th></tr></thead>
          <tbody>{(data ?? []).map((r) => (
            <tr key={r.id}>
              <td className="small muted">{fmtDate(r.created_at)}</td><td className="small">{r.admin?.full_name}</td>
              <td>{ACTION[r.action] ?? r.action}</td>
              <td className="small">{r.target_type} {r.target_type === 'conversation' && r.target_id ? <a href={`#chats?id=${r.target_id}`} onClick={() => setTimeout(() => location.reload(), 0)}>فتح</a> : null}</td>
              <td className="small muted">{Object.entries(r.meta ?? {}).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' · ')}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </State>
    </div>
  );
}
