import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp, Check, ImagePlus, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { Actions, AdminScreen, Muted, Panel, Section, confirm, done, useUnis } from '@/components/admin/kit';
import { TwoLang, toEnglish } from '@/components/admin/TwoLang';
import { NoticeBar, OwnerBanner, ownDir } from '@/components/home/OwnerContent';
import { DEFAULT_QUICK, QUICK } from '@/components/home/quick';
import { Button, Chip, Field, Row, T, Tap, Toggle } from '@/components/ui';
import {
  applyAppContent, lookFor, PALETTES, refreshAppContent, useAllAppContent,
  type AppContent, type Banner, type FeatureKey, type Look as LookT, type Notice, type Palette, type QuickKey,
} from '@/lib/appContent';
import { nm, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';

const PALETTE_NAMES: [Palette, string][] = [
  ['royal', t('ملكي')], ['ocean', t('محيط')], ['forest', t('غابة')], ['sunset', t('غروب')], ['rose', t('وردي')], ['gold', t('ذهبي')], ['night', t('ليلي')],
];
const FEATURES: [FeatureKey, string, string][] = [
  ['attendance', t('غياباتي'), t('عدّاد الغيابات في صفحة الجدول')],
  ['gpa', t('معدلي'), t('حاسبة المعدل في صفحة الجدول')],
  ['exams', t('امتحاناتي'), t('وضع الامتحانات في صفحة الجدول')],
  ['rides', t('التوصيلات'), t('عروض وطلبات التوصيل')],
  ['honor', t('المتفوقون'), t('لوحة المتفوقين حسب المعدل الرسمي')],
  ['frames', t('إطارات التكريم'), t('إطار حول صورة أول 10 في كل مكان في التطبيق')],
  ['map', t('الخريطة'), t('«أين قاعتي» في الرئيسية')],
  ['swap', t('تبديل الشعب'), t('«تبديل الشعب» في الرئيسية')],
  ['market', t('السوق'), t('«السوق» في الرئيسية')],
  ['study', t('لندرس معًا'), t('«ندرس معاً» في الرئيسية')],
];
/** ready words for the banner's button */
const CTA_WORDS = [t('اكتشف المزيد'), t('سجّل الآن'), t('شاهد التفاصيل'), t('احجز مقعدك'), t('افتح الصفحة')];
const clone = <X,>(x: X): X => JSON.parse(JSON.stringify(x ?? {})) as X;

/** The designed gradients as swatches. */
function Palettes({ value, onChange }: { value?: string; onChange: (p: Palette) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 4 }}>
      {PALETTE_NAMES.map(([k, l]) => (
        <Tap key={k} onPress={() => onChange(k)} accessibilityLabel={l} accessibilityState={{ selected: value === k }} style={{ alignItems: 'center', gap: 6 }}>
          <LinearGradient colors={PALETTES[k]} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }}
            style={{ width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: value === k ? 3 : 0, borderColor: C.ink }}>
            {value === k && <Check size={20} color="#FFFFFF" strokeWidth={3} />}
          </LinearGradient>
          <T v="tiny" color={value === k ? C.ink : C.muted}>{l}</T>
        </Tap>
      ))}
    </ScrollView>
  );
}

/**
 * The owner shapes the app: a notice for everyone, the home greeting and banner, the quick links, which features are
 * on, and the login page. «كل الجامعات» is the general look; choosing a university sets that university's own on top
 * (a section left empty there takes the general one). Every text has its English, written by «ترجم» or by hand.
 */
export default function Look() {
  const saved = useAllAppContent();
  const unis = useUnis();
  const [all, setAll] = useState<AppContent>(saved);
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { refreshAppContent(true); }, []);
  useEffect(() => { setAll(saved); }, [saved]);
  const dirty = JSON.stringify(all) !== JSON.stringify(saved);

  // the settings being edited: the general ones, or one university's own
  const own: LookT = scope ? all.unis?.[scope] ?? {} : all;
  const shown = scope ? lookFor(all, scope) : all;
  const edit = (f: (x: LookT) => LookT) => setAll((a) => {
    const c = clone(a);
    if (!scope) return { ...f(c), unis: c.unis };
    return { ...c, unis: { ...c.unis, [scope]: f(clone(c.unis?.[scope] ?? {})) } };
  });
  const setNotice = (p: Partial<Notice>) => edit((x) => ({ ...x, notice: { ...(scope ? shown.notice : x.notice), ...x.notice, ...p } }));
  const setBanner = (p: Partial<Banner>) => edit((x) => ({ ...x, home: { ...x.home, banner: { ...(scope ? shown.home?.banner : undefined), ...x.home?.banner, ...p } } }));
  const quick: QuickKey[] = shown.home?.quick?.length ? shown.home.quick : DEFAULT_QUICK.map((q) => q.key);
  const notice = shown.notice ?? {};
  const banner = shown.home?.banner ?? {};
  const uniName = (id: string) => nm(unis.find((u) => u.id === id)) ?? '';

  async function addPhoto() {
    try {
      const f = await pickMedia({ crop: 'post', aspect: 2 });
      if (!f) return;
      setBusy(true);
      const path = await uploadFile('ads', 'admin', f);
      setBanner({ image: publicUrl('ads', path) });
    } catch (e) { Alert.alert(t('تعذّر رفع الصورة'), (e as Error).message); } finally { setBusy(false); }
  }

  async function save() {
    setBusy(true);
    // any Arabic left without English gets it now, so nobody using English sees Arabic
    const c = clone(all);
    const looks: LookT[] = [c, ...Object.values(c.unis ?? {})];
    const gaps: [Record<string, string | undefined>, string, string][] = [];
    for (const l of looks) {
      if (l.notice?.text?.trim() && !l.notice.text_en?.trim()) gaps.push([l.notice as never, 'text', 'text_en']);
      if (l.home?.greeting?.trim() && !l.home.greeting_en?.trim()) gaps.push([l.home as never, 'greeting', 'greeting_en']);
      const b = l.home?.banner;
      if (b) for (const k of ['title', 'body', 'cta'] as const) if (b[k]?.trim() && !b[`${k}_en`]?.trim()) gaps.push([b as never, k, `${k}_en`]);
      if (l.login) for (const k of ['title', 'tagline'] as const) if (l.login[k]?.trim() && !l.login[`${k}_en`]?.trim()) gaps.push([l.login as never, k, `${k}_en`]);
    }
    if (gaps.length) {
      const en = await toEnglish(gaps.slice(0, 12).map(([o, k]) => o[k]!.trim()));
      en?.forEach((v, i) => { const [o, , k] = gaps[i]; o[k] = v; });
    }
    const { data, error } = await supabase.rpc('admin_set_app_content', { p: c });
    setBusy(false);
    if (error) { Alert.alert(t('تعذّر الحفظ'), error.message); return; }
    applyAppContent(data as AppContent); done();
  }

  async function resetUni() {
    if (!scope || !(await confirm(t('إعادة {0} إلى الإعدادات العامة؟', [uniName(scope)]), t('تُحذف إعدادات هذه الجامعة الخاصة بعد الحفظ.'), t('أعِدها')))) return;
    setAll((a) => { const c = clone(a); delete c.unis?.[scope]; return c; });
  }

  return (
    <AdminScreen ownerOnly title={t('شكل التطبيق')} subtitle={t('ما يراه الطلاب في الرئيسية وصفحة الدخول، لكل الجامعات أو لجامعة واحدة')}
      right={<Button title={t('احفظ')} kind="primary" loading={busy} disabled={!dirty} onPress={save} style={{ minHeight: 40, paddingHorizontal: 16 }} />}>

      <Panel>
        <T v="bodyMd">{t('لمن هذه الإعدادات؟')}</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label={t('كل الجامعات')} active={!scope} onPress={() => setScope('')} />
          {unis.map((u) => <Chip key={u.id} label={nm(u) ?? ''} active={scope === u.id} dot={all.unis?.[u.id] ? C.primary : undefined} onPress={() => setScope(u.id)} />)}
        </ScrollView>
        <Muted>{scope
          ? t('ما تضبطه هنا يظهر لطلاب {0} فقط، وما تتركه فارغًا يأخذ قيمته من «كل الجامعات».', [uniName(scope)])
          : t('الإعدادات العامة لكل الجامعات. الجامعات المعلّمة بنقطة لها إعدادات خاصة بها.')}</Muted>
        {scope && all.unis?.[scope] ? <Button kind="ghost" title={t('أعِد هذه الجامعة إلى الإعدادات العامة')} onPress={resetUni} /> : null}
      </Panel>

      <Section title={t('رسالة أعلى الرئيسية')} />
      <Panel>
        <Toggle label={t('اعرض الرسالة')} hint={t('مثلاً «توجد صيانة الليلة» أو «مبروك النتائج»')} value={!!notice.on} onChange={(v) => setNotice({ on: v })} />
        <TwoLang label={t('نص الرسالة')} ar={notice.text} en={notice.text_en} max={160} onAr={(v) => setNotice({ text: v })} onEn={(v) => setNotice({ text_en: v })} />
        <Palettes value={notice.tone} onChange={(tone) => setNotice({ tone })} />
        {notice.text?.trim() ? <NoticeBar notice={notice} /> : null}
      </Panel>

      <Section title={t('الترحيب')} />
      <Panel>
        <TwoLang label={t('الترحيب (فارغ = «صباح الخير، …» الافتراضي)')} placeholder={t('مثلاً: أهلاً {name}، بالتوفيق في الامتحانات')}
          ar={own.home?.greeting} en={own.home?.greeting_en} max={60}
          onAr={(v) => edit((x) => ({ ...x, home: { ...x.home, greeting: v } }))} onEn={(v) => edit((x) => ({ ...x, home: { ...x.home, greeting_en: v } }))} />
        <Muted>{t('اكتب {name} مكان الاسم الأول للطالب.')}</Muted>
        {shown.home?.greeting?.trim() ? (
          <T v="h2" style={[{ fontFamily: F.display, fontSize: 22 }, ownDir(shown.home.greeting)]}>{shown.home.greeting.replace('{name}', t('أحمد'))}</T>
        ) : null}
      </Panel>

      <Section title={t('بانر الرئيسية')} />
      <Panel>
        <Toggle label={t('اعرض البانر')} value={!!banner.on} onChange={(v) => setBanner({ on: v })} />
        <TwoLang label={t('العنوان')} ar={banner.title} en={banner.title_en} max={60} onAr={(v) => setBanner({ title: v })} onEn={(v) => setBanner({ title_en: v })} />
        <TwoLang label={t('النص')} ar={banner.body} en={banner.body_en} max={160} multiline onAr={(v) => setBanner({ body: v })} onEn={(v) => setBanner({ body_en: v })} />
        <T v="small" color={C.muted}>{t('الخلفية: صورة، أو أحد الألوان المصممة')}</T>
        <Row gap={8}>
          <Button kind="soft" title={banner.image ? t('غيّر الصورة') : t('أضف صورة')} icon={<ImagePlus size={17} color={C.ink} />} onPress={addPhoto} style={{ flex: 1 }} />
          {banner.image ? <Button kind="ghost" title={t('بدون صورة')} icon={<Trash2 size={17} color={C.red} />} onPress={() => setBanner({ image: undefined })} /> : null}
        </Row>
        <Muted>{t('تُقصّ الصورة بشكل البانر، ويُضاف تعتيم متدرّج أسفلها بلون اللوحة ليظهر النص بوضوح.')}</Muted>
        <Palettes value={banner.tone} onChange={(tone) => setBanner({ tone })} />
        <Field label={t('ما يُفتح عند الضغط (صفحة مثل /rides أو رابط https)')} value={banner.link ?? ''} autoCapitalize="none" autoCorrect={false}
          onChangeText={(v) => setBanner({ link: v.trim() })} style={ownDir('a')} />
        {banner.link?.trim() ? (
          <>
            <TwoLang label={t('الكلمة على الزر')} ar={banner.cta} en={banner.cta_en} max={20} onAr={(v) => setBanner({ cta: v })} onEn={(v) => setBanner({ cta_en: v })} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {CTA_WORDS.map((w) => <Chip key={w} label={w} active={banner.cta === w} onPress={() => setBanner({ cta: w, cta_en: undefined })} />)}
            </View>
          </>
        ) : null}
        {banner.title?.trim() ? <><T v="small" color={C.muted}>{t('هكذا سيظهر للطلاب:')}</T><OwnerBanner banner={banner} preview /></> : null}
      </Panel>

      <Section title={t('اختصارات الرئيسية')} />
      <Panel>
        <Muted>{t('شغّل أي اختصار أو أوقفه، ورتّب الاختصارات بالأسهم.')}</Muted>
        {[...quick, ...QUICK.map((q) => q.key).filter((k) => !quick.includes(k))].map((k) => {
          const q = QUICK.find((x) => x.key === k)!;
          const on = quick.includes(k);
          const i = quick.indexOf(k);
          const put = (l: QuickKey[]) => edit((x) => ({ ...x, home: { ...x.home, quick: l } }));
          const move = (d: number) => { const l = [...quick]; [l[i], l[i + d]] = [l[i + d], l[i]]; put(l); };
          return (
            <Row key={k} gap={6} style={{ minHeight: 52, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Toggle label={q.label} value={on} onChange={(v) => put(v ? [...quick, k] : quick.filter((y) => y !== k))} />
              </View>
              {on && <Tap onPress={() => i > 0 && move(-1)} disabled={i === 0} accessibilityLabel={t('إلى الأعلى')} style={{ padding: 8, opacity: i === 0 ? 0.3 : 1 }}><ArrowUp size={18} color={C.ink} /></Tap>}
              {on && <Tap onPress={() => i < quick.length - 1 && move(1)} disabled={i === quick.length - 1} accessibilityLabel={t('إلى الأسفل')} style={{ padding: 8, opacity: i === quick.length - 1 ? 0.3 : 1 }}><ArrowDown size={18} color={C.ink} /></Tap>}
            </Row>
          );
        })}
      </Panel>

      <Section title={t('الميزات')} />
      <Panel>
        <Muted>{scope
          ? t('تشغيل ميزة أو إيقافها هنا يخص طلاب {0} فقط، وتبقى بياناتهم محفوظة.', [uniName(scope)])
          : t('عند إيقاف ميزة، تختفي أزرارها لدى جميع الطلاب، وتبقى بياناتهم محفوظة.')}</Muted>
        {FEATURES.map(([k, label, hint]) => (
          <Toggle key={k} label={label} hint={hint} value={shown.features?.[k] !== false} onChange={(v) => edit((x) => ({ ...x, features: { ...x.features, [k]: v } }))} />
        ))}
      </Panel>

      {!scope && (
        <>
          <Section title={t('صفحة تسجيل الدخول')} />
          <Panel>
            <TwoLang label={t('العنوان (فارغ = «جامعتك كلها في جيبك»)')} ar={all.login?.title} en={all.login?.title_en} max={50}
              onAr={(v) => edit((x) => ({ ...x, login: { ...x.login, title: v } }))} onEn={(v) => edit((x) => ({ ...x, login: { ...x.login, title_en: v } }))} />
            <TwoLang label={t('السطر أسفل العنوان')} ar={all.login?.tagline} en={all.login?.tagline_en} max={140} multiline
              onAr={(v) => edit((x) => ({ ...x, login: { ...x.login, tagline: v } }))} onEn={(v) => edit((x) => ({ ...x, login: { ...x.login, tagline_en: v } }))} />
          </Panel>
        </>
      )}

      <Actions>
        <Button title={t('احفظ التغييرات')} kind="primary" loading={busy} disabled={!dirty} onPress={save} />
        {dirty && <Button title={t('تراجع')} kind="ghost" onPress={() => setAll(saved)} />}
      </Actions>
      <Muted>{t('تصل التغييرات إلى الطلاب فور فتحهم التطبيق أو الصفحة، وما يُترك دون إنجليزية يُترجم تلقائيًا عند الحفظ. يُحفظ كل تعديل في سجل الإدارة.')}</Muted>
    </AdminScreen>
  );
}
