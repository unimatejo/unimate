import * as Haptics from 'expo-haptics';
import { Users } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Button, Row, T } from '@/components/ui';
import { EVENT_KIND, type SectionAsk } from '@/lib/events';
import { LOCALE, nm, t } from '@/lib/i18n';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { toast } from '@/lib/toast';

const keyOf = (a: SectionAsk) => `${a.section_id}|${a.kind}|${a.day}`;

/**
 * "3 من شعبتك ضافوا امتحان أول الأحد 10:00": things classmates added that I haven't, before they become official.
 * "صح، عندي" adds mine (one more toward the section); "مش متأكد" just hides it here.
 * `onChange` lets the screen reload once mine tipped one over into the section's timetable.
 */
export function SectionAsks({ onChange }: { onChange?: () => void }) {
  const [asks, setAsks] = useState<SectionAsk[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('section_event_asks');
    setAsks((data ?? []) as SectionAsk[]);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function confirm(a: SectionAsk) {
    const k = keyOf(a);
    setBusy(k);
    const r = await run(supabase.rpc('confirm_section_event', { p_section: a.section_id, p_kind: a.kind, p_day: a.day }), { quiet: true });
    setBusy(null);
    if (!r.ok) { toast.error(t('تعذّر ذلك، حاول مرة أخرى.')); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    toast(a.count + 1 >= a.needed ? t('أصبح لدى الشعبة كلها ✓') : t('تمت الإضافة لديك ✓'));
    await load();
    onChange?.();
  }

  const shown = asks.filter((a) => !hidden.has(keyOf(a)));
  if (!shown.length) return null;
  return (
    <View style={{ gap: 10 }}>
      {shown.map((a) => {
        const k = keyOf(a);
        const d = new Date(a.starts_at);
        const when = `${d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' })} · ${d.toLocaleTimeString(LOCALE, { hour: 'numeric', minute: '2-digit' })}`;
        return (
          <Animated.View key={k} entering={FadeIn.duration(200)} exiting={FadeOut.duration(160)}
            style={[{ backgroundColor: C.card, borderRadius: 22, padding: 14, gap: 10, borderWidth: 1, borderColor: C.primarySoft }, shadow]}>
            <Row gap={10}>
              <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                <Users size={19} color={C.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="bold" numberOfLines={2}>{t('{0} من شعبتك أضافوا {1}', [String(a.count), EVENT_KIND[a.kind] ?? a.title])}</T>
                <T v="small" color={C.ink2} numberOfLines={1}>{nm({ name_ar: a.course_name, name_en: a.course_name_en })}</T>
                <T v="tiny" color={C.muted}>{when}</T>
              </View>
            </Row>
            {/* how close it is to landing in everyone's timetable */}
            <View style={{ gap: 4 }}>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.soft, overflow: 'hidden', flexDirection: 'row' }}>
                <View style={{ width: `${Math.min(100, (a.count / a.needed) * 100)}%`, backgroundColor: C.primary, borderRadius: 3 }} />
              </View>
              <T v="tiny" color={C.muted} style={{ fontFamily: F.bodyMd }}>{t('سيُطبَّق على الشعبة كلها عندما يؤكده {0}', [String(a.needed)])}</T>
            </View>
            <Row gap={8}>
              <Button title={t('صحيح، لديّ أيضًا')} onPress={() => confirm(a)} loading={busy === k} disabled={!!busy} style={{ flex: 1, minHeight: 42 }} />
              <Button kind="soft" title={t('غير متأكد')} onPress={() => setHidden((h) => new Set(h).add(k))} disabled={!!busy} style={{ flex: 1, minHeight: 42 }} />
            </Row>
          </Animated.View>
        );
      })}
    </View>
  );
}
