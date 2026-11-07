import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { View } from 'react-native';

import { Act, Actions, AdminScreen, Muted, OptionPicker, Panel, Pill, Section, Sheet, State, UniPicker, audit, confirm, done, fmtNum, useLoad, useUnis } from '@/components/admin/kit';
import { DateField } from '@/components/ui/DateField';
import { Chip, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { pickOnMap } from '@/lib/mapPick';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { AdSlide } from '@/components/feed/HomeAds';
import { CTA_DEFAULT, PACKAGES, packageOf, type Ad, type CtaKind, type PackageKey } from '@/lib/ads';
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
/** The button in one tap: its words and what it does come together (the words can still be changed by hand). */
const CTA_ACTIONS: [string, CtaKind][] = [
  [t('اطلب الآن'), 'link'], [t('اذهب إلى الموقع'), 'link'], [t('احجز الآن'), 'link'],
  [t('شاهد العرض'), 'link'], [t('خذني إليه'), 'map'], [t('اتصل الآن'), 'call'],
];

/** Stop or start an advertiser or one ad straight from the list; logged. */
async function switchOn(table: 'advertisers' | 'ad_campaigns', id: string, on: boolean, name: string) {
  const { error } = await supabase.from(table).update({ is_active: on }).eq('id', id);
  if (error) return;
  await audit(on ? 'ad_on' : 'ad_off', table === 'advertisers' ? 'advertiser' : 'campaign', id, { name });
  done();
}

function OnOff({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <Act label={on ? t('فعّال · أوقفه') : t('موقوف · شغّله')} kind={on ? 'green' : 'soft'} onPress={() => onChange(!on)} />;
}

/** A campaign as the banner students see (the admin's previews use the same card as Home). */
function toAd(adv: Adv, c: Camp): Ad {
  return {
    campaign_id: c.id ?? 'preview', advertiser_id: adv.id ?? '', advertiser_name: adv.name || t('اسم المحل'), title: c.title || t('عنوان الإعلان'),
    body: c.body || null, image_url: c.image_url, offer: c.offer || null, logo_url: adv.logo_url, cta_url: c.cta_url?.trim() || null,
    cta_label: c.cta_label || null, priority: c.priority, cta_kind: c.cta_kind, show_text: c.show_text, building_id: adv.building_id, phone: adv.phone,
  };
}

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

/**
 * One ad, quick: a photo (which then is the whole banner) or a headline, a button, and how long. A new shop is
 * written right here (its name and phone) and saved with the ad; everything else about it can wait.
 */
function CampaignForm({ adv: given, camp, onDone }: { adv: Adv; camp: Camp | null; onDone: () => void }) {
  const unis = useUnis();
  const [adv, setAdv] = useState<Adv>(given);
  const [c, setC] = useState<Camp>(() => camp ?? {
    advertiser_id: given.id ?? '', university_ids: given.university_id ? [given.university_id] : [], college_ids: [], placement: 'home_banner', title: '', body: '',
    image_url: null, offer: '', cta_url: '', cta_label: '', starts_on: today(), ends_on: ymd(new Date(Date.now() + 30 * 864e5)), daily_from: null, daily_to: null,
    priority: 10, is_active: true, cta_kind: given.phone ? 'call' : null, show_text: true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Camp>) => setC((x) => ({ ...x, ...p }));
  const everywhere = unis.length > 0 && unis.every((u) => c.university_ids.includes(u.id));

  async function save() {
    setMsg(null);
    if (!adv.name.trim()) { setMsg(t('اكتب اسم المحل')); return; }
    if (!c.image_url && !c.title.trim()) { setMsg(t('أضف صورة للبانر أو اكتب عنوانًا.')); return; }
    // nobody chosen: the shop's university, or every university
    const reach = c.university_ids.length ? c.university_ids : adv.university_id ? [adv.university_id] : unis.map((u) => u.id);
    const cta = c.cta_kind === 'link' ? c.cta_url?.trim() || null : null;
    if (c.cta_kind === 'link' && (!cta || !/^https:\/\/\S+$/i.test(cta))) { setMsg(t('يجب أن يبدأ رابط الزر بـ https://')); return; }
    if (c.cta_kind === 'map' && !adv.building_id && adv.lat == null) { setMsg(t('حدّد مكان المحل على الخريطة من صفحة المحل ليعمل زر «خذني إليه».')); return; }
    if (c.cta_kind === 'call' && !adv.phone?.trim()) { setMsg(t('اكتب رقم هاتف المحل ليعمل زر الاتصال.')); return; }
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if ((c.daily_from && !time.test(c.daily_from)) || (c.daily_to && !time.test(c.daily_to))) { setMsg(t('اكتب الوقت بهذا الشكل: 08:00')); return; }
    if (c.ends_on < c.starts_on) { setMsg(t('تاريخ النهاية قبل تاريخ البداية.')); return; }
    setBusy(true);
    // a new shop is saved first, with what was written here
    let advId = adv.id;
    if (!advId) {
      const { id: _drop, ...row } = adv; void _drop;
      const r = await supabase.from('advertisers').insert({ ...row, name: adv.name.trim(), phone: adv.phone?.trim() || null }).select('id').single();
      if (r.error) { setBusy(false); setMsg(r.error.message); return; }
      advId = r.data.id; setAdv((x) => ({ ...x, id: advId }));
      await audit('add_advertiser', 'advertiser', advId!, { name: adv.name });
    } else if ((adv.phone ?? '') !== (given.phone ?? '')) {
      await supabase.from('advertisers').update({ phone: adv.phone?.trim() || null }).eq('id', advId);
    }
    const row = { ...c, advertiser_id: advId, university_ids: reach, daily_from: c.daily_from || null, daily_to: c.daily_to || null,
      body: c.body?.trim() || null, offer: c.offer?.trim() || null, title: (c.title.trim() || adv.name.trim()).slice(0, 60),
      // a photo is the whole banner: only «ممول» and the button go on it
      show_text: !c.image_url, cta_url: cta, cta_label: c.cta_kind ? c.cta_label?.trim() || null : null };
    const { error } = c.id ? await supabase.from('ad_campaigns').update(row).eq('id', c.id) : await supabase.from('ad_campaigns').insert(row);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    await audit(c.id ? 'edit_campaign' : 'add_campaign', 'campaign', c.id ?? advId!, { title: row.title });
    done(); onDone();
  }

  const preview = <AdSlide ad={toAd(adv, { ...c, show_text: !c.image_url })} />;
  return (
    <View style={{ gap: 12 }}>
      {given.id ? (
        <Row gap={8}>
          <T v="h3" style={{ flex: 1 }}>{c.id ? t('تعديل الإعلان') : t('إعلان جديد لـ {0}', [adv.name])}</T>
          <Act label={t('رجوع')} onPress={onDone} />
        </Row>
      ) : null}
      <T v="small" color={C.muted}>{t('هكذا سيظهر للطلاب في الرئيسية، ويتغير وأنت تكتب:')}</T>
      {preview}

      {!adv.id && (
        <>
          <Section title={t('المحل')} />
          <Panel>
            <Field label={t('اسم المحل')} value={adv.name} onChangeText={(v) => setAdv((x) => ({ ...x, name: v }))} placeholder={t('مثلًا: أفران الشام')} />
            <Field label={t('رقم الهاتف (اختياري)')} value={adv.phone ?? ''} onChangeText={(v) => setAdv((x) => ({ ...x, phone: v }))} keyboardType="phone-pad" />
            <Muted>{t('باقي معلومات المحل (مكانه على الخريطة، شعاره، قائمته) تضيفها لاحقًا من صفحته.')}</Muted>
          </Panel>
        </>
      )}

      <Section title={t('1. صورة البانر')} />
      <Panel>
        <Row gap={10}>
          <Act kind={c.image_url ? 'soft' : 'primary'} label={c.image_url ? t('غيّر الصورة') : t('أضف صورة')} onPress={async () => { try { const u = await pickAndUpload(true); if (u) set({ image_url: u }); } catch (e) { setMsg((e as Error).message); } }} />
          {c.image_url ? <Act label={t('إزالة الصورة')} onPress={() => set({ image_url: null })} /> : null}
        </Row>
        <Muted>{c.image_url
          ? t('الصورة هي البانر كاملًا: لا شعار ولا كلام فوقها، فقط «ممول» والزر.')
          : t('بصورة: تصبح هي البانر كاملًا. دونها: يُبنى البانر من العنوان والعرض أدناه.')}</Muted>
      </Panel>

      {!c.image_url && (
        <>
          <Section title={t('2. الكلام')} />
          <Panel>
            <Field label={t('العنوان الكبير (60 حرفًا)')} value={c.title} onChangeText={(v) => set({ title: v })} maxLength={60} placeholder={t('مثلًا: فطور الطلاب بدينار')} />
            <Field label={t('العرض (يظهر بشارة صفراء، اختياري)')} value={c.offer ?? ''} onChangeText={(v) => set({ offer: v })} placeholder={t('خصم 20% للطلاب')} />
            <Field label={t('سطر صغير تحت العنوان (اختياري)')} value={c.body ?? ''} onChangeText={(v) => set({ body: v })} maxLength={140} />
          </Panel>
        </>
      )}

      <Section title={c.image_url ? t('2. الزر') : t('3. الزر')} />
      <Panel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {CTA_ACTIONS.map(([w, k]) => <Chip key={w} label={w} active={c.cta_kind === k && (c.cta_label || CTA_DEFAULT[k]) === w} onPress={() => set({ cta_kind: k, cta_label: w })} />)}
          <Chip label={t('بدون زر')} active={!c.cta_kind} onPress={() => set({ cta_kind: null, cta_label: '' })} />
        </View>
        {c.cta_kind === 'link' && (
          <Field label={t('رابط موقعه أو صفحة الطلب')} value={c.cta_url ?? ''} onChangeText={(v) => set({ cta_url: v })} placeholder="https://"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
        )}
        {c.cta_kind === 'call' && adv.id && (
          <Field label={t('رقم هاتف المحل')} value={adv.phone ?? ''} onChangeText={(v) => setAdv((x) => ({ ...x, phone: v }))} keyboardType="phone-pad" />
        )}
        {c.cta_kind === 'map' && <Muted>{adv.lat != null || adv.building_id
          ? t('يفتح خريطة الجامعة ويرشد الطالب إلى المحل خطوة بخطوة.')
          : t('حدّد مكان المحل على الخريطة من صفحة المحل ليعمل هذا الزر.')}</Muted>}
        <Muted>{t('الضغط على أي مكان في البانر يفتح صفحة المحل: رقمه وموقعه وقائمته.')}</Muted>
      </Panel>

      <Section title={c.image_url ? t('3. المدة ولمن') : t('4. المدة ولمن')} />
      <Panel>
        <Row gap={8}>
          <View style={{ flex: 1, gap: 6 }}><T v="small" color={C.muted}>{t('من تاريخ')}</T><DateField value={new Date(c.starts_on)} onChange={(d) => set({ starts_on: ymd(d) })} /></View>
          <View style={{ flex: 1, gap: 6 }}><T v="small" color={C.muted}>{t('إلى تاريخ')}</T><DateField value={new Date(c.ends_on)} onChange={(d) => set({ ends_on: ymd(d) })} /></View>
        </Row>
        <T v="small" color={C.muted}>{t('يظهر لطلاب')}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t('كل الجامعات')} active={everywhere} onPress={() => set({ university_ids: everywhere ? [] : unis.map((u) => u.id) })} />
          {unis.map((u) => {
            const on = c.university_ids.includes(u.id);
            return <Chip key={u.id} label={u.name_ar} active={on && !everywhere} onPress={() => set({ university_ids: everywhere ? [u.id] : on ? c.university_ids.filter((x) => x !== u.id) : [...c.university_ids, u.id] })} />;
          })}
        </View>
        {!c.university_ids.length && <Muted>{adv.university_id ? t('لم تختر: يظهر لطلاب جامعة المحل.') : t('لم تختر: يظهر لطلاب كل الجامعات.')}</Muted>}
      </Panel>

      <Section title={t('خيارات إضافية (اختياري)')} />
      <Panel>
        <Row gap={8}>
          <View style={{ flex: 1 }}><Field label={t('كل يوم من الساعة')} value={c.daily_from ?? ''} onChangeText={(v) => set({ daily_from: v })} placeholder="08:00" /></View>
          <View style={{ flex: 1 }}><Field label={t('للساعة')} value={c.daily_to ?? ''} onChangeText={(v) => set({ daily_to: v })} placeholder="23:00" /></View>
        </Row>
        <Muted>{t('اترك الساعات فارغة ليظهر طول اليوم.')}</Muted>
        <OptionPicker label={t('الباقة (الأعلى يظهر أولًا)')} value={String(packageOf(c.priority))}
          options={PACKAGES as Record<PackageKey, string> as unknown as Record<string, string>} onChange={(v) => set({ priority: Number(v) })} />
        <OptionPicker label={t('مكانه في التطبيق')} value={c.placement} options={PLACES} onChange={(v) => set({ placement: v })} />
      </Panel>

      <Toggle value={c.is_active} onChange={(v) => set({ is_active: v })} label={t('منشور')} hint={t('أوقفه متى شئت دون حذفه.')} />
      {msg && <T v="small" color={C.red}>{msg}</T>}
      <Actions><Act label={c.id ? t('احفظ التعديلات') : t('انشر الإعلان')} kind="primary" loading={busy} onPress={save} /><Act label={t('إلغاء')} onPress={onDone} /></Actions>
    </View>
  );
}

/** Where a campaign stands for students right now. */
function campState(c: Camp): [string, string] {
  const d = today();
  if (!c.is_active) return [t('موقوف'), ''];
  if (c.starts_on > d) return [t('يبدأ {0}', [c.starts_on]), 'blue'];
  if (c.ends_on < d) return [t('انتهت مدته'), ''];
  return [t('يظهر الآن للطلاب'), 'green'];
}

function AdvEditor({ initial, onClose, onPickSpot }: { initial: Adv; onClose: () => void; onPickSpot: (a: Adv) => void }) {
  const [a, setA] = useState<Adv>(initial);
  const [editCamp, setEditCamp] = useState<Camp | null | 'new'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<Adv>) => setA((x) => ({ ...x, ...p }));
  const camps = useLoad<Camp[]>(() => a.id ? supabase.from('ad_campaigns').select('*').eq('advertiser_id', a.id).order('created_at', { ascending: false }) as never : Promise.resolve({ data: [], error: null }), [a.id]);
  const stats = useLoad<Stat[]>(() => supabase.rpc('admin_ad_stats'), [a.id]);

  async function save() {
    if (!a.name.trim()) { setMsg(t('اكتب اسم المحل')); return; }
    const { id, ...row } = a;
    const r = id ? await supabase.from('advertisers').update(row).eq('id', id).select('id').single() : await supabase.from('advertisers').insert(row).select('id').single();
    if (r.error) { setMsg(r.error.message); return; }
    await audit(id ? 'edit_advertiser' : 'add_advertiser', 'advertiser', r.data.id, { name: a.name });
    done(); set({ id: r.data.id }); setMsg(null);
    // a new shop goes straight on to its first ad: nothing shows to students without one
    if (!id) setEditCamp('new'); else onClose();
  }
  const up = async (f: (u: string) => void) => { try { const u = await pickAndUpload(); if (u) f(u); } catch (e) { setMsg((e as Error).message); } };
  const st = (cid?: string) => stats.data?.find((s) => s.campaign_id === cid);

  if (editCamp && a.id) return <CampaignForm adv={a} camp={editCamp === 'new' ? null : editCamp} onDone={() => { setEditCamp(null); camps.reload(); }} />;

  return (
    <View style={{ gap: 12 }}>
      {a.id && (
        <>
          <Section title={t('إعلانات المحل')} right={(camps.data ?? []).length ? <Act label={t('+ إعلان')} kind="primary" onPress={() => setEditCamp('new')} /> : undefined} />
          {!camps.loading && !(camps.data ?? []).length && (
            <Panel>
              <T v="bodyMd">{t('لا يوجد إعلان لهذا المحل بعد')}</T>
              <Muted>{t('لن يظهر شيء للطلاب حتى تنشئ إعلانًا: بانر في الرئيسية بصورته وزرّه.')}</Muted>
              <Act label={t('أنشئ الإعلان')} kind="primary" onPress={() => setEditCamp('new')} />
            </Panel>
          )}
          {(camps.data ?? []).map((c) => {
            const [state, tone] = campState(c);
            return (
              <View key={c.id} style={{ gap: 8, opacity: c.is_active ? 1 : 0.6 }}>
                <AdSlide ad={toAd(a, c)} onOpen={() => setEditCamp(c)} />
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <Pill label={state} tone={tone} />
                  <Muted>{t('مشاهدات {0} · ضغطات {1} · اتصالات {2}', [fmtNum(st(c.id)?.impressions), fmtNum(st(c.id)?.clicks), fmtNum(st(c.id)?.calls)])}</Muted>
                </Row>
                <Row gap={8}>
                  <Act label={t('عدّل')} onPress={() => setEditCamp(c)} />
                  <OnOff on={c.is_active} onChange={(v) => switchOn('ad_campaigns', c.id!, v, c.title).then(camps.reload)} />
                </Row>
              </View>
            );
          })}
        </>
      )}

      <Section title={t('معلومات المحل')} />
      <Panel>
        <Field label={t('اسم المحل')} value={a.name} onChangeText={(v) => set({ name: v })} />
        <OptionPicker label={t('النوع')} value={a.category} options={CATS} onChange={(v) => set({ category: v })} />
        <UniPicker value={a.university_id ?? ''} onChange={(v) => set({ university_id: v || null })} label={t('الجامعة القريب منها')} />
        <Field label={t('الهاتف (يظهر للطلاب ويعمل عليه زر الاتصال)')} value={a.phone ?? ''} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
        <Field label={t('الدوام')} value={a.hours ?? ''} onChangeText={(v) => set({ hours: v })} placeholder={t('يوميًا 8 صباحًا - 11 مساءً')} />
        <Field label={t('نبذة')} value={a.description ?? ''} onChangeText={(v) => set({ description: v })} multiline style={{ minHeight: 80, paddingTop: 14 }} />
      </Panel>

      <Section title={t('الشعار والصور')} />
      <Panel>
        <Row gap={10}>
          {a.logo_url ? <Image source={{ uri: a.logo_url }} style={{ width: 52, height: 52, borderRadius: 26 }} /> : null}
          <Act label={a.logo_url ? t('غيّر الشعار') : t('أضف الشعار')} onPress={() => up((u) => set({ logo_url: u }))} />
          <Act label={t('+ صورة للمحل')} onPress={() => up((u) => setA((x) => ({ ...x, photos: [...x.photos, u] })))} />
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
      </Panel>

      <Section title={t('مكانه على الخريطة')} />
      <Panel>
        <Row gap={8}>
          <Act kind={a.lat != null ? 'soft' : 'primary'} label={a.lat != null && !a.building_id ? t('غيّر مكانه على الخريطة') : t('حدّد مكانه على الخريطة')}
            onPress={() => (a.university_id ? onPickSpot(a) : setMsg(t('اختر جامعة المحل أولًا.')))} />
          {a.lat != null ? <Act label={t('إزالة المكان')} onPress={() => set({ lat: null, lng: null, building_id: null })} /> : null}
        </Row>
        <Muted>{a.lat != null
          ? t('مكانه محدّد، ويظهر للطلاب على خريطة الجامعة بإطار ذهبي وعلامة «ممول» ما دام فعّالًا.')
          : t('اختر مبناه، أو حدّد مكانه بالضبط على الخريطة بلمسة، دون كتابة إحداثيات.')}</Muted>
        <BuildingPicker universityId={a.university_id} value={a.building_id}
          onChange={(b) => set(b ? { building_id: b.id, lat: b.lat, lng: b.lng } : { building_id: null })} />
      </Panel>

      <Section title={t('القائمة (اختياري)')} />
      <Panel>
        {a.menu.map((m, i) => (
          <Row key={i} gap={8}>
            <View style={{ flex: 2 }}><Field value={m.name} onChangeText={(v) => set({ menu: a.menu.map((x, j) => j === i ? { ...x, name: v } : x) })} placeholder={t('الصنف')} /></View>
            <View style={{ flex: 1 }}><Field value={m.price_jod != null ? String(m.price_jod) : ''} keyboardType="decimal-pad" placeholder={t('د.أ')}
              onChangeText={(v) => set({ menu: a.menu.map((x, j) => j === i ? { ...x, price_jod: v ? Number(v) : undefined } : x) })} /></View>
            <Tap onPress={() => set({ menu: a.menu.filter((_, j) => j !== i) })} accessibilityLabel={t('إزالة')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><X size={18} color={C.muted} /></Tap>
          </Row>
        ))}
        <Act label={t('+ صنف')} onPress={() => set({ menu: [...a.menu, { name: '' }] })} />
      </Panel>

      <Section title={t('للإدارة فقط')} />
      <Panel>
        <Field label={t('اسم صاحب المحل')} value={a.contact_name ?? ''} onChangeText={(v) => set({ contact_name: v })} />
        <Field label={t('ملاحظات الدفع')} value={a.notes ?? ''} onChangeText={(v) => set({ notes: v })} />
        <Toggle value={a.is_active} onChange={(v) => set({ is_active: v })} label={t('المحل فعّال')} hint={t('إيقافه يخفي كل إعلاناته ودبوسه على الخريطة.')} />
      </Panel>
      {msg && <T v="small" color={C.red}>{msg}</T>}
      <Act label={a.id ? t('احفظ معلومات المحل') : t('احفظ وأنشئ الإعلان')} kind="primary" onPress={save} />
    </View>
  );
}

/** Admin › ads: advertisers, their campaigns and results (owner only). */
export default function Ads() {
  const [sel, setSel] = useState<Adv | null>(null);
  // «+ إعلان»: which shop first (one of them, or a new one written in the ad itself)
  const [quick, setQuick] = useState<'choose' | Adv | null>(null);
  const { data, loading, error, reload } = useLoad<(Adv & { university: { name_ar: string } | null; camps: Camp[] })[]>(
    () => supabase.from('advertisers').select('*, university:universities(name_ar), camps:ad_campaigns(*)').order('created_at', { ascending: false }) as never, []);

  // pointing at the shop on the map: the editor steps aside and comes back with the spot
  const [picking, setPicking] = useState(false);
  async function pickSpot(a: Adv) {
    setSel(a); setPicking(true);
    const p = await pickOnMap(a.university_id!);
    setPicking(false);
    if (p) setSel({ ...a, lat: p.lat, lng: p.lng, building_id: null });
  }

  async function close() {
    if (sel && !sel.id && sel.name.trim() && !(await confirm(t('الخروج دون حفظ؟'), t('تعذّر حفظ المعلن الجديد.'), t('خروج')))) return;
    setSel(null); reload();
  }
  const open = (a: Adv & { university?: unknown; camps?: unknown }) => { const { university, camps, ...rest } = a; void university; void camps; setSel(rest); };

  return (
    <AdminScreen ownerOnly title={t('الإعلانات')} subtitle={t('مطاعم ومحلات حول الجامعات · كل إعلان يحمل علامة «ممول»')} right={<Act label={t('+ إعلان')} kind="primary" onPress={() => setQuick((data ?? []).length ? 'choose' : blankAdv())} />}>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 18 }}>
          {(data ?? []).map((a) => {
            const live = a.camps.find((c) => campState(c)[1] === 'green') ?? a.camps[0];
            const [state, tone] = live ? campState(live) : [t('لا يوجد إعلان بعد'), 'orange'];
            return (
              <View key={a.id} style={{ gap: 8, opacity: a.is_active ? 1 : 0.55 }}>
                {live ? <AdSlide ad={toAd(a, live)} onOpen={() => open(a)} /> : (
                  <Panel onPress={() => open(a)} style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: C.line, minHeight: 110, justifyContent: 'center', alignItems: 'center' }}>
                    <Muted>{t('لا يظهر شيء للطلاب بعد. اضغط لإنشاء إعلانه.')}</Muted>
                  </Panel>
                )}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <T v="bold" style={{ flexShrink: 1 }}>{a.name}</T>
                  <Pill label={state} tone={tone} />
                  <Muted>{[CATS[a.category], a.university?.name_ar ?? t('كل الجامعات'), a.lat != null ? t('على الخريطة') : null].filter(Boolean).join(' · ')}</Muted>
                </Row>
                <Row gap={8}>
                  <Act label={t('افتح')} onPress={() => open(a)} />
                  <OnOff on={a.is_active} onChange={(v) => switchOn('advertisers', a.id!, v, a.name).then(reload)} />
                </Row>
              </View>
            );
          })}
        </View>
      </State>
      {!loading && (data ?? []).length === 0 && <Muted>{t('أضف أول إعلان من الزر في الأعلى.')}</Muted>}
      <Sheet open={!!quick} onClose={() => { setQuick(null); reload(); }} title={t('إعلان جديد')}>
        {quick === 'choose' ? (
          <View style={{ gap: 10 }}>
            <T v="bodyMd">{t('لأي محل؟')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(data ?? []).map((a) => <Chip key={a.id} label={a.name} onPress={() => { const { university, camps, ...rest } = a; void university; void camps; setQuick(rest); }} />)}
              <Chip label={t('+ محل جديد')} onPress={() => setQuick(blankAdv())} />
            </View>
          </View>
        ) : quick ? <CampaignForm adv={quick} camp={null} onDone={() => { setQuick(null); reload(); }} /> : null}
      </Sheet>
      <Sheet open={!!sel && !picking} onClose={close} title={sel?.id ? sel.name : t('محل جديد')}>
        {sel && !picking && <AdvEditor key={`${sel.id ?? 'new'}-${sel.lat}`} initial={sel} onPickSpot={pickSpot} onClose={() => { setSel(null); reload(); }} />}
      </Sheet>
    </AdminScreen>
  );
}
