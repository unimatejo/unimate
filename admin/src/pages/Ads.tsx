import { useState } from 'react';

import { audit, fmtNum, supabase, useLoad, useUnis } from '../lib';
import { Drawer, State, Top } from '../ui';

type MenuItem = { name: string; price_jod?: number; photo_url?: string };
type Adv = {
  id?: string; university_id: string | null; name: string; category: string; description: string | null; phone: string | null; hours: string | null;
  menu: MenuItem[]; photos: string[]; logo_url: string | null; lat: number | null; lng: number | null; contact_name: string | null; notes: string | null; is_active: boolean;
};
type Camp = {
  id?: string; advertiser_id: string; university_ids: string[]; college_ids: string[]; placement: string; title: string; body: string | null; image_url: string | null;
  offer: string | null; starts_on: string; ends_on: string; daily_from: string | null; daily_to: string | null; priority: number; is_active: boolean;
};
type Stat = { campaign_id: string; impressions: number; clicks: number; calls: number };

const CATS: Record<string, string> = { restaurant: 'مطعم', cafe: 'كافيه', bookshop: 'مكتبة', print: 'طباعة', housing: 'سكن', courses: 'دورات', shop: 'محل', other: 'خدمة' };
const PLACES: Record<string, string> = { home_banner: 'بانر الرئيسية', feed_card: 'بين المنشورات', map_pin: 'دبوس على الخريطة', market_banner: 'بانر السوق' };
const today = () => new Date().toISOString().slice(0, 10);
const blankAdv = (): Adv => ({ university_id: null, name: '', category: 'restaurant', description: '', phone: '', hours: '', menu: [], photos: [], logo_url: null, lat: null, lng: null, contact_name: '', notes: '', is_active: true });

async function upload(file: File): Promise<string> {
  const path = `${crypto.randomUUID()}.${file.name.split('.').pop() ?? 'jpg'}`;
  const { error } = await supabase.storage.from('ads').upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from('ads').getPublicUrl(path).data.publicUrl;
}

function CampaignForm({ adv, camp, onDone }: { adv: Adv; camp: Camp | null; onDone: () => void }) {
  const unis = useUnis();
  const [c, setC] = useState<Camp>(camp ?? {
    advertiser_id: adv.id!, university_ids: adv.university_id ? [adv.university_id] : [], college_ids: [], placement: 'home_banner', title: '', body: '', image_url: null,
    offer: '', starts_on: today(), ends_on: new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10), daily_from: null, daily_to: null, priority: 0, is_active: true,
  });
  const set = (p: Partial<Camp>) => setC((x) => ({ ...x, ...p }));

  async function save() {
    if (!c.title.trim() || c.university_ids.length === 0) { alert('حط عنوان واختار جامعة وحدة على الأقل.'); return; }
    const row = { ...c, daily_from: c.daily_from || null, daily_to: c.daily_to || null, body: c.body || null, offer: c.offer || null };
    const { error } = c.id ? await supabase.from('ad_campaigns').update(row).eq('id', c.id) : await supabase.from('ad_campaigns').insert(row);
    if (error) { alert(error.message); return; }
    await audit(c.id ? 'edit_campaign' : 'add_campaign', 'campaign', c.id ?? adv.id!, { title: c.title });
    onDone();
  }

  return (
    <div className="panel stack">
      <h3>{c.id ? 'تعديل الإعلان' : 'إعلان جديد'}</h3>
      <div className="grid2">
        <label className="f">المكان<select className="input" value={c.placement} onChange={(e) => set({ placement: e.target.value })}>{Object.entries(PLACES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="f">الأولوية<input className="input" type="number" value={c.priority} onChange={(e) => set({ priority: Number(e.target.value) })} /></label>
        <label className="f">العنوان (60 حرف)<input className="input" maxLength={60} value={c.title} onChange={(e) => set({ title: e.target.value })} /></label>
        <label className="f">العرض<input className="input" value={c.offer ?? ''} onChange={(e) => set({ offer: e.target.value })} placeholder="خصم 20% للطلاب" /></label>
      </div>
      <label className="f">النص (140 حرف)<input className="input" maxLength={140} value={c.body ?? ''} onChange={(e) => set({ body: e.target.value })} /></label>
      <label className="f">الصورة<input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) set({ image_url: await upload(f) }); }} /></label>
      {c.image_url && <img src={c.image_url} alt="" style={{ maxWidth: 260, borderRadius: 12 }} />}
      <div className="grid2">
        <label className="f">من تاريخ<input className="input" type="date" value={c.starts_on} onChange={(e) => set({ starts_on: e.target.value })} /></label>
        <label className="f">لتاريخ<input className="input" type="date" value={c.ends_on} onChange={(e) => set({ ends_on: e.target.value })} /></label>
        <label className="f">كل يوم من الساعة (اختياري)<input className="input" type="time" value={c.daily_from ?? ''} onChange={(e) => set({ daily_from: e.target.value })} /></label>
        <label className="f">للساعة<input className="input" type="time" value={c.daily_to ?? ''} onChange={(e) => set({ daily_to: e.target.value })} /></label>
      </div>
      <div className="f">الجامعات
        <div className="row">{unis.map((u) => (
          <label key={u.id} className="row small"><input type="checkbox" checked={c.university_ids.includes(u.id)}
            onChange={(e) => set({ university_ids: e.target.checked ? [...c.university_ids, u.id] : c.university_ids.filter((x) => x !== u.id) })} />{u.name_ar}</label>
        ))}</div>
      </div>
      <label className="row small"><input type="checkbox" checked={c.is_active} onChange={(e) => set({ is_active: e.target.checked })} />شغّال</label>
      <div className="row"><button className="btn" onClick={save}>احفظ الإعلان</button><button className="btn soft" onClick={onDone}>إلغاء</button></div>
    </div>
  );
}

function AdvEditor({ initial, onClose }: { initial: Adv; onClose: () => void }) {
  const unis = useUnis();
  const [a, setA] = useState<Adv>(initial);
  const [editCamp, setEditCamp] = useState<Camp | null | 'new'>(null);
  const set = (p: Partial<Adv>) => setA((x) => ({ ...x, ...p }));
  const camps = useLoad<Camp[]>(() => a.id ? supabase.from('ad_campaigns').select('*').eq('advertiser_id', a.id).order('created_at', { ascending: false }) as never : Promise.resolve({ data: [], error: null }), [a.id]);
  const stats = useLoad<Stat[]>(() => supabase.rpc('admin_ad_stats'), [a.id]);

  async function save() {
    if (!a.name.trim()) { alert('اكتب الاسم'); return; }
    const { id, ...row } = a;
    const r = id ? await supabase.from('advertisers').update(row).eq('id', id).select('id').single() : await supabase.from('advertisers').insert(row).select('id').single();
    if (r.error) { alert(r.error.message); return; }
    await audit(id ? 'edit_advertiser' : 'add_advertiser', 'advertiser', r.data.id, { name: a.name });
    set({ id: r.data.id });
    if (id) onClose();
  }

  const st = (cid?: string) => stats.data?.find((s) => s.campaign_id === cid);

  return (
    <div className="stack">
      <h2>{a.id ? a.name : 'معلن جديد'}</h2>
      <div className="grid2">
        <label className="f">الاسم<input className="input" value={a.name} onChange={(e) => set({ name: e.target.value })} /></label>
        <label className="f">النوع<select className="input" value={a.category} onChange={(e) => set({ category: e.target.value })}>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="f">الجامعة<select className="input" value={a.university_id ?? ''} onChange={(e) => set({ university_id: e.target.value || null })}><option value="">كل الجامعات</option>{unis.map((u) => <option key={u.id} value={u.id}>{u.name_ar}</option>)}</select></label>
        <label className="f">الهاتف (بيبيّن للطلاب)<input className="input ltr" value={a.phone ?? ''} onChange={(e) => set({ phone: e.target.value })} /></label>
        <label className="f">الدوام<input className="input" value={a.hours ?? ''} onChange={(e) => set({ hours: e.target.value })} placeholder="يومياً 8 الصبح - 11 بالليل" /></label>
        <label className="f">الموقع (lat, lng)<input className="input ltr" value={a.lat != null ? `${a.lat}, ${a.lng}` : ''} onChange={(e) => { const [la, ln] = e.target.value.split(',').map((x) => parseFloat(x)); set({ lat: Number.isFinite(la) ? la : null, lng: Number.isFinite(ln) ? ln : null }); }} placeholder="32.0139, 35.8728" /></label>
      </div>
      <label className="f">الوصف<textarea className="input" value={a.description ?? ''} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="row">
        <label className="f">اللوغو<input type="file" accept="image/*" onChange={async (e) => { const f = e.target.files?.[0]; if (f) set({ logo_url: await upload(f) }); }} /></label>
        {a.logo_url && <img src={a.logo_url} alt="" className="av" style={{ width: 48, height: 48 }} />}
      </div>
      <div className="f">الصور
        <input type="file" accept="image/*" multiple onChange={async (e) => { const fs = [...(e.target.files ?? [])]; const urls = await Promise.all(fs.map(upload)); set({ photos: [...a.photos, ...urls] }); }} />
        <div className="row">{a.photos.map((p) => <div key={p} style={{ position: 'relative' }}><img src={p} alt="" style={{ width: 96, height: 72, objectFit: 'cover', borderRadius: 10 }} /><button className="btn red sm" style={{ position: 'absolute', top: 2, left: 2 }} onClick={() => set({ photos: a.photos.filter((x) => x !== p) })}>×</button></div>)}</div>
      </div>
      <div className="f">القائمة
        {a.menu.map((m, i) => (
          <div key={i} className="row">
            <input className="input" style={{ flex: 2 }} value={m.name} onChange={(e) => set({ menu: a.menu.map((x, j) => j === i ? { ...x, name: e.target.value } : x) })} placeholder="الصنف" />
            <input className="input" style={{ flex: 1 }} type="number" step="0.05" value={m.price_jod ?? ''} onChange={(e) => set({ menu: a.menu.map((x, j) => j === i ? { ...x, price_jod: e.target.value ? Number(e.target.value) : undefined } : x) })} placeholder="السعر د.أ" />
            <button className="btn soft sm" onClick={() => set({ menu: a.menu.filter((_, j) => j !== i) })}>×</button>
          </div>
        ))}
        <button className="btn soft sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ menu: [...a.menu, { name: '' }] })}>+ صنف</button>
      </div>
      <div className="grid2">
        <label className="f">اسم صاحب المحل (للإدارة بس)<input className="input" value={a.contact_name ?? ''} onChange={(e) => set({ contact_name: e.target.value })} /></label>
        <label className="f">ملاحظات الدفع (للإدارة بس)<input className="input" value={a.notes ?? ''} onChange={(e) => set({ notes: e.target.value })} /></label>
      </div>
      <label className="row small"><input type="checkbox" checked={a.is_active} onChange={(e) => set({ is_active: e.target.checked })} />فعّال</label>
      <button className="btn" onClick={save}>احفظ المعلن</button>

      {a.id && (
        <>
          <div className="row"><h3 className="grow">إعلاناته</h3><button className="btn soft sm" onClick={() => setEditCamp('new')}>+ إعلان</button></div>
          {editCamp && <CampaignForm adv={a} camp={editCamp === 'new' ? null : editCamp} onDone={() => { setEditCamp(null); camps.reload(); }} />}
          <div className="panel scroll"><table>
            <thead><tr><th>الإعلان</th><th>المكان</th><th>المدة</th><th>مشاهدات</th><th>ضغطات</th><th>اتصالات</th></tr></thead>
            <tbody>{(camps.data ?? []).map((c) => (
              <tr key={c.id} className="click" onClick={() => setEditCamp(c)} style={{ opacity: c.is_active ? 1 : 0.55 }}>
                <td>{c.title}</td><td className="small">{PLACES[c.placement]}</td><td className="small muted">{c.starts_on} ← {c.ends_on}</td>
                <td>{fmtNum(st(c.id)?.impressions)}</td><td>{fmtNum(st(c.id)?.clicks)}</td><td>{fmtNum(st(c.id)?.calls)}</td>
              </tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </div>
  );
}

export default function Ads() {
  const [sel, setSel] = useState<Adv | null>(null);
  const { data, loading, error, reload } = useLoad<(Adv & { university: { name_ar: string } | null })[]>(
    () => supabase.from('advertisers').select('*, university:universities(name_ar)').order('created_at', { ascending: false }) as never, []);

  return (
    <div className="stack">
      <Top title="الإعلانات" sub="مطاعم ومحلات حوالين الجامعات · كل إعلان مكتوب عليه «ممول» وبيفتح جوا التطبيق">
        <button className="btn" onClick={() => setSel(blankAdv())}>+ معلن جديد</button>
      </Top>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <div className="panel scroll"><table>
          <thead><tr><th>المعلن</th><th>النوع</th><th>الجامعة</th><th>الهاتف</th><th>الحالة</th></tr></thead>
          <tbody>{(data ?? []).map((a) => (
            <tr key={a.id} className="click" onClick={() => { const { university, ...rest } = a; void university; setSel(rest); }}>
              <td><b>{a.name}</b></td><td className="small">{CATS[a.category]}</td><td className="small">{a.university?.name_ar ?? 'الكل'}</td>
              <td className="small ltr">{a.phone}</td><td>{a.is_active ? <span className="tag green">فعّال</span> : <span className="tag">موقوف</span>}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </State>
      <Drawer open={!!sel} onClose={() => { setSel(null); reload(); }}>{sel && <AdvEditor initial={sel} onClose={() => { setSel(null); reload(); }} />}</Drawer>
    </div>
  );
}
