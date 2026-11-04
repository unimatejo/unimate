import { Check, Languages, Smartphone } from 'lucide-react-native';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { GlyphTile, GRAD } from '@/components/Glyph';
import { Header, Row, Screen, T, Tap } from '@/components/ui';
import { langPref, reloadApp, setLanguage, t, type LangPref } from '@/lib/i18n';
import { setPref } from '@/lib/prefs';
import { C, R, THEMES, themePref, type ThemePref } from '@/lib/theme';

function Option({ icon, label, hint, on, onPress }: { icon: React.ReactNode; label: string; hint?: string; on: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} scale={0.98} accessibilityRole="radio" accessibilityState={{ selected: on }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
      {icon}
      <View style={{ flex: 1 }}>
        <T v="bodyMd">{label}</T>
        {hint ? <T v="tiny" color={C.muted}>{hint}</T> : null}
      </View>
      <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {on && <Check size={14} color={C.onPrimary} strokeWidth={3} />}
      </View>
    </Tap>
  );
}

/** A tiny phone drawn in that theme's colours: bubble, accent dot, selected pill. */
function ThemeCard({ k, label, on, onPress }: { k: ThemePref; label: string; on: boolean; onPress: () => void }) {
  const p = THEMES[k];
  return (
    <Tap onPress={onPress} scale={0.97} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={label} style={{ flex: 1, gap: 8, alignItems: 'center' }}>
      <View style={{ width: '100%', aspectRatio: 0.62, borderRadius: R.lg, backgroundColor: p.bg, borderWidth: on ? 2.5 : 1, borderColor: on ? C.primary : C.line, padding: 10, gap: 7, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          <View style={{ height: 14, flex: 1, borderRadius: 7, backgroundColor: p.inverse }} />
          <View style={{ height: 14, flex: 1, borderRadius: 7, backgroundColor: p.card }} />
        </View>
        <View style={{ height: 22, width: '78%', borderRadius: 11, backgroundColor: p.soft }} />
        <View style={{ height: 22, width: '62%', borderRadius: 11, backgroundColor: p.primary, alignSelf: 'flex-end' }} />
        <View style={{ height: 22, width: '70%', borderRadius: 11, backgroundColor: p.soft }} />
        <View style={{ flex: 1 }} />
        <View style={{ height: 26, borderRadius: 13, backgroundColor: p.card, borderWidth: 1, borderColor: p.line }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 28 }}>
        <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? C.primary : C.line, backgroundColor: on ? C.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {on && <Check size={12} color={C.onPrimary} strokeWidth={3} />}
        </View>
        <T v="bodyMd">{label}</T>
      </View>
    </Tap>
  );
}

/** Theme (navy / black / light) and language (Arabic / English / follow phone). Changing either reloads the app once. */
export default function Appearance() {
  const [theme, setTheme] = useState<ThemePref>(themePref());
  const [lng, setLng] = useState<LangPref>(langPref());

  function pickTheme(v: ThemePref) {
    if (v === theme) return;
    setTheme(v); setPref('theme', v); setTimeout(reloadApp, 150);
  }
  function pickLang(v: LangPref) {
    if (v === lng) return;
    setLng(v); setTimeout(() => setLanguage(v), 150);
  }

  return (
    <Screen>
      <Header title={t('المظهر واللغة')} />
      <ScrollView contentContainerStyle={{ padding: 18, gap: 20, paddingBottom: 60 }}>
        <View style={{ gap: 8 }}>
          <T v="small" color={C.muted} style={{ paddingHorizontal: 6 }}>{t('المظهر')}</T>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {([['midnight', t('كحلي')], ['black', t('أسود')], ['light', t('فاتح')]] as [ThemePref, string][]).map(([k, label]) => (
              <ThemeCard key={k} k={k} label={label} on={theme === k} onPress={() => pickTheme(k)} />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <T v="small" color={C.muted} style={{ paddingHorizontal: 6 }}>{t('اللغة')}</T>
          <View style={{ backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' }}>
            <Option icon={<GlyphTile icon={Smartphone} colors={GRAD.slate} size={36} />} label={t('حسب لغة التلفون')} on={lng === 'system'} onPress={() => pickLang('system')} />
            <Option icon={<GlyphTile icon={Languages} colors={GRAD.green} size={36} />} label="العربية" on={lng === 'ar'} onPress={() => pickLang('ar')} />
            <Option icon={<GlyphTile icon={Languages} colors={GRAD.blue} size={36} />} label="English" on={lng === 'en'} onPress={() => pickLang('en')} />
          </View>
          <Row gap={6} style={{ paddingHorizontal: 6 }}><T v="tiny" color={C.muted}>{t('التطبيق بيعيد التشغيل ثانية وحدة لما تغيّر.')}</T></Row>
        </View>
      </ScrollView>
    </Screen>
  );
}
