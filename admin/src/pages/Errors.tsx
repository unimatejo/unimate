import { fmtDate, supabase, useLoad } from '../lib';
import { State, Top } from '../ui';

type E = { id: number; fatal: boolean; message: string; stack: string | null; screen: string | null; platform: string | null; app_version: string | null; created_at: string; user: { full_name: string } | null };

export default function Errors() {
  const { data, loading, error } = useLoad<E[]>(() => supabase.from('client_errors').select('*, user:profiles(full_name)').order('created_at', { ascending: false }).limit(200) as never, []);
  return (
    <div className="stack">
      <Top title="أخطاء التطبيق" sub="أي خطأ بيصير على تلفونات الطلاب بيوصل هون لحاله" />
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="panel scroll"><table>
          <thead><tr><th>متى</th><th>الخطأ</th><th>الشاشة</th><th>الجهاز</th><th>المستخدم</th></tr></thead>
          <tbody>{(data ?? []).map((e) => (
            <tr key={e.id}>
              <td className="small muted">{fmtDate(e.created_at)}</td>
              <td>{e.fatal && <span className="tag red">خطير</span>} <span className="ltr">{e.message}</span>
                {e.stack && <details className="small muted"><summary>التفاصيل</summary><pre className="ltr" style={{ whiteSpace: 'pre-wrap', maxWidth: 520 }}>{e.stack.slice(0, 1500)}</pre></details>}</td>
              <td className="small">{e.screen}</td><td className="small">{e.platform} {e.app_version}</td><td className="small">{e.user?.full_name ?? '—'}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </State>
    </div>
  );
}
