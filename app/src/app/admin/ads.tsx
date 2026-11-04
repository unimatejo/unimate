import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Item, Muted, OptionPicker, Panel, Pill, Section, Sheet, State, UniPicker, audit, confirm, done, fmtNum, useLoad, useUnis } from '@/components/admin/kit';
import { DateField } from '@/components/DateField';
import { Chip, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

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

const CATS: Record<string, string> = { restaurant: t('مطعم'), cafe: t('كافيه'), bookshop: t('مكتبة'), print: t('طباعة'), housing: t('سكن'), courses: t('دورات'), shop: t('محل'), other: t('خدمة') };
const PLACES: Record<string, string> = { home_banner: t('بانر الرئيسية'), feed_card: t('بين المنشورات'), map_pin: t('دبوس على الخريطة'), market_banner: t('بانر السوق') };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const blankAdv = (): Adv => ({ university_id: null, name: '', category: 'restaurant', description: '', phone: '', hours: '', menu: [], photos: [], logo_url: null, lat: null, lng: null, contact_name: '', notes: '', is_active: true });

async function pickAndUpload(): Promise<string | null> {
  const f = await pickMedia({ maxWidth: 1600 });
  if (!f) return null;
  const path = await uploadFile('ads', 'admin', f);
  return publicUrl('ads', path);
}

function CampaignForm({ adv, camp, onDone }: { adv: Adv; camp: Camp | null; onDone: () => void }) {
  const unis = useUnis();
  const [c, setC] = useState<Camp>(camp ?? {
    advertiser_id: adv.id!, university_ids: adv.university_id ? [adv.university_id] : [], college_ids: [], placement: 'home_banner', title: '', body: '', image_url: null,
    offer: '', starts_on: today(), ends_on: ymd(new Date(Date.now() + 30 * 864e5)), daily_from: null, daily_to: null, priority: 0, is_active: true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<Camp>) => setC((x) => ({ ...x, ...p }));

  async function save() {
    if (!c.title.trim() || c.university_ids.length === 0) { setMsg(t('حط عنوان واختار جامعة وحدة على الأقل.')); return; }
    const row = { ...c, daily_from: c.daily_from || null, daily_to: c.daily_to || null, body: c.body || null, offer: c.offer || null };
    const { error } = c.id ? await supabase.from('ad_campaigns').update(row).eq('id', c.id) : await supabase.from('ad_campaigns').insert(row);
    if (error) { setMsg(error.message); return; }
    await audit(c.id ? 'edit_campaign' : 'add_campaign', 'campaign', c.id ?? adv.id!, { title: c.title });
    done(); onDone();
  }

  return (
    <Panel>
      <T v="h3">{c.id ? t('تعديل الإعلان') : t('إعلان جديد')}</T>
      <OptionPicker label={t('المكان')} value={c.placement} options={PLACES} onChange={(v) => set({ placement: v })} />
      <Field label={t('العنوان (60 حرف)')} value={c.title} onChangeText={(v) => set({ title: v })} maxLength={60} />
      <Field label={t('العرض')} value={c.offer ?? ''} onChangeText={(v) => set({ offer: v })} placeholder={t('خصم 20% للطلاب')} />
      <Field label={t('النص (140 حرف)')} value={c.body ?? ''} onChangeText={(v) => set({ body: v })} maxLength={140} />
      <Field label={t('الأولوية')} value={String(c.priority)} onChangeText={(v) => set({ priority: Number(v.replace(/\D/g, '')) || 0 })} keyboardType="number-pad" />
      <Row gap={10}>
        {c.image_url ? <Image source={{ uri: c.image_url }} style={{ width: 120, height: 80, borderRadius: 12 }} contentFit="cover" /> : null}
        <Act label={c.image_url ? t('غيّر الصورة') : t('حط صورة')} onPress={async () => { try { const u = await pickAndUpload(); if (u) set({ image_url: u }); } catch (e) { setMsg((e as Error).message); } }} />
      </Row>
      <T v="small" color={C.muted}>{t('من تاريخ')}</T>
      <DateField value={new Date(c.starts_on)} onChange={(d) => set({ starts_on: ymd(d) })} />
      <T v="small" color={C.muted}>{t('لتاريخ')}</T>
      <DateField value={new Date(c.ends_on)} onChange={(d) => set({ ends_on: ymd(d) })} />
      <Row gap={8}>
        <View style={{ flex: 1 }}><Field label={t('كل يوم من الساعة')} value={c.daily_from ?? ''} onChangeText={(v) => set({ daily_from: v })} placeholder="08:00" /></View>
        <View style={{ flex: 1 }}><Field label={t('للساعة')} value={c.daily_to ?? ''} onChangeText={(v) => set({ daily_to: v })} placeholder="23:00" /></View>
      </Row>
      <T v="small" color={C.muted}>{t('الجامعات')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {unis.map((u) => {
          const on = c.university_ids.includes(u.id);
          return <Chip key={u.id} label={u.name_ar} active={on} onPress={() => set({ university_ids: on ? c.university_ids.filter((x) => x !== u.id) : [...c.university_ids, u.id] })} />;
        })}
      </View>
      <Toggle value={c.is_active} onChange={(v) => set({ is_active: v })} label={t('شغّال')} />
      {msg && <T v="small" color={C.red}>{msg}</T>}
      <Actions><Act label={t('احفظ الإعلان')} kind="primary" onPress={save} /><Act label={t('إلغاء')} onPress={onDone} /></Actions>
    </Panel>
  );
}

function AdvEditor({ initial, onClose }: { initial: Adv; onClose: () => void }) {
  const [a, setA] = useState<Adv>(initial);
  const [editCamp, setEditCamp] = useState<Camp | null | 'new'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<Adv>) => setA((x) => ({ ...x, ...p }));
  const camps = useLoad<Camp[]>(() => a.id ? supabase.from('ad_campaigns').select('*').eq('advertiser_id', a.id).order('created_at', { ascending: false }) as never : Promise.resolve({ data: [], error: null }), [a.id]);
  const stats = useLoad<Stat[]>(() => supabase.rpc('admin_ad_stats'), [a.id]);

  async function save() {
    if (!a.name.trim()) { setMsg(t('اكتب الاسم')); return; }
    const { id, ...row } = a;
    const r = id ? await supabase.from('advertisers').update(row).eq('id', id).select('id').single() : await supabase.from('advertisers').insert(row).select('id').single();
    if (r.error) { setMsg(r.error.message); return; }
    await audit(id ? 'edit_advertiser' : 'add_advertiser', 'advertiser', r.data.id, { name: a.name });
    done(); set({ id: r.data.id }); setMsg(null);
    if (id) onClose();
  }
  const up = async (f: (u: string) => void) => { try { const u = await pickAndUpload(); if (u) f(u); } catch (e) { setMsg((e as Error).message); } };
  const st = (cid?: string) => stats.data?.find((s) => s.campaign_id === cid);

  return (
    <View style={{ gap: 12 }}>
      <Field label={t('الاسم')} value={a.name} onChangeText={(v) => set({ name: v })} />
      <OptionPicker label={t('النوع')} value={a.category} options={CATS} onChange={(v) => set({ category: v })} />
      <UniPicker value={a.university_id ?? ''} onChange={(v) => set({ university_id: v || null })} />
      <Field label={t('الهاتف (بيبيّن للطلاب)')} value={a.phone ?? ''} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
      <Field label={t('الدوام')} value={a.hours ?? ''} onChangeText={(v) => set({ hours: v })} placeholder={t('يومياً 8 الصبح - 11 بالليل')} />
      <Field label={t('الموقع (lat, lng)')} value={a.lat != null ? `${a.lat}, ${a.lng}` : ''} placeholder="32.0139, 35.8728"
        onChangeText={(v) => { const [la, ln] = v.split(',').map((x) => parseFloat(x)); set({ lat: Number.isFinite(la) ? la : null, lng: Number.isFinite(ln) ? ln : null }); }} />
      <Field label={t('الوصف')} value={a.description ?? ''} onChangeText={(v) => set({ description: v })} multiline style={{ minHeight: 80, paddingTop: 14 }} />
      <Row gap={10}>
        {a.logo_url ? <Image source={{ uri: a.logo_url }} style={{ width: 52, height: 52, borderRadius: 26 }} /> : null}
        <Act label={t('اللوغو')} onPress={() => up((u) => set({ logo_url: u }))} />
        <Act label={t('+ صورة')} onPress={() => up((u) => setA((x) => ({ ...x, photos: [...x.photos, u] })))} />
      </Row>
      {a.photos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {a.photos.map((p) => (
            <View key={p}>
              <Image source={{ uri: p }} style={{ width: 96, height: 72, borderRadius: 10 }} contentFit="cover" />
              <Tap onPress={() => set({ photos: a.photos.filter((x) => x !== p) })} accessibilityLabel={t('شيل الصورة')} style={{ position: 'absolute', top: 2, left: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' }}><X size={14} color="#fff" /></Tap>
            </View>
          ))}
        </View>
      )}
      <T v="small" color={C.muted}>{t('القائمة')}</T>
      {a.menu.map((m, i) => (
        <Row key={i} gap={8}>
          <View style={{ flex: 2 }}><Field value={m.name} onChangeText={(v) => set({ menu: a.menu.map((x, j) => j === i ? { ...x, name: v } : x) })} placeholder={t('الصنف')} /></View>
          <View style={{ flex: 1 }}><Field value={m.price_jod != null ? String(m.price_jod) : ''} keyboardType="decimal-pad" placeholder={t('د.أ')}
            onChangeText={(v) => set({ menu: a.menu.map((x, j) => j === i ? { ...x, price_jod: v ? Number(v) : undefined } : x) })} /></View>
          <Tap onPress={() => set({ menu: a.menu.filter((_, j) => j !== i) })} accessibilityLabel={t('شيل')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
        </Row>
      ))}
      <Act label={t('+ صنف')} onPress={() => set({ menu: [...a.menu, { name: '' }] })} />
      <Field label={t('اسم صاحب المحل (للإدارة بس)')} value={a.contact_name ?? ''} onChangeText={(v) => set({ contact_name: v })} />
      <Field label={t('ملاحظات الدفع (للإدارة بس)')} value={a.notes ?? ''} onChangeText={(v) => set({ notes: v })} />
      <Toggle value={a.is_active} onChange={(v) => set({ is_active: v })} label={t('فعّال')} />
      {msg && <T v="small" color={C.red}>{msg}</T>}
      <Act label={t('احفظ المعلن')} kind="primary" onPress={save} />

      {a.id && (
        <>
          <Section title={t('إعلاناته')} right={<Act label={t('+ إعلان')} onPress={() => setEditCamp('new')} />} />
          {editCamp && <CampaignForm adv={a} camp={editCamp === 'new' ? null : editCamp} onDone={() => { setEditCamp(null); camps.reload(); }} />}
          {(camps.data ?? []).map((c) => (
            <Item key={c.id} onPress={() => setEditCamp(c)} dim={!c.is_active} title={c.title}
              sub={`${PLACES[c.placement] ?? c.placement} · ${c.starts_on} ← ${c.ends_on}\n${t('مشاهدات {0} · ضغطات {1} · اتصالات {2}', [fmtNum(st(c.id)?.impressions), fmtNum(st(c.id)?.clicks), fmtNum(st(c.id)?.calls)])}`} />
          ))}
        </>
      )}
    </View>
  );
}

export default function Ads() {
  const [sel, setSel] = useState<Adv | null>(null);
  const { data, loading, error, reload } = useLoad<(Adv & { university: { name_ar: string } | null })[]>(
    () => supabase.from('advertisers').select('*, university:universities(name_ar)').order('created_at', { ascending: false }) as never, []);

  async function close() {
    if (sel && !sel.id && sel.name.trim() && !(await confirm(t('تطلع بدون حفظ؟'), t('المعلن الجديد ما انحفظ.'), t('اطلع')))) return;
    setSel(null); reload();
  }

  return (
    <AdminScreen title={t('الإعلانات')} subtitle={t('مطاعم ومحلات حوالين الجامعات · كل إعلان مكتوب عليه «ممول»')} right={<Act label={t('+ معلن')} kind="primary" onPress={() => setSel(blankAdv())} />}>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((a) => (
            <Item key={a.id} onPress={() => { const { university, ...rest } = a; void university; setSel(rest); }} title={a.name}
              sub={[CATS[a.category], a.university?.name_ar ?? t('الكل'), a.phone].filter(Boolean).join(' · ')}
              end={a.is_active ? <Pill label={t('فعّال')} tone="green" /> : <Pill label={t('موقوف')} />} />
          ))}
        </View>
      </State>
      {!loading && (data ?? []).length === 0 && <Muted>{t('ضيف أول معلن من الزر فوق.')}</Muted>}
      <Sheet open={!!sel} onClose={close} title={sel?.id ? sel.name : t('معلن جديد')}>
        {sel && <AdvEditor key={sel.id ?? 'new'} initial={sel} onClose={() => { setSel(null); reload(); }} />}
      </Sheet>
    </AdminScreen>
  );
}
