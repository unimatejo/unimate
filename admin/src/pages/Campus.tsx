import { useEffect, useState } from 'react';

import { audit, clearUniCache, fmtDate, supabase, useLoad, useUnis, type Uni } from '../lib';
import { State, Status, Top } from '../ui';

type College = { id: string; name_ar: string; name_en: string | null; verified: boolean; majors: { id: string; name_ar: string; degree: string; verified: boolean }[] };
type Link = { id?: string; kind: string; title: string; url: string; position: number };
type Building = { id?: string; name_ar: string; code: string | null; lat: number | null; lng: number | null; floors: number | null };
type Pending = { id: string; alias?: string; name_ar?: string; kind?: string; state: string; created_at: string; target?: string; by?: { full_name: string } | null };
const LINK_KINDS = ['portal', 'elearning', 'teams', 'email', 'library', 'calendar', 'registration', 'phone', 'website', 'other'];

function UniForm({ u, onSaved }: { u: Uni; onSaved: () => void }) {
  const [f, setF] = useState(u);
  useEffect(() => setF(u), [u]);
  async function save() {
    const { id, ...row } = f;
    const { error } = await supabase.from('universities').update({ ...row, email_domains: row.email_domains.map((d) => d.trim().toLowerCase()).filter(Boolean) }).eq('id', id);
    if (error) { alert(error.message); return; }
    await audit('edit_university', 'university', id, { slug: f.slug }); clearUniCache(); onSaved();
  }
  return (
    <div className="panel stack">
      <div className="row"><h2 className="grow">{u.name_ar}</h2><Status s={f.data_status} /></div>
      <div className="grid2">
        <label className="f">الاسم بالعربي<input className="input" value={f.name_ar} onChange={(e) => setF({ ...f, name_ar: e.target.value })} /></label>
        <label className="f">الاسم بالإنجليزي<input className="input ltr" value={f.name_en} onChange={(e) => setF({ ...f, name_en: e.target.value })} /></label>
        <label className="f">نطاقات الإيميل (افصل بفاصلة)<input className="input ltr" value={f.email_domains.join(', ')} onChange={(e) => setF({ ...f, email_domains: e.target.value.split(',') })} /></label>
        <label className="f">لون الجامعة<div className="row"><input type="color" value={f.brand_color} onChange={(e) => setF({ ...f, brand_color: e.target.value })} /><span className="ltr small">{f.brand_color}</span></div></label>
        <label className="f">مركز الحرم (lat, lng)<input className="input ltr" value={f.center_lat != null ? `${f.center_lat}, ${f.center_lng}` : ''} onChange={(e) => { const [a, b] = e.target.value.split(',').map(parseFloat); setF({ ...f, center_lat: Number.isFinite(a) ? a : null, center_lng: Number.isFinite(b) ? b : null }); }} /></label>
        <label className="f">حالة البيانات<select className="input" value={f.data_status} onChange={(e) => setF({ ...f, data_status: e.target.value })}><option value="draft">مسودة</option><option value="verified">موثّقة</option></select></label>
      </div>
      <label className="row small"><input type="checkbox" checked={f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} />مفتوحة للتسجيل</label>
      {u.data_notes && <details className="small muted"><summary>ملاحظات جمع البيانات</summary><div style={{ whiteSpace: 'pre-wrap' }}>{u.data_notes}</div></details>}
      <button className="btn" style={{ alignSelf: 'flex-start' }} onClick={save}>احفظ</button>
    </div>
  );
}

function Academics({ uni }: { uni: string }) {
  const { data, loading, error, reload } = useLoad<College[]>(() => supabase.from('colleges').select('id, name_ar, name_en, verified, majors(id, name_ar, degree, verified)').eq('university_id', uni).order('name_ar') as never, [uni]);
  const [newCol, setNewCol] = useState('');
  async function addCollege() {
    if (!newCol.trim()) return;
    await supabase.from('colleges').insert({ university_id: uni, name_ar: newCol.trim() });
    await supabase.from('communities').insert({ university_id: uni, kind: 'college', name: newCol.trim(), description: 'طلاب الكلية', college_id: (await supabase.from('colleges').select('id').eq('university_id', uni).eq('name_ar', newCol.trim()).single()).data?.id });
    setNewCol(''); reload();
  }
  async function addMajor(c: College) {
    const name = prompt(`اسم التخصص الجديد بـ ${c.name_ar}`); if (!name?.trim()) return;
    const { data: m, error } = await supabase.from('majors').insert({ university_id: uni, college_id: c.id, name_ar: name.trim() }).select('id').single();
    if (error) { alert(error.message); return; }
    await supabase.from('communities').insert({ university_id: uni, kind: 'major', college_id: c.id, major_id: m.id, name: name.trim(), description: 'طلاب التخصص' });
    reload();
  }
  async function rename(table: 'colleges' | 'majors', id: string, old: string) {
    const name = prompt('الاسم الجديد', old); if (!name?.trim() || name === old) return;
    await supabase.from(table).update({ name_ar: name.trim() }).eq('id', id);
    await supabase.from('communities').update({ name: name.trim() }).eq(table === 'colleges' ? 'college_id' : 'major_id', id).eq('kind', table === 'colleges' ? 'college' : 'major');
    reload();
  }
  async function verify(table: 'colleges' | 'majors', id: string, v: boolean) { await supabase.from(table).update({ verified: v }).eq('id', id); reload(); }
  async function del(table: 'colleges' | 'majors', id: string) { if (!confirm('تحذفه؟ الطلاب المربوطين فيه بيضلوا بس بدون تخصص.')) return; await supabase.from(table).delete().eq('id', id); reload(); }

  return (
    <State loading={loading} error={error}>
      <div className="stack">
        {(data ?? []).map((c) => (
          <div key={c.id} className="panel stack">
            <div className="row">
              <b className="grow">{c.name_ar}</b>
              <button className="btn ghost sm" onClick={() => verify('colleges', c.id, !c.verified)}>{c.verified ? '✓ موثّقة' : 'وثّق'}</button>
              <button className="btn ghost sm" onClick={() => rename('colleges', c.id, c.name_ar)}>غيّر الاسم</button>
              <button className="btn ghost sm" onClick={() => addMajor(c)}>+ تخصص</button>
              <button className="btn ghost sm" style={{ color: 'var(--red)' }} onClick={() => del('colleges', c.id)}>احذف</button>
            </div>
            <div className="row">{c.majors.sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')).map((m) => (
              <span key={m.id} className={`tag ${m.verified ? 'green' : ''}`} style={{ cursor: 'pointer' }} title="اضغط للتعديل"
                onClick={() => { const a = prompt(`${m.name_ar}\n\nاكتب: 1 تغيير الاسم · 2 توثيق/إلغاء · 3 حذف`); if (a === '1') rename('majors', m.id, m.name_ar); if (a === '2') verify('majors', m.id, !m.verified); if (a === '3') del('majors', m.id); }}>
                {m.name_ar}{m.degree === 'diploma' ? ' (دبلوم)' : ''}
              </span>
            ))}</div>
          </div>
        ))}
        <div className="panel row"><input className="input" style={{ flex: 1 }} value={newCol} onChange={(e) => setNewCol(e.target.value)} placeholder="اسم كلية جديدة" /><button className="btn" onClick={addCollege}>أضف كلية</button></div>
      </div>
    </State>
  );
}

function Links({ uni }: { uni: string }) {
  const { data, reload } = useLoad<Link[]>(() => supabase.from('university_links').select('*').eq('university_id', uni).order('position') as never, [uni]);
  const [n, setN] = useState<Link>({ kind: 'portal', title: '', url: 'https://', position: 99 });
  async function add() {
    const { error } = await supabase.from('university_links').insert({ ...n, university_id: uni, position: data?.length ?? 0 });
    if (error) { alert('الرابط لازم يبلش بـ https:// أو http://'); return; }
    setN({ kind: 'portal', title: '', url: 'https://', position: 99 }); reload();
  }
  async function del(id: string) { await supabase.from('university_links').delete().eq('id', id); reload(); }
  return (
    <div className="panel stack">
      <table><tbody>{(data ?? []).map((l) => (
        <tr key={l.id}><td><span className="tag">{l.kind}</span></td><td>{l.title}</td><td className="small ltr"><a href={l.url} target="_blank" rel="noreferrer">{l.url}</a></td><td><button className="btn ghost sm" onClick={() => del(l.id!)}>احذف</button></td></tr>
      ))}</tbody></table>
      <div className="row">
        <select className="input" style={{ width: 140 }} value={n.kind} onChange={(e) => setN({ ...n, kind: e.target.value })}>{LINK_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
        <input className="input" style={{ flex: 1 }} value={n.title} onChange={(e) => setN({ ...n, title: e.target.value })} placeholder="الاسم" />
        <input className="input ltr" style={{ flex: 1.5 }} value={n.url} onChange={(e) => setN({ ...n, url: e.target.value })} />
        <button className="btn" onClick={add} disabled={!n.title.trim()}>أضف</button>
      </div>
    </div>
  );
}

function Buildings({ uni }: { uni: string }) {
  const { data, reload } = useLoad<Building[]>(() => supabase.from('buildings').select('id, name_ar, code, lat, lng, floors').eq('university_id', uni).order('name_ar') as never, [uni]);
  const [b, setB] = useState({ name_ar: '', code: '', coords: '', floors: '' });
  async function add() {
    const [lat, lng] = b.coords.split(',').map(parseFloat);
    const { error } = await supabase.from('buildings').insert({ university_id: uni, name_ar: b.name_ar.trim(), code: b.code || null, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, floors: b.floors ? Number(b.floors) : null });
    if (error) { alert(error.message); return; }
    setB({ name_ar: '', code: '', coords: '', floors: '' }); reload();
  }
  async function addAlias(id: string) {
    const a = prompt('اللقب اللي بيستخدمه الطلاب (مثلاً: «المدرج الكبير»)'); if (!a?.trim()) return;
    await supabase.from('place_aliases').insert({ university_id: uni, building_id: id, alias: a.trim(), state: 'approved' });
  }
  async function del(id: string) { if (!confirm('تحذف المبنى وقاعاته؟')) return; await supabase.from('buildings').delete().eq('id', id); reload(); }
  return (
    <div className="panel stack">
      <div className="small muted">انسخ الإحداثيات من Google Maps (كبسة يمين على المبنى) وألصقها هون.</div>
      <table><tbody>{(data ?? []).map((x) => (
        <tr key={x.id}><td><b>{x.name_ar}</b> {x.code && <span className="tag">{x.code}</span>}</td><td className="small ltr muted">{x.lat != null ? `${x.lat.toFixed(5)}, ${x.lng?.toFixed(5)}` : 'بدون موقع'}</td>
          <td><button className="btn ghost sm" onClick={() => addAlias(x.id!)}>+ لقب</button><button className="btn ghost sm" style={{ color: 'var(--red)' }} onClick={() => del(x.id!)}>احذف</button></td></tr>
      ))}</tbody></table>
      <div className="row">
        <input className="input" style={{ flex: 1.5 }} value={b.name_ar} onChange={(e) => setB({ ...b, name_ar: e.target.value })} placeholder="اسم المبنى" />
        <input className="input" style={{ flex: 0.6 }} value={b.code} onChange={(e) => setB({ ...b, code: e.target.value })} placeholder="الرمز" />
        <input className="input ltr" style={{ flex: 1.4 }} value={b.coords} onChange={(e) => setB({ ...b, coords: e.target.value })} placeholder="32.0139, 35.8728" />
        <input className="input" style={{ flex: 0.5 }} value={b.floors} onChange={(e) => setB({ ...b, floors: e.target.value })} placeholder="طوابق" />
        <button className="btn" onClick={add} disabled={!b.name_ar.trim()}>أضف</button>
      </div>
    </div>
  );
}

function PendingQueue() {
  const aliases = useLoad<Pending[]>(() => supabase.from('place_aliases').select('id, alias, state, created_at, by:profiles(full_name), building:buildings(name_ar), place:places(name_ar)').eq('state', 'pending').order('created_at') as never, []);
  const places = useLoad<Pending[]>(() => supabase.from('places').select('id, name_ar, kind, state, created_at, lat, lng, by:profiles(full_name)').eq('state', 'pending').order('created_at') as never, []);
  async function decide(table: string, id: string, state: string, reload: () => void) {
    await supabase.from(table).update({ state }).eq('id', id); await audit(`${state}_${table}`, table, id); reload();
  }
  const total = (aliases.data?.length ?? 0) + (places.data?.length ?? 0);
  if (!total) return null;
  return (
    <div className="panel stack">
      <h2>بانتظار موافقتك ({total})</h2>
      <table><tbody>
        {(aliases.data ?? []).map((a) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <tr key={a.id}><td>لقب «<b>{a.alias}</b>» لـ {(a as any).building?.name_ar ?? (a as any).place?.name_ar}</td><td className="small muted">{a.by?.full_name} · {fmtDate(a.created_at)}</td>
            <td><button className="btn green sm" onClick={() => decide('place_aliases', a.id, 'approved', aliases.reload)}>اقبل</button> <button className="btn soft sm" onClick={() => decide('place_aliases', a.id, 'rejected', aliases.reload)}>ارفض</button></td></tr>
        ))}
        {(places.data ?? []).map((p) => (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <tr key={p.id}><td>مكان جديد: <b>{p.name_ar}</b> <span className="tag">{p.kind}</span> <a className="small" href={`https://www.openstreetmap.org/?mlat=${(p as any).lat}&mlon=${(p as any).lng}#map=19/${(p as any).lat}/${(p as any).lng}`} target="_blank" rel="noreferrer">شوف عالخريطة</a></td>
            <td className="small muted">{p.by?.full_name} · {fmtDate(p.created_at)}</td>
            <td><button className="btn green sm" onClick={() => decide('places', p.id, 'approved', places.reload)}>اقبل</button> <button className="btn soft sm" onClick={() => decide('places', p.id, 'rejected', places.reload)}>ارفض</button></td></tr>
        ))}
      </tbody></table>
    </div>
  );
}

export default function Campus() {
  const unis = useUnis();
  const [uni, setUni] = useState('');
  const [tab, setTab] = useState<'info' | 'academics' | 'links' | 'buildings'>('info');
  const [ver, setVer] = useState(0);
  const { data: fresh } = useLoad<Uni | null>(() => uni ? supabase.from('universities').select('*').eq('id', uni).single() as never : Promise.resolve({ data: null, error: null }), [uni, ver]);
  useEffect(() => { if (!uni && unis[0]) setUni(unis[0].id); }, [unis, uni]);

  return (
    <div className="stack">
      <Top title="الجامعات والخرائط">
        <select className="input" style={{ width: 240 }} value={uni} onChange={(e) => setUni(e.target.value)}>{unis.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}</select>
      </Top>
      <PendingQueue />
      <div className="row">
        {([['info', 'المعلومات'], ['academics', 'الكليات والتخصصات'], ['links', 'روابط البوابات'], ['buildings', 'المباني والألقاب']] as const).map(([k, l]) => (
          <button key={k} className={`btn ${tab === k ? '' : 'soft'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {uni && tab === 'info' && fresh && <UniForm u={fresh} onSaved={() => setVer((v) => v + 1)} />}
      {uni && tab === 'academics' && <Academics uni={uni} />}
      {uni && tab === 'links' && <Links uni={uni} />}
      {uni && tab === 'buildings' && <Buildings uni={uni} />}
    </div>
  );
}
