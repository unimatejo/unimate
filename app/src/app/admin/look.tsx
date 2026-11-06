import { LinearGradient } from 'expo-linear-gradient';
import { ArrowDown, ArrowUp } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';

import { Actions, AdminScreen, Muted, Panel, Section, done } from '@/components/admin/kit';
import { DEFAULT_QUICK, QUICK } from '@/components/home/quick';
import { Button, Chip, Field, Row, T, Tap, Toggle } from '@/components/ui';
import { applyAppContent, refreshAppContent, TONES, useAppContent, type AppContent, type FeatureKey, type QuickKey, type Tone } from '@/lib/appContent';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

const TONE_NAMES: [Tone, string][] = [['blue', t('أزرق')], ['green', t('أخضر')], ['pink', t('زهري')], ['orange', t('برتقالي')], ['violet', t('بنفسجي')], ['red', t('أحمر')]];
const FEATURES: [FeatureKey, string, string][] = [
  ['attendance', t('غياباتي'), t('عدّاد الغيابات بصفحة الجدول')],
  ['gpa', t('معدلي'), t('حاسبة المعدل بصفحة الجدول')],
  ['exams', t('امتحاناتي'), t('وضع الامتحانات بصفحة الجدول')],
  ['rides', t('التوصيلات'), t('عروض وطلبات التوصيل')],
  ['honor', t('المتفوقين'), t('لوحة المتفوقين بالمعدل الرسمي')],
  ['frames', t('إطارات التكريم'), t('إطار حوالين صورة أول 10 بكل مكان بالتطبيق')],
  ['map', t('الخريطة'), t('«وين قاعتي» بالرئيسية')],
  ['swap', t('تبديل الشعب'), t('«تبديل شعب» بالرئيسية')],
  ['market', t('السوق'), t('«السوق» بالرئيسية')],
  ['study', t('ندرس سوا'), t('«ندرس سوا» بالرئيسية')],
];

/** The owner shapes the app: texts, the home banner and quick links, a notice for everyone, and which features are on. */
export default function Look() {
  const saved = useAppContent();
  const [c, setC] = useState<AppContent>(saved);
  const [busy, setBusy] = useState(false);
  useEffect(() => { refreshAppContent(true); }, []);
  useEffect(() => { setC(saved); }, [saved]);
  const dirty = JSON.stringify(c) !== JSON.stringify(saved);

  const set = (f: (x: AppContent) => AppContent) => setC((x) => f(JSON.parse(JSON.stringify(x)) as AppContent));
  const quick: QuickKey[] = c.home?.quick?.length ? c.home.quick : DEFAULT_QUICK.map((q) => q.key);

  async function save() {
    setBusy(true);
    const { data, error } = await supabase.rpc('admin_set_app_content', { p: c });
    setBusy(false);
    if (error) { Alert.alert(t('ما زبط الحفظ'), error.message); return; }
    applyAppContent(data as AppContent); done();
  }

  return (
    <AdminScreen ownerOnly title={t('شكل التطبيق')} subtitle={t('النصوص والإعلانات والميزات اللي بتظهر للطلاب')}
      right={<Button title={t('احفظ')} kind="primary" loading={busy} disabled={!dirty} onPress={save} style={{ minHeight: 40, paddingHorizontal: 16 }} />}>

      <Section title={t('رسالة لكل الطلاب')} />
      <Panel>
        <Muted>{t('شريط ملوّن فوق الصفحة الرئيسية، مثلاً «في صيانة الليلة» أو «مبروك النتائج».')}</Muted>
        <Toggle label={t('اعرض الرسالة')} value={!!c.notice?.on} onChange={(v) => set((x) => ({ ...x, notice: { ...x.notice, on: v } }))} />
        <Field label={t('نص الرسالة')} value={c.notice?.text ?? ''} maxLength={160} onChangeText={(v) => set((x) => ({ ...x, notice: { ...x.notice, text: v } }))} />
        <Tones value={c.notice?.tone ?? 'orange'} onChange={(v) => set((x) => ({ ...x, notice: { ...x.notice, tone: v } }))} />
      </Panel>

      <Section title={t('الصفحة الرئيسية')} />
      <Panel>
        <Field label={t('الترحيب (فاضي = «صباح الخير، …» العادي)')} placeholder={t('مثلاً: أهلاً {name}، بالتوفيق بالامتحانات')} value={c.home?.greeting ?? ''} maxLength={60}
          onChangeText={(v) => set((x) => ({ ...x, home: { ...x.home, greeting: v } }))} />
        <Muted>{t('اكتب {name} مكان اسم الطالب الأول.')}</Muted>
      </Panel>
      <Panel>
        <T v="bodyMd">{t('بانر بالرئيسية')}</T>
        <Toggle label={t('اعرض البانر')} value={!!c.home?.banner?.on} onChange={(v) => set((x) => ({ ...x, home: { ...x.home, banner: { ...x.home?.banner, on: v } } }))} />
        <Field label={t('العنوان')} value={c.home?.banner?.title ?? ''} maxLength={60} onChangeText={(v) => set((x) => ({ ...x, home: { ...x.home, banner: { ...x.home?.banner, title: v } } }))} />
        <Field label={t('النص')} value={c.home?.banner?.body ?? ''} maxLength={160} multiline onChangeText={(v) => set((x) => ({ ...x, home: { ...x.home, banner: { ...x.home?.banner, body: v } } }))} />
        <Field label={t('لما ينكبس يفتح (رابط https أو صفحة مثل /rides)')} value={c.home?.banner?.link ?? ''} autoCapitalize="none" autoCorrect={false}
          onChangeText={(v) => set((x) => ({ ...x, home: { ...x.home, banner: { ...x.home?.banner, link: v.trim() } } }))} />
        <Tones value={c.home?.banner?.tone ?? 'blue'} onChange={(v) => set((x) => ({ ...x, home: { ...x.home, banner: { ...x.home?.banner, tone: v } } }))} />
        {c.home?.banner?.title ? (
          <LinearGradient colors={TONES[c.home.banner.tone ?? 'blue']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 16, gap: 4 }}>
            <T v="h3" color="#FFFFFF">{c.home.banner.title}</T>
            {c.home.banner.body ? <T v="small" color="rgba(255,255,255,0.9)">{c.home.banner.body}</T> : null}
          </LinearGradient>
        ) : null}
      </Panel>

      <Section title={t('اختصارات الرئيسية')} />
      <Panel>
        <Muted>{t('شغّل أو طفّي أي اختصار، ورتّبهم بالأسهم.')}</Muted>
        {[...quick, ...QUICK.map((q) => q.key).filter((k) => !quick.includes(k))].map((k) => {
          const q = QUICK.find((x) => x.key === k)!;
          const on = quick.includes(k);
          const i = quick.indexOf(k);
          const move = (d: number) => set((x) => { const l = [...quick]; [l[i], l[i + d]] = [l[i + d], l[i]]; return { ...x, home: { ...x.home, quick: l } }; });
          return (
            <Row key={k} gap={6} style={{ minHeight: 52, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              <View style={{ flex: 1 }}>
                <Toggle label={q.label} value={on} onChange={(v) => set((x) => ({ ...x, home: { ...x.home, quick: v ? [...quick, k] : quick.filter((y) => y !== k) } }))} />
              </View>
              {on && <Tap onPress={() => i > 0 && move(-1)} disabled={i === 0} accessibilityLabel={t('لفوق')} style={{ padding: 8, opacity: i === 0 ? 0.3 : 1 }}><ArrowUp size={18} color={C.ink} /></Tap>}
              {on && <Tap onPress={() => i < quick.length - 1 && move(1)} disabled={i === quick.length - 1} accessibilityLabel={t('لتحت')} style={{ padding: 8, opacity: i === quick.length - 1 ? 0.3 : 1 }}><ArrowDown size={18} color={C.ink} /></Tap>}
            </Row>
          );
        })}
      </Panel>

      <Section title={t('الميزات')} />
      <Panel>
        <Muted>{t('لما تطفّي ميزة، أزرارها بتختفي عند كل الطلاب، وبياناتهم بتضل محفوظة.')}</Muted>
        {FEATURES.map(([k, label, hint]) => (
          <Toggle key={k} label={label} hint={hint} value={c.features?.[k] !== false} onChange={(v) => set((x) => ({ ...x, features: { ...x.features, [k]: v } }))} />
        ))}
      </Panel>

      <Section title={t('صفحة تسجيل الدخول')} />
      <Panel>
        <Field label={t('العنوان (فاضي = «جامعتك كلها بجيبتك»)')} value={c.login?.title ?? ''} maxLength={50} onChangeText={(v) => set((x) => ({ ...x, login: { ...x.login, title: v } }))} />
        <Field label={t('السطر تحت العنوان')} value={c.login?.tagline ?? ''} maxLength={140} multiline onChangeText={(v) => set((x) => ({ ...x, login: { ...x.login, tagline: v } }))} />
      </Panel>

      <Actions>
        <Button title={t('احفظ التغييرات')} kind="primary" loading={busy} disabled={!dirty} onPress={save} />
        {dirty && <Button title={t('تراجع')} kind="ghost" onPress={() => setC(saved)} />}
      </Actions>
      <Muted>{t('التغييرات بتوصل للطلاب أول ما يفتحوا التطبيق أو الصفحة، وكل تعديل بينحفظ بسجل الإدارة.')}</Muted>
    </AdminScreen>
  );
}

function Tones({ value, onChange }: { value: Tone; onChange: (v: Tone) => void }) {
  return (
    <Row gap={8} style={{ flexWrap: 'wrap' }}>
      {TONE_NAMES.map(([k, l]) => <Chip key={k} label={l} dot={TONES[k][0]} active={value === k} onPress={() => onChange(k)} />)}
    </Row>
  );
}
