import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';

import {
  Act, Actions, AdminScreen, Filters, Item, Muted, OptionPicker, Panel, Pill, Section, Sheet, State, Status, UniPicker,
  audit, clearUniCache, confirm, done, fmtDate, promptText, useLoad, useUnis, type Uni,
} from '@/components/admin/kit';
import { Chip, Field, T, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

type College = { id: string; name_ar: string; name_en: string | null; verified: boolean; majors: { id: string; name_ar: string; degree: string; verified: boolean }[] };
type Link = { id?: string; kind: string; title: string; url: string; position: number };
type Building = { id?: string; name_ar: string; code: string | null; lat: number | null; lng: number | null; floors: number | null };
type Pending = { id: string; alias?: string; name_ar?: string; kind?: string; state: string; created_at: string; lat?: number; lng?: number; by?: { full_name: string } | null; building?: { name_ar: string } | null; place?: { name_ar: string } | null };
const LINK_KINDS = Object.fromEntries(['portal', 'elearning', 'teams', 'email', 'library', 'calendar', 'registration', 'phone', 'website', 'other'].map((k) => [k, k])) as Record<string, string>;

function UniForm({ u, onSaved }: { u: Uni; onSaved: () => void }) {
  const [f, setF] = useState(u);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => setF(u), [u]);
  async function save() {
    const { id, ...row } = f;
    const { error } = await supabase.from('universities').update({ ...row, email_domains: row.email_domains.map((d) => d.trim().toLowerCase()).filter(Boolean) }).eq('id', id);
    if (error) { setMsg(error.message); return; }
    await audit('edit_university', 'university', id, { slug: f.slug }); clearUniCache(); done(); setMsg(t('انحفظ ✓')); onSaved();
  }
  return (
    <Panel>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T v="h3" style={{ flex: 1 }}>{u.name_ar}</T><Status s={f.data_status} /></View>
      <Field label={t('الاسم بالعربي')} value={f.name_ar} onChangeText={(v) => setF({ ...f, name_ar: v })} />
      <Field label={t('الاسم بالإنجليزي')} value={f.name_en} onChangeText={(v) => setF({ ...f, name_en: v })} style={{ writingDirection: 'ltr', textAlign: 'left' }} />
      <Field label={t('نطاقات الإيميل (افصل بفاصلة)')} value={f.email_domains.join(', ')} onChangeText={(v) => setF({ ...f, email_domains: v.split(',') })} autoCapitalize="none" style={{ writingDirection: 'ltr', textAlign: 'left' }} />
      <Field label={t('لون الجامعة')} value={f.brand_color} onChangeText={(v) => setF({ ...f, brand_color: v })} autoCapitalize="none" style={{ writingDirection: 'ltr', textAlign: 'left' }} />
      <Field label={t('مركز الحرم (lat, lng)')} value={f.center_lat != null ? `${f.center_lat}, ${f.center_lng}` : ''}
        onChangeText={(v) => { const [a, b] = v.split(',').map(parseFloat); setF({ ...f, center_lat: Number.isFinite(a) ? a : null, center_lng: Number.isFinite(b) ? b : null }); }} />
      <OptionPicker label={t('حالة البيانات')} value={f.data_status} options={{ draft: t('مسودة'), verified: t('موثّقة') }} onChange={(v) => setF({ ...f, data_status: v })} />
      <Toggle value={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} label={t('مفتوحة للتسجيل')} />
      {u.data_notes ? <Muted>{u.data_notes}</Muted> : null}
      <Act label={t('احفظ')} kind="primary" onPress={save} />
      {msg && <T v="small" color={msg.includes('✓') ? C.greenInk : C.red}>{msg}</T>}
    </Panel>
  );
}

function Academics({ uni }: { uni: string }) {
  const { data, loading, error, reload } = useLoad<College[]>(() => supabase.from('colleges').select('id, name_ar, name_en, verified, majors(id, name_ar, degree, verified)').eq('university_id', uni).order('name_ar') as never, [uni]);
  const [newCol, setNewCol] = useState('');
  const [major, setMajor] = useState<College['majors'][number] | null>(null);
  async function addCollege() {
    if (!newCol.trim()) return;
    await supabase.from('colleges').insert({ university_id: uni, name_ar: newCol.trim() });
    await supabase.from('communities').insert({ university_id: uni, kind: 'college', name: newCol.trim(), description: 'طلاب الكلية', college_id: (await supabase.from('colleges').select('id').eq('university_id', uni).eq('name_ar', newCol.trim()).single()).data?.id });
    done(); setNewCol(''); reload();
  }
  async function addMajor(c: College) {
    const name = await promptText(t('اسم التخصص الجديد بـ {0}', [c.name_ar])); if (!name?.trim()) return;
    const { data: m, error: e } = await supabase.from('majors').insert({ university_id: uni, college_id: c.id, name_ar: name.trim() }).select('id').single();
    if (e) return;
    await supabase.from('communities').insert({ university_id: uni, kind: 'major', college_id: c.id, major_id: m.id, name: name.trim(), description: 'طلاب التخصص' });
    done(); reload();
  }
  async function rename(table: 'colleges' | 'majors', id: string, old: string) {
    const name = await promptText(t('الاسم الجديد'), undefined, old); if (!name?.trim() || name === old) return;
    await supabase.from(table).update({ name_ar: name.trim() }).eq('id', id);
    await supabase.from('communities').update({ name: name.trim() }).eq(table === 'colleges' ? 'college_id' : 'major_id', id).eq('kind', table === 'colleges' ? 'college' : 'major');
    done(); reload();
  }
  async function verify(table: 'colleges' | 'majors', id: string, v: boolean) { await supabase.from(table).update({ verified: v }).eq('id', id); reload(); }
  async function del(table: 'colleges' | 'majors', id: string, name: string) {
    if (!(await confirm(t('تحذف «{0}»؟', [name]), t('الطلاب المربوطين فيه بيضلوا بس بدون تخصص.'), t('احذف')))) return;
    await supabase.from(table).delete().eq('id', id); reload();
  }

  return (
    <State loading={loading} error={error}>
      <View style={{ gap: 10 }}>
        {(data ?? []).map((c) => (
          <Panel key={c.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T v="bold" style={{ flex: 1 }}>{c.name_ar}</T>{c.verified && <Pill label={t('موثّقة')} tone="green" />}</View>
            <Actions>
              <Act label={c.verified ? t('إلغاء التوثيق') : t('وثّق')} onPress={() => verify('colleges', c.id, !c.verified)} />
              <Act label={t('غيّر الاسم')} onPress={() => rename('colleges', c.id, c.name_ar)} />
              <Act label={t('+ تخصص')} onPress={() => addMajor(c)} />
              <Act label={t('احذف')} kind="danger" onPress={() => del('colleges', c.id, c.name_ar)} />
            </Actions>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {[...c.majors].sort((a, b) => a.name_ar.localeCompare(b.name_ar, 'ar')).map((m) => (
                <Chip key={m.id} label={`${m.name_ar}${m.degree === 'diploma' ? ` (${t('دبلوم')})` : ''}`} active={m.verified} onPress={() => setMajor(m)} />
              ))}
            </View>
          </Panel>
        ))}
        <Panel>
          <Field value={newCol} onChangeText={setNewCol} placeholder={t('اسم كلية جديدة')} />
          <Act label={t('أضف كلية')} kind="primary" onPress={addCollege} disabled={!newCol.trim()} />
        </Panel>
      </View>
      <Sheet open={!!major} onClose={() => setMajor(null)} title={major?.name_ar}>
        {major && (
          <Actions>
            <Act label={t('غيّر الاسم')} onPress={() => { const m = major; setMajor(null); rename('majors', m.id, m.name_ar); }} />
            <Act label={major.verified ? t('إلغاء التوثيق') : t('وثّق')} onPress={() => { verify('majors', major.id, !major.verified); setMajor(null); }} />
            <Act label={t('احذف')} kind="danger" onPress={() => { const m = major; setMajor(null); del('majors', m.id, m.name_ar); }} />
          </Actions>
        )}
      </Sheet>
    </State>
  );
}

function Links({ uni }: { uni: string }) {
  const { data, reload } = useLoad<Link[]>(() => supabase.from('university_links').select('*').eq('university_id', uni).order('position') as never, [uni]);
  const [n, setN] = useState<Link>({ kind: 'portal', title: '', url: 'https://', position: 99 });
  const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    const { error } = await supabase.from('university_links').insert({ ...n, university_id: uni, position: data?.length ?? 0 });
    if (error) { setMsg(t('الرابط لازم يبلش بـ https:// أو http://')); return; }
    done(); setMsg(null); setN({ kind: 'portal', title: '', url: 'https://', position: 99 }); reload();
  }
  async function del(l: Link) {
    if (!(await confirm(t('تحذف الرابط؟'), l.title, t('احذف')))) return;
    await supabase.from('university_links').delete().eq('id', l.id!); reload();
  }
  return (
    <View style={{ gap: 8 }}>
      {(data ?? []).map((l) => (
        <Item key={l.id} title={l.title} sub={`${l.kind} · ${l.url}`} onPress={() => Linking.openURL(l.url).catch(() => {})}
          end={<Act label={t('احذف')} kind="danger" onPress={() => del(l)} />} />
      ))}
      <Panel>
        <OptionPicker label={t('النوع')} value={n.kind} options={LINK_KINDS} onChange={(v) => setN({ ...n, kind: v })} />
        <Field value={n.title} onChangeText={(v) => setN({ ...n, title: v })} placeholder={t('الاسم')} />
        <Field value={n.url} onChangeText={(v) => setN({ ...n, url: v })} autoCapitalize="none" style={{ writingDirection: 'ltr', textAlign: 'left' }} />
        <Act label={t('أضف')} kind="primary" onPress={add} disabled={!n.title.trim()} />
        {msg && <T v="small" color={C.red}>{msg}</T>}
      </Panel>
    </View>
  );
}

function Buildings({ uni }: { uni: string }) {
  const { data, reload } = useLoad<Building[]>(() => supabase.from('buildings').select('id, name_ar, code, lat, lng, floors').eq('university_id', uni).order('name_ar') as never, [uni]);
  const [b, setB] = useState({ name_ar: '', code: '', coords: '', floors: '' });
  const [msg, setMsg] = useState<string | null>(null);
  async function add() {
    const [lat, lng] = b.coords.split(',').map(parseFloat);
    const { error } = await supabase.from('buildings').insert({ university_id: uni, name_ar: b.name_ar.trim(), code: b.code || null, lat: Number.isFinite(lat) ? lat : null, lng: Number.isFinite(lng) ? lng : null, floors: b.floors ? Number(b.floors) : null });
    if (error) { setMsg(error.message); return; }
    done(); setMsg(null); setB({ name_ar: '', code: '', coords: '', floors: '' }); reload();
  }
  async function addAlias(id: string) {
    const a = await promptText(t('اللقب اللي بيستخدمه الطلاب (مثلاً: «المدرج الكبير»)')); if (!a?.trim()) return;
    await supabase.from('place_aliases').insert({ university_id: uni, building_id: id, alias: a.trim(), state: 'approved' }); done();
  }
  async function del(x: Building) {
    if (!(await confirm(t('تحذف المبنى وقاعاته؟'), x.name_ar, t('احذف')))) return;
    await supabase.from('buildings').delete().eq('id', x.id!); reload();
  }
  return (
    <View style={{ gap: 8 }}>
      <Muted>{t('انسخ الإحداثيات من Google Maps (كبسة مطوّلة على المبنى) وألصقها هون.')}</Muted>
      {(data ?? []).map((x) => (
        <Panel key={x.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T v="bold" style={{ flex: 1 }}>{x.name_ar}</T>{x.code ? <Pill label={x.code} /> : null}</View>
          <Muted>{x.lat != null ? `${x.lat.toFixed(5)}, ${x.lng?.toFixed(5)}` : t('بدون موقع')}</Muted>
          <Actions><Act label={t('+ لقب')} onPress={() => addAlias(x.id!)} /><Act label={t('احذف')} kind="danger" onPress={() => del(x)} /></Actions>
        </Panel>
      ))}
      <Panel>
        <Field value={b.name_ar} onChangeText={(v) => setB({ ...b, name_ar: v })} placeholder={t('اسم المبنى')} />
        <Field value={b.code} onChangeText={(v) => setB({ ...b, code: v })} placeholder={t('الرمز')} />
        <Field value={b.coords} onChangeText={(v) => setB({ ...b, coords: v })} placeholder="32.0139, 35.8728" />
        <Field value={b.floors} onChangeText={(v) => setB({ ...b, floors: v })} placeholder={t('طوابق')} keyboardType="number-pad" />
        <Act label={t('أضف')} kind="primary" onPress={add} disabled={!b.name_ar.trim()} />
        {msg && <T v="small" color={C.red}>{msg}</T>}
      </Panel>
    </View>
  );
}

function PendingQueue() {
  const aliases = useLoad<Pending[]>(() => supabase.from('place_aliases').select('id, alias, state, created_at, by:profiles(full_name), building:buildings(name_ar), place:places(name_ar)').eq('state', 'pending').order('created_at') as never, []);
  const places = useLoad<Pending[]>(() => supabase.from('places').select('id, name_ar, kind, state, created_at, lat, lng, by:profiles(full_name)').eq('state', 'pending').order('created_at') as never, []);
  async function decide(table: string, id: string, state: string, reload: () => void) {
    await supabase.from(table).update({ state }).eq('id', id); await audit(`${state}_${table}`, table, id); done(); reload();
  }
  const total = (aliases.data?.length ?? 0) + (places.data?.length ?? 0);
  if (!total) return null;
  return (
    <Panel style={{ borderColor: C.primary }}>
      <T v="h3">{t('بانتظار موافقتك ({0})', [String(total)])}</T>
      {(aliases.data ?? []).map((a) => (
        <View key={a.id} style={{ gap: 6, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
          <T v="small">{t('لقب «{0}» لـ {1}', [a.alias ?? '', a.building?.name_ar ?? a.place?.name_ar ?? ''])}</T>
          <Muted>{[a.by?.full_name, fmtDate(a.created_at)].filter(Boolean).join(' · ')}</Muted>
          <Actions><Act label={t('اقبل')} kind="green" onPress={() => decide('place_aliases', a.id, 'approved', aliases.reload)} /><Act label={t('ارفض')} onPress={() => decide('place_aliases', a.id, 'rejected', aliases.reload)} /></Actions>
        </View>
      ))}
      {(places.data ?? []).map((p) => (
        <View key={p.id} style={{ gap: 6, paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
          <T v="small">{t('مكان جديد: {0}', [p.name_ar ?? ''])} · {p.kind}</T>
          <Muted>{[p.by?.full_name, fmtDate(p.created_at)].filter(Boolean).join(' · ')}</Muted>
          <Actions>
            <Act label={t('شوف عالخريطة')} onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=19/${p.lat}/${p.lng}`).catch(() => {})} />
            <Act label={t('اقبل')} kind="green" onPress={() => decide('places', p.id, 'approved', places.reload)} />
            <Act label={t('ارفض')} onPress={() => decide('places', p.id, 'rejected', places.reload)} />
          </Actions>
        </View>
      ))}
    </Panel>
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
    <AdminScreen title={t('الجامعات والخرائط')}>
      <PendingQueue />
      <UniPicker value={uni} onChange={setUni} allowAll={false} />
      <Filters items={[['info', t('المعلومات')], ['academics', t('الكليات والتخصصات')], ['links', t('روابط البوابات')], ['buildings', t('المباني والألقاب')]]} value={tab} onChange={setTab} />
      {uni && tab === 'info' && fresh && <UniForm u={fresh} onSaved={() => setVer((v) => v + 1)} />}
      {uni && tab === 'academics' && <Academics uni={uni} />}
      {uni && tab === 'links' && <Links uni={uni} />}
      {uni && tab === 'buildings' && <Buildings uni={uni} />}
      {!uni && <Section title={t('اختار جامعة')} />}
    </AdminScreen>
  );
}
