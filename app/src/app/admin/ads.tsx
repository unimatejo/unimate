import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Item, Muted, OptionPicker, Panel, Pill, Section, Sheet, State, UniPicker, audit, confirm, done, fmtNum, useLoad, useUnis } from '@/components/admin/kit';
import { DateField } from '@/components/ui/DateField';
import { Chip, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { AdSlide } from '@/components/feed/HomeAds';
import { CTA_DEFAULT, PACKAGES, packageOf, type CtaKind, type PackageKey } from '@/lib/ads';
import { C } from '@/lib/theme';
import { normalize } from '@/lib/util';
import { t } from '@/lib/i18n';

type MenuItem = { name: string; price_jod?: number; photo_url?: string };
type Adv = {
  id?: string; university_id: string | null; name: string; category: string; description: string | null; phone: string | null; hours: string | null;
  menu: MenuItem[]; photos: string[]; logo_url: string | null; lat: number | null; lng: number | null; contact_name: string | null; notes: string | null; is_active: boolean;
  building_id: string | null;
};
type Camp = {
  id?: string; advertiser_id: string; university_ids: string[]; college_ids: string[]; placement: string; title: string; body: string | null; image_url: string | null;
  offer: string | null; cta_url: string | null; cta_label: string | null; starts_on: string; ends_on: string; daily_from: string | null; daily_to: string | null;
  priority: number; is_active: boolean; cta_kind: CtaKind | null; show_text: boolean;
};
type Stat = { campaign_id: string; impressions: number; clicks: number; calls: number; orders: number };

const CATS: Record<string, string> = { restaurant: t('مطعم'), cafe: t('كافيه'), bookshop: t('مكتبة'), print: t('طباعة'), housing: t('سكن'), courses: t('دورات'), shop: t('محل'), other: t('خدمة') };
const PLACES: Record<string, string> = { home_banner: t('بانر الرئيسية (أعلى الشاشة)'), feed_card: t('بين المنشورات'), map_pin: t('دبوس على الخريطة'), market_banner: t('بانر السوق') };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const blankAdv = (): Adv => ({ university_id: null, name: '', category: 'restaurant', description: '', phone: '', hours: '', menu: [], photos: [], logo_url: null, lat: null, lng: null, contact_name: '', notes: '', is_active: true, building_id: null });
const CTA_KINDS: [CtaKind | null, string][] = [[null, t('بدون زر')], ['link', t('رابط موقعه')], ['map', t('خذني إليه')], ['call', t('اتصال')]];
/** ready words for the button, any of them can be changed by hand */
const CTA_WORDS = [t('اطلب الآن'), t('اذهب إلى الموقع'), t('احجز الآن'), t('مشاهدة العرض'), t('الاتجاهات'), t('اتصل الآن')];

/** `banner`: the picture is cut to the banner's shape (2:1) in the crop editor first, like cutting it by hand. */
async function pickAndUpload(banner = false): Promise<string | null> {
  const f = await pickMedia(banner ? { crop: 'post', aspect: 2 } : { maxWidth: 1600 });
  if (!f) return null;
  const path = await uploadFile('ads', 'admin', f);
  return publicUrl('ads', path);
}

/** Where the advertiser is on campus: one of the university's buildings, so «وديني» walks students to the door. */
function BuildingPicker({ universityId, value, onChange }: { universityId: string | null; value: string | null; onChange: (b: { id: string; lat: number; lng: number } | null) => void }) {
  const [q, setQ] = useState('');
  const { data } = useLoad<{ id: string; name_ar: string; lat: number; lng: number }[]>(
    () => universityId ? supabase.from('buildings').select('id, name_ar, lat, lng').eq('university_id', universityId).eq('state', 'approved').not('lat', 'is', null).order('name_ar') as never : Promise.resolve({ data: [], error: null }), [universityId]);
  const chosen = (data ?? []).find((b) => b.id === value);
  const hits = (data ?? []).filter((b) => !q.trim() || normalize(b.name_ar).includes(normalize(q))).slice(0, 8);
  if (!universityId) return <Muted>{t('اختر جامعة المعلن أولاً، ثم اختر مبناه.')}</Muted>;
  return (
    <View style={{ gap: 8 }}>
      <T v="small" color={C.muted}>{chosen ? t('موقعه: {0}', [chosen.name_ar]) : t('موقعه في الجامعة (اختياري): ابحث عن المبنى')}</T>
      <Field value={q} onChangeText={setQ} placeholder={t('اسم المبنى، مثلاً كلية الهندسة')} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {hits.map((b) => <Chip key={b.id} label={b.name_ar} active={b.id === value} onPress={() => onChange(b.id === value ? null : b)} />)}
      </View>
    </View>
  );
}

function CampaignForm({ adv, camp, onDone }: { adv: Adv; camp: Camp | null; onDone: () => void }) {
  const unis = useUnis();
  const [c, setC] = useState<Camp>(() => camp ?? {
    advertiser_id: adv.id!, university_ids: adv.university_id ? [adv.university_id] : [], college_ids: [], placement: 'home_banner', title: '', body: '', image_url: null,
    offer: '', cta_url: '', cta_label: '', starts_on: today(), ends_on: ymd(new Date(Date.now() + 30 * 864e5)), daily_from: null, daily_to: null, priority: 10, is_active: true,
    cta_kind: 'link', show_text: true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<Camp>) => setC((x) => ({ ...x, ...p }));

  async function save() {
    if (!c.title.trim() || c.university_ids.length === 0) { setMsg(t('أدخل عنوانًا واختر جامعة واحدة على الأقل.')); return; }
    const cta = c.cta_kind === 'link' ? c.cta_url?.trim() || null : null;
    if (c.cta_kind === 'link' && (!cta || !/^https:\/\/\S+$/i.test(cta))) { setMsg(t('يجب أن يبدأ رابط الزر بـ https://')); return; }
    if (c.cta_kind === 'map' && !adv.building_id && adv.lat == null) { setMsg(t('حدّد موقع المعلن (المبنى) في الأعلى ليعمل زر «الاتجاهات».')); return; }
    if (c.cta_kind === 'call' && !adv.phone?.trim()) { setMsg(t('أدخل رقم هاتف المعلن في الأعلى ليعمل زر الاتصال.')); return; }
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if ((c.daily_from && !time.test(c.daily_from)) || (c.daily_to && !time.test(c.daily_to))) { setMsg(t('اكتب الوقت بهذا الشكل: 08:00')); return; }
    const row = { ...c, daily_from: c.daily_from || null, daily_to: c.daily_to || null, body: c.body?.trim() || null, offer: c.offer?.trim() || null,
      title: c.title.trim(), cta_url: cta, cta_label: c.cta_kind ? c.cta_label?.trim() || null : null };
    const { error } = c.id ? await supabase.from('ad_campaigns').update(row).eq('id', c.id) : await supabase.from('ad_campaigns').insert(row);
    if (error) { setMsg(error.message); return; }
    await audit(c.id ? 'edit_campaign' : 'add_campaign', 'campaign', c.id ?? adv.id!, { title: c.title });
    done(); onDone();
  }

  return (
    <Panel>
      <T v="h3">{c.id ? t('تعديل الإعلان') : t('إعلان جديد')}</T>
      <OptionPicker label={t('المكان')} value={c.placement} options={PLACES} onChange={(v) => set({ placement: v })} />
      <Field label={t('العنوان (60 حرفاً)')} value={c.title} onChangeText={(v) => set({ title: v })} maxLength={60} />
      <Field label={t('العرض')} value={c.offer ?? ''} onChangeText={(v) => set({ offer: v })} placeholder={t('خصم 20% للطلاب')} />
      <Field label={t('النص (140 حرفاً)')} value={c.body ?? ''} onChangeText={(v) => set({ body: v })} maxLength={140} />
      <OptionPicker label={t('الباقة (الأعلى يظهر أولاً)')} value={String(packageOf(c.priority))}
        options={PACKAGES as Record<PackageKey, string> as unknown as Record<string, string>} onChange={(v) => set({ priority: Number(v) })} />
      <T v="small" color={C.muted}>{t('زر الإعلان')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {CTA_KINDS.map(([k, l]) => <Chip key={l} label={l} active={c.cta_kind === k} onPress={() => set({ cta_kind: k })} />)}
      </View>
      {c.cta_kind === 'link' && (
        <Field label={t('رابط موقعه أو صفحة الطلب')} value={c.cta_url ?? ''} onChangeText={(v) => set({ cta_url: v })} placeholder="https://"
          autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
      )}
      {c.cta_kind === 'map' && <Muted>{t('يفتح خريطة الجامعة ويرشد الطالب إلى مكان المعلن.')}</Muted>}
      {c.cta_kind === 'call' && <Muted>{t('يتصل برقم المعلن: {0}', [adv.phone || t('(لا يوجد رقم بعد)')])}</Muted>}
      {c.cta_kind && (
        <>
          <Field label={t('الكلمة على الزر')} value={c.cta_label ?? ''} onChangeText={(v) => set({ cta_label: v })} placeholder={CTA_DEFAULT[c.cta_kind]} maxLength={20} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CTA_WORDS.map((w) => <Chip key={w} label={w} active={c.cta_label === w} onPress={() => set({ cta_label: w })} />)}
          </View>
        </>
      )}
      <T v="small" color={C.muted}>{t('صورة البانر (تُقصّ بحسب شكل البانر)')}</T>
      <Row gap={10}>
        <Act label={c.image_url ? t('غيّر الصورة') : t('أضف صورة')} onPress={async () => { try { const u = await pickAndUpload(true); if (u) set({ image_url: u }); } catch (e) { setMsg((e as Error).message); } }} />
        {c.image_url ? <Act label={t('إزالة الصورة')} onPress={() => set({ image_url: null })} /> : null}
      </Row>
      {c.image_url ? <Toggle value={!c.show_text} onChange={(v) => set({ show_text: !v })} label={t('النص جاهز على الصورة')}
        hint={t('يظهر البانر كما هو، وفوقه «ممول» والزر فقط.')} /> : null}
      <T v="small" color={C.muted}>{t('هكذا سيظهر للطلاب:')}</T>
      <AdSlide ad={{ campaign_id: c.id ?? 'preview', advertiser_id: adv.id ?? '', advertiser_name: adv.name || t('اسم المتجر'), title: c.title || t('عنوان الإعلان'),
        body: c.body || null, image_url: c.image_url, offer: c.offer || null, logo_url: adv.logo_url, cta_url: c.cta_url?.trim() || null, cta_label: c.cta_label || null, priority: c.priority,
        cta_kind: c.cta_kind, show_text: c.show_text, building_id: adv.building_id, phone: adv.phone }} />
      <T v="small" color={C.muted}>{t('من تاريخ')}</T>
      <DateField value={new Date(c.starts_on)} onChange={(d) => set({ starts_on: ymd(d) })} />
      <T v="small" color={C.muted}>{t('إلى تاريخ')}</T>
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
      <Toggle value={c.is_active} onChange={(v) => set({ is_active: v })} label={t('مفعّل')} />
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
      <Field label={t('الهاتف (يظهر للطلاب)')} value={a.phone ?? ''} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
      <Field label={t('الدوام')} value={a.hours ?? ''} onChangeText={(v) => set({ hours: v })} placeholder={t('يوميًا 8 صباحًا - 11 مساءً')} />
      <BuildingPicker universityId={a.university_id} value={a.building_id}
        onChange={(b) => set(b ? { building_id: b.id, lat: b.lat, lng: b.lng } : { building_id: null })} />
      {!a.building_id && (
        <Field label={t('خارج الجامعة؟ الموقع (lat, lng)')} value={a.lat != null ? `${a.lat}, ${a.lng}` : ''} placeholder="32.0139, 35.8728"
          onChangeText={(v) => { const [la, ln] = v.split(',').map((x) => parseFloat(x)); set({ lat: Number.isFinite(la) ? la : null, lng: Number.isFinite(ln) ? ln : null }); }} />
      )}
      <Field label={t('الوصف')} value={a.description ?? ''} onChangeText={(v) => set({ description: v })} multiline style={{ minHeight: 80, paddingTop: 14 }} />
      <Row gap={10}>
        {a.logo_url ? <Image source={{ uri: a.logo_url }} style={{ width: 52, height: 52, borderRadius: 26 }} /> : null}
        <Act label={t('الشعار')} onPress={() => up((u) => set({ logo_url: u }))} />
        <Act label={t('+ صورة')} onPress={() => up((u) => setA((x) => ({ ...x, photos: [...x.photos, u] })))} />
      </Row>
      {a.photos.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {a.photos.map((p) => (
            <View key={p}>
              <Image source={{ uri: p }} style={{ width: 96, height: 72, borderRadius: 10 }} contentFit="cover" />
              <Tap onPress={() => set({ photos: a.photos.filter((x) => x !== p) })} accessibilityLabel={t('إزالة الصورة')} style={{ position: 'absolute', top: 2, left: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: C.overlay, alignItems: 'center', justifyContent: 'center' }}><X size={14} color="#fff" /></Tap>
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
          <Tap onPress={() => set({ menu: a.menu.filter((_, j) => j !== i) })} accessibilityLabel={t('إزالة')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
        </Row>
      ))}
      <Act label={t('+ صنف')} onPress={() => set({ menu: [...a.menu, { name: '' }] })} />
      <Field label={t('اسم صاحب المتجر (للإدارة فقط)')} value={a.contact_name ?? ''} onChangeText={(v) => set({ contact_name: v })} />
      <Field label={t('ملاحظات الدفع (للإدارة فقط)')} value={a.notes ?? ''} onChangeText={(v) => set({ notes: v })} />
      <Toggle value={a.is_active} onChange={(v) => set({ is_active: v })} label={t('فعّال')} />
      {msg && <T v="small" color={C.red}>{msg}</T>}
      <Act label={t('احفظ المعلن')} kind="primary" onPress={save} />

      {a.id && (
        <>
          <Section title={t('إعلاناته')} right={<Act label={t('+ إعلان')} onPress={() => setEditCamp('new')} />} />
          {editCamp && <CampaignForm adv={a} camp={editCamp === 'new' ? null : editCamp} onDone={() => { setEditCamp(null); camps.reload(); }} />}
          {(camps.data ?? []).map((c) => (
            <Item key={c.id} onPress={() => setEditCamp(c)} dim={!c.is_active} title={c.title}
              sub={`${PLACES[c.placement] ?? c.placement} · ${c.starts_on} ← ${c.ends_on}\n${t('{0} · مشاهدات {1} · ضغطات {2} · طلبات {3} · اتصالات {4}', [PACKAGES[packageOf(c.priority)], fmtNum(st(c.id)?.impressions), fmtNum(st(c.id)?.clicks), fmtNum(st(c.id)?.orders), fmtNum(st(c.id)?.calls)])}`} />
          ))}
        </>
      )}
    </View>
  );
}

/** Admin › ads: advertisers, their campaigns and results (owner only). */
export default function Ads() {
  const [sel, setSel] = useState<Adv | null>(null);
  const { data, loading, error, reload } = useLoad<(Adv & { university: { name_ar: string } | null })[]>(
    () => supabase.from('advertisers').select('*, university:universities(name_ar)').order('created_at', { ascending: false }) as never, []);

  async function close() {
    if (sel && !sel.id && sel.name.trim() && !(await confirm(t('الخروج دون حفظ؟'), t('تعذّر حفظ المعلن الجديد.'), t('خروج')))) return;
    setSel(null); reload();
  }

  return (
    <AdminScreen ownerOnly title={t('الإعلانات')} subtitle={t('مطاعم ومحلات حول الجامعات · كل إعلان يحمل علامة «ممول»')} right={<Act label={t('+ معلن')} kind="primary" onPress={() => setSel(blankAdv())} />}>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 8 }}>
          {(data ?? []).map((a) => (
            <Item key={a.id} onPress={() => { const { university, ...rest } = a; void university; setSel(rest); }} title={a.name}
              sub={[CATS[a.category], a.university?.name_ar ?? t('الكل'), a.phone].filter(Boolean).join(' · ')}
              end={a.is_active ? <Pill label={t('فعّال')} tone="green" /> : <Pill label={t('موقوف')} />} />
          ))}
        </View>
      </State>
      {!loading && (data ?? []).length === 0 && <Muted>{t('أضف أول معلن من الزر في الأعلى.')}</Muted>}
      <Sheet open={!!sel} onClose={close} title={sel?.id ? sel.name : t('معلن جديد')}>
        {sel && <AdvEditor key={sel.id ?? 'new'} initial={sel} onClose={() => { setSel(null); reload(); }} />}
      </Sheet>
    </AdminScreen>
  );
}
