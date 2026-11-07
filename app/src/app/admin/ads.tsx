import { Image } from 'expo-image';
import { MapPin, X } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Act, Actions, AdminScreen, Muted, OptionPicker, Panel, Pill, Section, Sheet, State, UniPicker, audit, confirm, done, fmtNum, useLoad, useUnis } from '@/components/admin/kit';
import { AdSlide } from '@/components/feed/HomeAds';
import { afterSheet } from '@/components/chat/ChatExtras';
import { Chip, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { DateField } from '@/components/ui/DateField';
import { CTA_DEFAULT, CTA_WORDS, PACKAGES, packageOf, type Ad, type CtaKind, type PackageKey } from '@/lib/ads';
import { t } from '@/lib/i18n';
import { pickOnMap } from '@/lib/mapPick';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { normalize } from '@/lib/util';

type MenuItem = { name: string; price_jod?: number; photo_url?: string };
type Adv = {
  id?: string; university_id: string | null; name: string; category: string; description: string | null; phone: string | null; hours: string | null;
  menu: MenuItem[]; photos: string[]; logo_url: string | null; lat: number | null; lng: number | null; contact_name: string | null; notes: string | null; is_active: boolean;
  building_id: string | null;
  /** its gold pin shows on the campus map (when placed and on) */
  on_map: boolean;
};
type Banner = 'home_banner' | 'feed_card' | 'market_banner';
type Camp = {
  id?: string; advertiser_id: string; university_ids: string[]; college_ids: string[]; placements: Banner[]; title: string; body: string | null; image_url: string | null;
  offer: string | null; cta_url: string | null; cta_label: string | null; starts_on: string; ends_on: string; daily_from: string | null; daily_to: string | null;
  priority: number; is_active: boolean; cta_kind: CtaKind | null; show_text: boolean;
};
type Stat = { campaign_id: string; impressions: number; clicks: number; calls: number; orders: number };
/** point at the shop on the map; the sheet comes back with the spot already in the shop */
type Spot = (a: Adv) => void;

const CATS: Record<string, string> = { restaurant: t('مطعم'), cafe: t('كافيه'), bookshop: t('مكتبة'), print: t('طباعة'), housing: t('سكن'), courses: t('دورات'), shop: t('محل'), other: t('خدمة') };
/** the banner places an ad can show in, any of them together */
const BANNERS: [Banner, string][] = [['home_banner', t('بانر الرئيسية')], ['feed_card', t('بين منشورات المجتمع')], ['market_banner', t('بانر السوق')]];
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const today = () => ymd(new Date());
const blankAdv = (): Adv => ({
  university_id: null, name: '', category: 'restaurant', description: '', phone: '', hours: '', menu: [], photos: [], logo_url: null, lat: null, lng: null,
  contact_name: '', notes: '', is_active: true, building_id: null, on_map: true,
});
/** The button in one tap: its words and what it does come together. */
const CTA_ACTIONS: [string, CtaKind][] = [
  ['اطلب الآن', 'link'], ['اذهب إلى الموقع', 'link'], ['احجز الآن', 'link'], ['شاهد العرض', 'link'], ['خذني إليه', 'map'], ['اتصل الآن', 'call'],
];

/** Stop or start an advertiser or one ad straight from the list; logged. */
async function switchOn(table: 'advertisers' | 'ad_campaigns', id: string, on: boolean, name: string) {
  const { error } = await supabase.from(table).update({ is_active: on }).eq('id', id);
  if (error) { Alert.alert(t('تعذّر الحفظ'), error.message); return; }
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
    university_id: adv.university_id,
  };
}

/** Where a campaign stands for students right now. */
function campState(c: Camp, onMap: boolean): [string, string] {
  const d = today();
  if (!c.is_active) return [t('موقوف'), ''];
  if (c.starts_on > d) return [t('يبدأ {0}', [c.starts_on]), 'blue'];
  if (c.ends_on < d) return [t('انتهت مدته'), ''];
  if (!c.placements.length) return onMap ? [t('على الخريطة فقط'), 'blue'] : [t('لا يظهر في أي مكان'), 'orange'];
  return [t('يظهر الآن للطلاب'), 'green'];
}

/** `banner`: the picture is cut to the banner's shape (2:1) in the crop editor first, like cutting it by hand. */
async function pickAndUpload(banner = false): Promise<string | null> {
  const f = await pickMedia(banner ? { crop: 'post', aspect: 2 } : { maxWidth: 1600 });
  if (!f) return null;
  const path = await uploadFile('ads', 'admin', f);
  return publicUrl('ads', path);
}

/**
 * Where the shop is on campus: its university, then the spot on the map by pointing (or one of the buildings), and
 * whether its gold pin shows on the map. Used by the shop page and by the ad itself.
 */
function ShopSpot({ adv, set, onPickSpot, setMsg }: { adv: Adv; set: (p: Partial<Adv>) => void; onPickSpot: Spot; setMsg: (m: string | null) => void }) {
  const [q, setQ] = useState('');
  const { data } = useLoad<{ id: string; name_ar: string; lat: number; lng: number }[]>(
    () => adv.university_id ? supabase.from('buildings').select('id, name_ar, lat, lng').eq('university_id', adv.university_id).eq('state', 'approved').not('lat', 'is', null).order('name_ar') as never : Promise.resolve({ data: [], error: null }), [adv.university_id]);
  const chosen = (data ?? []).find((b) => b.id === adv.building_id);
  const hits = q.trim() ? (data ?? []).filter((b) => normalize(b.name_ar).includes(normalize(q))).slice(0, 8) : [];
  const point = () => { setMsg(null); onPickSpot(adv); };
  return (
    <View style={{ gap: 10 }}>
      <UniPicker value={adv.university_id ?? ''} onChange={(v) => set({ university_id: v || null, building_id: null, lat: null, lng: null })} allowAll={false} label={t('جامعة المحل')} />
      {adv.university_id ? (
        <>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            <Act kind={adv.lat != null ? 'soft' : 'primary'} label={adv.lat != null ? t('غيّر مكانه على الخريطة') : t('حدّد مكانه على الخريطة')} onPress={point} />
            {adv.lat != null ? <Act label={t('إزالة المكان')} onPress={() => set({ lat: null, lng: null, building_id: null })} /> : null}
          </Row>
          {adv.lat != null ? (
            <Row gap={6}><MapPin size={16} color={C.greenInk} /><T v="small" color={C.greenInk} style={{ flex: 1 }}>{chosen ? t('في {0}', [chosen.name_ar]) : t('مكانه محدّد على الخريطة')}</T></Row>
          ) : null}
          <Field value={q} onChangeText={setQ} placeholder={t('أو ابحث عن مبناه، مثلًا كلية الهندسة')} />
          {hits.length > 0 && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {hits.map((b) => <Chip key={b.id} label={b.name_ar} active={b.id === adv.building_id} onPress={() => { set({ building_id: b.id, lat: b.lat, lng: b.lng, on_map: true }); setQ(''); }} />)}
            </View>
          )}
        </>
      ) : <Muted>{t('اختر جامعة المحل أولًا، ثم حدّد مكانه.')}</Muted>}
    </View>
  );
}

/**
 * One ad, quick: a photo (which then is the whole banner) or a headline, a button, where it shows (any of the
 * banners, and the campus map, together) and how long. A new shop is written right here and saved with the ad.
 */
function CampaignForm({ adv: given, camp, onDone, onPickSpot }: { adv: Adv; camp: Camp | null; onDone: () => void; onPickSpot: (draft: Camp) => Spot }) {
  const unis = useUnis();
  const [adv, setAdv] = useState<Adv>(given);
  // words saved without a link come back as their chip (the button then opens the shop's page)
  const [c, setC] = useState<Camp>(() => (camp && {
    ...camp,
    // the server keeps seconds (08:00:00): the form shows and checks hours and minutes
    daily_from: camp.daily_from?.slice(0, 5) ?? null, daily_to: camp.daily_to?.slice(0, 5) ?? null,
    cta_kind: camp.cta_kind ?? (camp.cta_label ? 'link' : null),
  }) ?? {
    advertiser_id: given.id ?? '', university_ids: given.university_id ? [given.university_id] : [], college_ids: [], placements: ['home_banner'], title: '', body: '',
    image_url: null, offer: '', cta_url: '', cta_label: '', starts_on: today(), ends_on: ymd(new Date(Date.now() + 30 * 864e5)), daily_from: null, daily_to: null,
    priority: 10, is_active: true, cta_kind: given.phone ? 'call' : null, show_text: true,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Camp>) => setC((x) => ({ ...x, ...p }));
  const setShop = (p: Partial<Adv>) => setAdv((x) => ({ ...x, ...p }));
  const everywhere = unis.length > 0 && unis.every((u) => c.university_ids.includes(u.id));
  const banners = c.placements.length > 0;
  const toggle = (p: Banner) => set({ placements: c.placements.includes(p) ? c.placements.filter((x) => x !== p) : [...c.placements, p] });

  async function save() {
    setMsg(null);
    if (!adv.name.trim()) { setMsg(t('اكتب اسم المحل')); return; }
    if (!banners && !adv.on_map) { setMsg(t('اختر مكانًا واحدًا على الأقل يظهر فيه الإعلان.')); return; }
    if (banners && !c.image_url && !c.title.trim()) { setMsg(t('أضف صورة للبانر أو اكتب عنوانًا.')); return; }
    if (adv.on_map && adv.lat == null) { setMsg(t('حدّد مكان المحل على الخريطة، أو ألغِ اختيار «على خريطة الجامعة».')); return; }
    // nobody chosen: the shop's university, or every university
    const reach = c.university_ids.length ? c.university_ids : adv.university_id ? [adv.university_id] : unis.map((u) => u.id);
    if (!reach.length) { setMsg(t('لم تُحمَّل قائمة الجامعات بعد. انتظر لحظة ثم احفظ.')); return; }
    const cta = c.cta_kind === 'link' ? c.cta_url?.trim() || null : null;
    if (cta && !/^https:\/\/\S+$/i.test(cta)) { setMsg(t('يجب أن يبدأ رابط الزر بـ https://')); return; }
    // no link: the words stay on the button, and it opens the shop's page in the app
    const kind = c.cta_kind === 'link' && !cta ? null : c.cta_kind;
    if (c.cta_kind === 'map' && !adv.building_id && !(adv.on_map && adv.lat != null)) { setMsg(t('حدّد مكان المحل على الخريطة ليعمل زر «خذني إليه».')); return; }
    if (c.cta_kind === 'call' && !adv.phone?.trim()) { setMsg(t('اكتب رقم هاتف المحل ليعمل زر الاتصال.')); return; }
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if ((c.daily_from && !time.test(c.daily_from)) || (c.daily_to && !time.test(c.daily_to))) { setMsg(t('اكتب الوقت بهذا الشكل: 08:00')); return; }
    if (c.ends_on < c.starts_on) { setMsg(t('تاريخ النهاية قبل تاريخ البداية.')); return; }
    setBusy(true);
    // the shop first: a new one with what was written here, an existing one with its phone and place
    const { id: advId0, ...shopRow } = { ...adv, name: adv.name.trim(), phone: adv.phone?.trim() || null };
    let advId = advId0;
    const r = advId
      ? await supabase.from('advertisers').update({ phone: shopRow.phone, university_id: shopRow.university_id, lat: shopRow.lat, lng: shopRow.lng, building_id: shopRow.building_id, on_map: shopRow.on_map }).eq('id', advId).select('id').single()
      : await supabase.from('advertisers').insert(shopRow).select('id').single();
    if (r.error) { setBusy(false); setMsg(r.error.message); return; }
    if (!advId) { advId = r.data.id; setShop({ id: advId }); await audit('add_advertiser', 'advertiser', advId!, { name: adv.name }); }
    const row = { ...c, advertiser_id: advId, university_ids: reach, daily_from: c.daily_from || null, daily_to: c.daily_to || null,
      body: c.body?.trim() || null, offer: c.offer?.trim() || null, title: (c.title.trim() || adv.name.trim()).slice(0, 60),
      // a photo is the whole banner: only «ممول» and the button go on it
      show_text: !c.image_url, cta_kind: kind, cta_url: cta, cta_label: c.cta_kind ? c.cta_label?.trim() || CTA_DEFAULT[c.cta_kind] : null };
    const saved = c.id
      ? await supabase.from('ad_campaigns').update(row).eq('id', c.id).select('id').single()
      : await supabase.from('ad_campaigns').insert(row).select('id').single();
    setBusy(false);
    if (saved.error) { setMsg(saved.error.message); return; }
    await audit(c.id ? 'edit_campaign' : 'add_campaign', 'campaign', saved.data.id, { title: row.title, placements: c.placements, on_map: adv.on_map });
    done(); onDone();
  }

  /** gone for good, with its numbers; the shop stays */
  async function remove() {
    if (!c.id || !(await confirm(t('حذف الإعلان نهائيًا؟'), t('يختفي فورًا من عند الطلاب وتُحذف أرقامه، ولا يمكن التراجع. للإخفاء المؤقت استخدم «أوقفه».'), t('احذف')))) return;
    const { error } = await supabase.from('ad_campaigns').delete().eq('id', c.id);
    if (error) { setMsg(error.message); return; }
    await audit('delete_campaign', 'campaign', c.id, { title: c.title });
    done(); onDone();
  }

  const preview = banners ? <AdSlide ad={toAd(adv, { ...c, show_text: !c.image_url })} /> : null;
  let n = 0;
  const step = (title: string) => <Section title={`${++n}. ${title}`} />;
  return (
    <View style={{ gap: 12 }}>
      {given.id ? (
        <Row gap={8}>
          <T v="h3" style={{ flex: 1 }}>{c.id ? t('تعديل الإعلان') : t('إعلان جديد لـ {0}', [adv.name])}</T>
          <Act label={t('رجوع')} onPress={onDone} />
        </Row>
      ) : null}
      {preview ? <><T v="small" color={C.muted}>{t('هكذا سيظهر للطلاب، ويتغير وأنت تكتب:')}</T>{preview}</> : null}

      {!given.id && (
        <>
          {step(t('المحل'))}
          <Panel>
            <Field label={t('اسم المحل')} value={adv.name} onChangeText={(v) => setShop({ name: v })} placeholder={t('مثلًا: أفران الشام')} />
            <Field label={t('رقم الهاتف (اختياري)')} value={adv.phone ?? ''} onChangeText={(v) => setShop({ phone: v })} keyboardType="phone-pad" />
          </Panel>
        </>
      )}

      {step(t('أين يظهر؟'))}
      <Panel>
        <Muted>{t('اختر مكانًا واحدًا أو أكثر.')}</Muted>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {BANNERS.map(([p, l]) => <Chip key={p} label={l} active={c.placements.includes(p)} onPress={() => toggle(p)} />)}
          <Chip label={t('على خريطة الجامعة')} active={adv.on_map} onPress={() => setShop({ on_map: !adv.on_map })} />
        </View>
        {adv.on_map && (
          <>
            <Muted>{t('محله يظهر لكل من يفتح خريطة الجامعة: دبوس بإطار ذهبي وعلامة «ممول»، وبالضغط عليه تفتح صفحته.')}</Muted>
            <ShopSpot adv={adv} set={setShop} onPickSpot={onPickSpot(c)} setMsg={setMsg} />
          </>
        )}
      </Panel>

      {banners && (
        <>
          {step(t('صورة البانر'))}
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
              {step(t('الكلام'))}
              <Panel>
                <Field label={t('العنوان الكبير (60 حرفًا)')} value={c.title} onChangeText={(v) => set({ title: v })} maxLength={60} placeholder={t('مثلًا: فطور الطلاب بدينار')} />
                <Field label={t('العرض (يظهر بشارة صفراء، اختياري)')} value={c.offer ?? ''} onChangeText={(v) => set({ offer: v })} placeholder={t('خصم 20% للطلاب')} />
                <Field label={t('سطر صغير تحت العنوان (اختياري)')} value={c.body ?? ''} onChangeText={(v) => set({ body: v })} maxLength={140} />
              </Panel>
            </>
          )}
          {step(t('الزر'))}
          <Panel>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CTA_ACTIONS.map(([w, k]) => <Chip key={w} label={CTA_WORDS[w]} active={c.cta_kind === k && (c.cta_label || CTA_DEFAULT[k]) === w} onPress={() => set({ cta_kind: k, cta_label: w })} />)}
              <Chip label={t('بدون زر')} active={!c.cta_kind} onPress={() => set({ cta_kind: null, cta_label: '' })} />
            </View>
            {c.cta_kind === 'link' && (
              <>
                <Field label={t('رابط (اختياري)')} value={c.cta_url ?? ''} onChangeText={(v) => set({ cta_url: v })} placeholder="https://"
                  autoCapitalize="none" autoCorrect={false} keyboardType="url" maxLength={500} />
                <Muted>{c.cta_url?.trim() ? t('الزر يفتح هذا الرابط.') : t('دون رابط: الزر يفتح صفحة المحل في التطبيق (رقمه وموقعه وقائمته).')}</Muted>
              </>
            )}
            {c.cta_kind === 'call' && given.id && (
              <Field label={t('رقم هاتف المحل')} value={adv.phone ?? ''} onChangeText={(v) => setShop({ phone: v })} keyboardType="phone-pad" />
            )}
            {c.cta_kind === 'map' && <Muted>{adv.lat != null
              ? t('يفتح خريطة الجامعة ويرشد الطالب إلى المحل خطوة بخطوة.')
              : t('اختر «على خريطة الجامعة» في الأعلى وحدّد مكان المحل ليعمل هذا الزر.')}</Muted>}
            <Muted>{t('الضغط على أي مكان في البانر يفتح صفحة المحل: رقمه وموقعه وقائمته.')}</Muted>
          </Panel>
        </>
      )}

      {step(t('المدة ولمن'))}
      <Panel>
        <Row gap={8}>
          <View style={{ flex: 1, gap: 6 }}><T v="small" color={C.muted}>{t('من تاريخ')}</T><DateField value={new Date(c.starts_on)} onChange={(d) => set({ starts_on: ymd(d) })} /></View>
          <View style={{ flex: 1, gap: 6 }}><T v="small" color={C.muted}>{t('إلى تاريخ')}</T><DateField value={new Date(c.ends_on)} onChange={(d) => set({ ends_on: ymd(d) })} /></View>
        </Row>
        {banners && (
          <>
            <T v="small" color={C.muted}>{t('يظهر البانر لطلاب')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t('كل الجامعات')} active={everywhere} onPress={() => set({ university_ids: everywhere ? [] : unis.map((u) => u.id) })} />
              {unis.map((u) => {
                const on = c.university_ids.includes(u.id);
                return <Chip key={u.id} label={u.name_ar} active={on && !everywhere} onPress={() => set({ university_ids: everywhere ? [u.id] : on ? c.university_ids.filter((x) => x !== u.id) : [...c.university_ids, u.id] })} />;
              })}
            </View>
            {!c.university_ids.length && <Muted>{adv.university_id ? t('لم تختر: يظهر لطلاب جامعة المحل.') : t('لم تختر: يظهر لطلاب كل الجامعات.')}</Muted>}
          </>
        )}
      </Panel>

      {banners && (
        <>
          <Section title={t('خيارات إضافية (اختياري)')} />
          <Panel>
            <Row gap={8}>
              <View style={{ flex: 1 }}><Field label={t('كل يوم من الساعة')} value={c.daily_from ?? ''} onChangeText={(v) => set({ daily_from: v })} placeholder="08:00" /></View>
              <View style={{ flex: 1 }}><Field label={t('للساعة')} value={c.daily_to ?? ''} onChangeText={(v) => set({ daily_to: v })} placeholder="23:00" /></View>
            </Row>
            <Muted>{t('اترك الساعات فارغة ليظهر طول اليوم.')}</Muted>
            <OptionPicker label={t('الباقة (الأعلى يظهر أولًا)')} value={String(packageOf(c.priority))}
              options={PACKAGES as Record<PackageKey, string> as unknown as Record<string, string>} onChange={(v) => set({ priority: Number(v) })} />
          </Panel>
        </>
      )}

      <Toggle value={c.is_active} onChange={(v) => set({ is_active: v })} label={t('منشور')} hint={t('أوقفه متى شئت دون حذفه.')} />
      {msg && <T v="small" color={C.red}>{msg}</T>}
      <Actions><Act label={c.id ? t('احفظ التعديلات') : t('انشر الإعلان')} kind="primary" loading={busy} onPress={save} /><Act label={t('إلغاء')} onPress={onDone} /></Actions>
      {c.id ? <Act label={t('احذف الإعلان نهائيًا')} kind="danger" onPress={remove} /> : null}
    </View>
  );
}

/** A shop's page in the admin: its ads first, then its details, place on the map, menu and the admin's notes. */
function AdvEditor({ initial, onClose, onPickSpot, onEditAd }: {
  initial: Adv; onClose: () => void; onPickSpot: Spot; onEditAd: (a: Adv, c: Camp | null) => void;
}) {
  const [a, setA] = useState<Adv>(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const set = (p: Partial<Adv>) => setA((x) => ({ ...x, ...p }));
  const camps = useLoad<Camp[]>(() => a.id ? supabase.from('ad_campaigns').select('*').eq('advertiser_id', a.id).order('created_at', { ascending: false }) as never : Promise.resolve({ data: [], error: null }), [a.id]);
  const stats = useLoad<Stat[]>(() => supabase.rpc('admin_ad_stats'), [a.id]);

  async function save() {
    if (!a.name.trim()) { setMsg(t('اكتب اسم المحل')); return; }
    // an ad's button needs what it uses: the phone for a call, the place for the walk
    const running = (camps.data ?? []).filter((c) => c.is_active && c.ends_on >= today());
    if (!a.phone?.trim() && running.some((c) => c.cta_kind === 'call')) { setMsg(t('أحد إعلانات المحل فيه زر اتصال: أبقِ رقم الهاتف، أو غيّر الزر في الإعلان أولًا.')); return; }
    if (!a.building_id && !(a.on_map && a.lat != null) && running.some((c) => c.cta_kind === 'map')) {
      setMsg(t('أحد إعلانات المحل فيه زر «خذني إليه»: أبقِ مكانه على الخريطة، أو غيّر الزر في الإعلان أولًا.')); return;
    }
    const { id, ...row } = a;
    const r = id ? await supabase.from('advertisers').update(row).eq('id', id).select('id').single() : await supabase.from('advertisers').insert(row).select('id').single();
    if (r.error) { setMsg(r.error.message); return; }
    await audit(id ? 'edit_advertiser' : 'add_advertiser', 'advertiser', r.data.id, { name: a.name });
    done(); setMsg(null);
    // a new shop goes straight on to its first ad: nothing shows to students without one
    if (!id) onEditAd({ ...a, id: r.data.id }, null); else onClose();
  }
  /** the shop, its ads and their numbers, for good; its pin leaves the map first */
  async function removeShop() {
    if (!a.id || !(await confirm(t('حذف {0} نهائيًا؟', [a.name]), t('يُحذف المحل وكل إعلاناته وأرقامها ودبوسه على الخريطة، ولا يمكن التراجع.'), t('احذف')))) return;
    await supabase.from('advertisers').update({ is_active: false }).eq('id', a.id);
    const { error } = await supabase.from('advertisers').delete().eq('id', a.id);
    if (error) { setMsg(error.message); return; }
    await audit('delete_advertiser', 'advertiser', a.id, { name: a.name });
    done(); onClose();
  }
  const up = async (f: (u: string) => void) => { try { const u = await pickAndUpload(); if (u) f(u); } catch (e) { setMsg((e as Error).message); } };
  const st = (cid?: string) => stats.data?.find((s) => s.campaign_id === cid);

  return (
    <View style={{ gap: 12 }}>
      {a.id && (
        <>
          <Section title={t('إعلانات المحل')} right={(camps.data ?? []).length ? <Act label={t('+ إعلان')} kind="primary" onPress={() => onEditAd(a, null)} /> : undefined} />
          {!camps.loading && !(camps.data ?? []).length && (
            <Panel>
              <T v="bodyMd">{t('لا يوجد إعلان لهذا المحل بعد')}</T>
              <Muted>{t('لن يظهر أي بانر للطلاب حتى تنشئ إعلانًا.')}</Muted>
              <Act label={t('أنشئ الإعلان')} kind="primary" onPress={() => onEditAd(a, null)} />
            </Panel>
          )}
          {(camps.data ?? []).map((c) => {
            const [state, tone] = campState(c, a.on_map);
            return (
              <View key={c.id} style={{ gap: 8, opacity: c.is_active ? 1 : 0.6 }}>
                {c.placements.length ? <AdSlide ad={toAd(a, c)} onOpen={() => onEditAd(a, c)} /> : null}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <Pill label={state} tone={tone} />
                  <Muted>{t('مشاهدات {0} · ضغطات {1} · اتصالات {2}', [fmtNum(st(c.id)?.impressions), fmtNum(st(c.id)?.clicks), fmtNum(st(c.id)?.calls)])}</Muted>
                </Row>
                <Row gap={8}>
                  <Act label={t('عدّل')} onPress={() => onEditAd(a, c)} />
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
        <Field label={t('الهاتف (يظهر للطلاب ويعمل عليه زر الاتصال)')} value={a.phone ?? ''} onChangeText={(v) => set({ phone: v })} keyboardType="phone-pad" />
        <Field label={t('الدوام')} value={a.hours ?? ''} onChangeText={(v) => set({ hours: v })} placeholder={t('يوميًا 8 صباحًا - 11 مساءً')} />
        <Field label={t('نبذة')} value={a.description ?? ''} onChangeText={(v) => set({ description: v })} multiline style={{ minHeight: 80, paddingTop: 14 }} />
      </Panel>

      <Section title={t('مكانه على الخريطة')} />
      <Panel>
        <ShopSpot adv={a} set={set} onPickSpot={onPickSpot} setMsg={setMsg} />
        <Toggle value={a.on_map} onChange={(v) => set({ on_map: v })} label={t('يظهر على خريطة الجامعة')}
          hint={a.lat != null ? t('دبوس بإطار ذهبي وعلامة «ممول» لكل من يفتح الخريطة.') : t('يظهر بعد تحديد مكانه.')} />
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
      {a.id ? <Act label={t('احذف المحل وكل إعلاناته')} kind="danger" onPress={removeShop} /> : null}
    </View>
  );
}

type Row = Adv & { university: { name_ar: string } | null; camps: Camp[] };
const plain = ({ university, camps, ...a }: Row): Adv => { void university; void camps; return a; };

/** Admin › ads: shops with their banners, a new ad in one form, and each shop's page (owner only). */
export default function Ads() {
  const { data, loading, error, reload } = useLoad<Row[]>(
    () => supabase.from('advertisers').select('*, university:universities(name_ar), camps:ad_campaigns(*)').order('created_at', { ascending: false }) as never, []);
  // one sheet at a time: choosing the shop for a new ad, an ad's form, or a shop's page
  const [sheet, setSheet] = useState<{ k: 'choose' } | { k: 'ad'; adv: Adv; camp: Camp | null } | { k: 'shop'; adv: Adv } | null>(null);
  // pointing at the shop on the map: the sheet steps aside (keeping what was typed) and comes back with the spot
  const [picking, setPicking] = useState(false);
  const spot = (back: (a: Adv) => typeof sheet): Spot => async (a) => {
    if (!a.university_id) return;
    setSheet(back(a)); setPicking(true);
    const p = await pickOnMap(a.university_id);
    // back from the map: the sheet comes up again once the map has left (iOS can't show it while that is moving)
    afterSheet(() => {
      setPicking(false);
      if (p) setSheet(back({ ...a, lat: p.lat, lng: p.lng, building_id: null, on_map: true }));
    });
  };
  const close = () => { setSheet(null); reload(); };

  return (
    <AdminScreen ownerOnly title={t('الإعلانات')} subtitle={t('مطاعم ومحلات حول الجامعات · كل إعلان يحمل علامة «ممول»')}
      right={<Act label={t('+ إعلان')} kind="primary" onPress={() => setSheet((data ?? []).length ? { k: 'choose' } : { k: 'ad', adv: blankAdv(), camp: null })} />}>
      <State loading={loading} error={error} empty={data?.length === 0}>
        <View style={{ gap: 18 }}>
          {(data ?? []).map((a) => {
            const live = a.camps.find((c) => campState(c, a.on_map)[1] === 'green') ?? a.camps[0];
            const [state, tone] = live ? campState(live, a.on_map) : [t('لا يوجد إعلان بعد'), 'orange'];
            const open = () => setSheet({ k: 'shop', adv: plain(a) });
            return (
              <View key={a.id} style={{ gap: 8, opacity: a.is_active ? 1 : 0.55 }}>
                {live?.placements.length ? <AdSlide ad={toAd(a, live)} onOpen={open} /> : (
                  <Panel onPress={open} style={{ borderStyle: 'dashed', borderWidth: 1.5, borderColor: C.line, minHeight: 110, justifyContent: 'center', alignItems: 'center' }}>
                    <Muted>{live ? t('هذا الإعلان على الخريطة فقط.') : t('لا يظهر شيء للطلاب بعد. اضغط لإنشاء إعلانه.')}</Muted>
                  </Panel>
                )}
                <Row gap={8} style={{ flexWrap: 'wrap' }}>
                  <T v="bold" style={{ flexShrink: 1 }}>{a.name}</T>
                  <Pill label={state} tone={tone} />
                  <Muted>{[CATS[a.category], a.university?.name_ar ?? t('كل الجامعات'), a.lat != null && a.on_map ? t('على الخريطة') : null].filter(Boolean).join(' · ')}</Muted>
                </Row>
                <Row gap={8}>
                  <Act label={t('افتح')} onPress={open} />
                  <OnOff on={a.is_active} onChange={(v) => switchOn('advertisers', a.id!, v, a.name).then(reload)} />
                </Row>
              </View>
            );
          })}
        </View>
      </State>
      {!loading && (data ?? []).length === 0 && <Muted>{t('أضف أول إعلان من الزر في الأعلى.')}</Muted>}

      <Sheet open={!!sheet && !picking} onClose={close} title={sheet?.k === 'shop' ? sheet.adv.name || t('محل جديد') : t('إعلان جديد')}>
        {sheet?.k === 'choose' && (
          <View style={{ gap: 10 }}>
            <T v="bodyMd">{t('لأي محل؟')}</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {(data ?? []).map((a) => <Chip key={a.id} label={a.name} onPress={() => setSheet({ k: 'ad', adv: plain(a), camp: null })} />)}
              <Chip label={t('+ محل جديد')} onPress={() => setSheet({ k: 'ad', adv: blankAdv(), camp: null })} />
            </View>
          </View>
        )}
        {sheet?.k === 'ad' && !picking && (
          <CampaignForm key={`${sheet.adv.id ?? 'new'}-${sheet.adv.lat}`} adv={sheet.adv} camp={sheet.camp} onDone={close}
            onPickSpot={(draft) => spot((a) => ({ k: 'ad', adv: a, camp: draft }))} />
        )}
        {sheet?.k === 'shop' && !picking && (
          <AdvEditor key={`${sheet.adv.id ?? 'new'}-${sheet.adv.lat}`} initial={sheet.adv} onClose={close}
            onPickSpot={spot((a) => ({ k: 'shop', adv: a }))} onEditAd={(adv, camp) => setSheet({ k: 'ad', adv, camp })} />
        )}
      </Sheet>
    </AdminScreen>
  );
}
