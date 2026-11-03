import { fmtNum, supabase, useLoad } from '../lib';
import { State, Status, Top } from '../ui';

type Stats = {
  users: number; users_7d: number; active_today: number; posts: number; posts_7d: number; messages_7d: number;
  reports_open: number; tickets_open: number; aliases_pending: number; places_pending: number; ads_live: number;
  per_university: { id: string; slug: string; name_ar: string; data_status: string; users: number; posts_7d: number }[];
};

export default function Overview() {
  const { data: s, loading, error } = useLoad<Stats>(() => supabase.rpc('admin_stats'), []);
  return (
    <div className="stack">
      <Top title="نظرة عامة" sub="الأرقام بتتحدّث كل ما تفتح الصفحة" />
      <State loading={loading} error={error}>
        {s && (
          <>
            <div className="stats">
              <div className="stat"><b>{fmtNum(s.users)}</b><span>طالب مسجّل · {fmtNum(s.users_7d)} هالأسبوع</span></div>
              <div className="stat"><b>{fmtNum(s.active_today)}</b><span>نشروا آخر 24 ساعة</span></div>
              <div className="stat"><b>{fmtNum(s.posts_7d)}</b><span>منشور هالأسبوع · {fmtNum(s.posts)} الكل</span></div>
              <div className="stat"><b>{fmtNum(s.messages_7d)}</b><span>رسالة هالأسبوع</span></div>
              <a href="#reports" className={`stat ${s.reports_open ? 'alert' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}><b>{fmtNum(s.reports_open)}</b><span>بلاغ مفتوح</span></a>
              <a href="#support" className={`stat ${s.tickets_open ? 'alert' : ''}`} style={{ textDecoration: 'none', color: 'inherit' }}><b>{fmtNum(s.tickets_open)}</b><span>طلب دعم مفتوح</span></a>
              <a href="#campus" className="stat" style={{ textDecoration: 'none', color: 'inherit' }}><b>{fmtNum(s.aliases_pending + s.places_pending)}</b><span>ألقاب وأماكن بانتظارك</span></a>
              <div className="stat"><b>{fmtNum(s.ads_live)}</b><span>إعلان شغّال</span></div>
            </div>
            <div className="panel">
              <h2 style={{ marginBottom: 10 }}>الجامعات</h2>
              <div className="scroll"><table>
                <thead><tr><th>الجامعة</th><th>الطلاب</th><th>منشورات الأسبوع</th><th>البيانات</th></tr></thead>
                <tbody>{s.per_university.map((u) => (
                  <tr key={u.id}><td>{u.name_ar}</td><td>{fmtNum(u.users)}</td><td>{fmtNum(u.posts_7d)}</td><td><Status s={u.data_status} /></td></tr>
                ))}</tbody>
              </table></div>
            </div>
          </>
        )}
      </State>
    </div>
  );
}
