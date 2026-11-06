import { MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { Button, Chip, Field, Row, T } from '@/components/ui';
import { t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, shadow } from '@/lib/theme';

import { kindOf, SUGGEST_KINDS } from './kinds';

/** "Suggest a missing place": move the map under the pin, name it, and the team approves it. */
export function SuggestPlace({ universityId, userId, at, onClose }: { universityId: string; userId?: string; at: () => { lat: number; lng: number }; onClose: () => void }) {
  const [step, setStep] = useState<'pin' | 'form'>('pin');
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cafeteria');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    if (busy) return;
    if (name.trim().length < 2) { Alert.alert(t('اكتب اسم المكان')); return; }
    const p = at();
    setBusy(true);
    const { error } = await supabase.from('places').insert({ university_id: universityId, kind, name_ar: name.trim(), description: desc.trim() || null, lat: p.lat, lng: p.lng, state: 'pending', created_by: userId });
    setBusy(false);
    if (error) { Alert.alert(t('ما انبعت'), t('جرّب كمان مرة.')); return; }
    onClose();
    Alert.alert(t('شكراً! ✓'), t('وصلنا اقتراحك، وبيطلع على الخريطة لكل طلاب جامعتك بعد ما نراجعه.'));
  }

  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginTop: -44 }}>
          <MapPin size={44} color={C.red} fill={C.red} />
          <View style={{ width: 8, height: 4, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.3)' }} />
        </View>
      </View>
      <Animated.View entering={SlideInDown.duration(240)} style={[{ position: 'absolute', left: 12, right: 12, bottom: 28, backgroundColor: C.card, borderRadius: 28, padding: 16, gap: 10 }, shadow]}>
        {step === 'pin' ? (
          <>
            <T v="h3">{t('اقترح مكان ناقص')}</T>
            <T v="small" color={C.muted}>{t('حرّك الخريطة لحتى يصير الدبوس الأحمر فوق المكان بالضبط.')}</T>
            <Row gap={8}>
              <Button kind="soft" title={t('إلغاء')} onPress={onClose} style={{ flex: 1 }} />
              <Button title={t('هون بالضبط')} onPress={() => setStep('form')} style={{ flex: 1.4 }} />
            </Row>
          </>
        ) : (
          <>
            <T v="h3">{t('شو هاد المكان؟')}</T>
            <Field label={t('الاسم')} value={name} onChangeText={setName} placeholder={t('مثلاً كشك أبو أحمد، مدرج الحسن')} maxLength={70} autoFocus />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {SUGGEST_KINDS.map((k) => <Chip key={k} label={kindOf(k).label} active={kind === k} onPress={() => setKind(k)} />)}
            </ScrollView>
            <Field label={t('وصف قصير (اختياري)')} value={desc} onChangeText={setDesc} placeholder={t('مثلاً جنب الباب الشمالي، بفتح من 8 لـ 4')} maxLength={160} />
            <Row gap={8}>
              <Button kind="soft" title={t('رجوع')} onPress={() => setStep('pin')} style={{ flex: 1 }} />
              <Button title={t('ابعت الاقتراح')} loading={busy} disabled={busy} onPress={send} style={{ flex: 1.4 }} />
            </Row>
          </>
        )}
      </Animated.View>
    </>
  );
}
