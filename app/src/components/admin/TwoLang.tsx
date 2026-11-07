import { Languages } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { ownDir } from '@/components/home/OwnerContent';
import { Field, Row, T, Tap } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

/** The English for the owner's Arabic, by the `translate` function; null if it couldn't be done. */
export async function toEnglish(texts: string[]): Promise<string[] | null> {
  const { data, error } = await supabase.functions.invoke('translate', { body: { texts } });
  return error || !Array.isArray(data?.texts) ? null : (data.texts as string[]);
}

/** A pair of fields: the Arabic, and its English under it with a button that writes it. */
export function TwoLang({ label, ar, en, onAr, onEn, max, multiline, placeholder }: {
  label: string; ar?: string; en?: string; onAr: (v: string) => void; onEn: (v: string) => void; max: number; multiline?: boolean; placeholder?: string;
}) {
  const [busy, setBusy] = useState(false);
  async function translate() {
    if (!ar?.trim()) return;
    setBusy(true);
    const r = await toEnglish([ar.trim()]);
    setBusy(false);
    if (r) onEn(r[0]); else Alert.alert(t('تعذّرت الترجمة'), t('اكتب الإنجليزية بنفسك أو حاول بعد قليل.'));
  }
  return (
    <View style={{ gap: 8 }}>
      <Field label={label} value={ar ?? ''} onChangeText={onAr} maxLength={max} multiline={multiline} placeholder={placeholder} style={ownDir(ar || 'ع')} />
      <Row gap={8} style={{ alignItems: 'flex-end' }}>
        <View style={{ flex: 1 }}>
          <Field label={t('بالإنجليزية (لمن يستخدم التطبيق بالإنجليزية)')} value={en ?? ''} onChangeText={onEn} maxLength={max} multiline={multiline} style={ownDir(en || 'a')} />
        </View>
        <Tap onPress={translate} disabled={busy || !ar?.trim()} accessibilityLabel={t('ترجم تلقائيًا')}
          style={{ minHeight: 52, paddingHorizontal: 14, borderRadius: 16, backgroundColor: C.soft, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: busy || !ar?.trim() ? 0.5 : 1 }}>
          <Languages size={17} color={C.ink} /><T v="bold" style={{ fontSize: 13 }}>{busy ? t('جارٍ…') : t('ترجم')}</T>
        </Tap>
      </Row>
    </View>
  );
}
