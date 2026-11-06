import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Check, ScanLine } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import Animated, { SlideInDown } from 'react-native-reanimated';

import { GlyphTile, GRAD } from '@/components/ui/Glyph';
import { Button, Row, T, Tap } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { WEEKDAYS_SHORT, clock } from '@/lib/util';
import { t } from '@/lib/i18n';

type Mt = { days: number[]; start: string; end: string; room: string | null; kind: 'lecture' | 'lab' | 'online' | 'blended' | 'tutorial' };
type Course = { name: string; code: string | null; section: string | null; instructor: string | null; meetings: Mt[] };

async function pick(camera: boolean): Promise<string | null> {
  const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(camera ? t('الكاميرا مسكّرة') : t('الصور مسكّرة'), t('افتح الإعدادات واسمح ليونيميت يوصل للصور والكاميرا.'), [
      { text: t('لاحقاً'), style: 'cancel' }, { text: t('افتح الإعدادات'), onPress: () => Linking.openSettings() },
    ]);
    return null;
  }
  const res = camera ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9 }) : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 });
  if (res.canceled || !res.assets?.[0]) return null;
  const a = res.assets[0];
  const ctx = ImageManipulator.manipulate(a.uri);
  if ((a.width ?? 0) > 1800) ctx.resize({ width: 1800 }); // sharp enough to read small text, small enough to send
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ compress: 0.85, format: SaveFormat.JPEG, base64: true });
  return out.base64 ?? null;
}

/** "Scan my timetable": a screenshot of the registration page or a photo, read automatically, checked by you, then saved. */
export function ScheduleScan({ onDone, autoOpen }: { onDone: () => void; autoOpen?: boolean }) {
  const [reading, setReading] = useState(false);
  const [found, setFound] = useState<Course[] | null>(null);
  const [skip, setSkip] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  async function start(camera: boolean) {
    try {
      const b64 = await pick(camera);
      if (!b64) return;
      setReading(true);
      // never spin forever: the server gives up after about a minute, so do we
      const timeout = new Promise<{ data: null; error: Error }>((r) => setTimeout(() => r({ data: null, error: new Error('timeout') }), 70000));
      const { data, error } = await Promise.race([supabase.functions.invoke('schedule-import', { body: { image: b64, mime: 'image/jpeg' } }), timeout]);
      const status = (error as { context?: { status?: number } } | null)?.context?.status;
      if (status === 429) { Alert.alert(t('وصلت الحد اليومي'), t('بتقدر تقرأ جدول بالصورة 15 مرة باليوم. جرّب بكرا، أو ضيف موادك بإيدك.')); return; }
      if (error?.message === 'timeout' || status === 502) { Alert.alert(t('خدمة القراءة مشغولة هلأ'), t('جرّب كمان دقيقة، أو ضيف موادك بإيدك.')); return; }
      if (error || !data) throw new Error(data?.error ?? 'failed');
      if (data.error === 'not_configured') { Alert.alert(t('قراءة الجدول من الصورة لسا مش مفعّلة'), t('جرّب كمان شوي، أو ضيف موادك بإيدك.')); return; }
      if (!data.courses?.length) { Alert.alert(t('ما قدرنا نقرأ جدول بالصورة'), t('جرّب سكرين شوت أوضح لصفحة الجدول من بوابة الجامعة.')); return; }
      setSkip(new Set()); setFound(data.courses as Course[]);
    } catch { Alert.alert(t('ما زبطت القراءة'), t('تأكد من الإنترنت وجرّب كمان مرة.')); }
    finally { setReading(false); }
  }

  function choose() {
    Alert.alert(t('صوّر جدولك'), t('سكرين شوت من صفحة التسجيل، أو صورة للجدول المطبوع.'), [
      { text: t('من الصور'), onPress: () => start(false) },
      { text: t('صوّر هلأ'), onPress: () => start(true) },
      { text: t('إلغاء'), style: 'cancel' },
    ]);
  }

  async function save() {
    if (!found || saving) return;
    setSaving(true);
    let n = 0;
    try {
      for (const [i, c] of found.entries()) {
        if (skip.has(i)) continue;
        const { data: sec, error } = await supabase.rpc('add_course', { course_name: c.name, section_no: c.section || null, course_code: c.code, instructor: c.instructor });
        if (error || !sec) continue;
        n++;
        // all the meetings of a course at once
        await Promise.all(c.meetings.flatMap((m) => m.days.map((d) => supabase.rpc('report_meeting', { sec, wd: d, st: m.start, en: m.end, k: m.kind, room: m.room ?? '' }))));
      }
      setFound(null); onDone();
      Alert.alert(t('انضافت {0} مواد ✓', [n]), t('وانضميت لجروب كل مادة. إذا في وقت غلط، اكبس عليه وعدّله.'));
    } catch { Alert.alert(t('ما انحفظ كله'), t('جرّب كمان مرة.')); }
    finally { setSaving(false); }
  }

  useEffect(() => { if (autoOpen) choose(); }, [autoOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const kindL: Record<string, string> = { lecture: t('محاضرة'), lab: t('مختبر'), online: t('أونلاين'), blended: t('مدمج'), tutorial: t('مناقشة') };
  return (
    <>
      <Tap onPress={choose} disabled={reading} scale={0.98} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
        <GlyphTile icon={ScanLine} colors={GRAD.pink} size={48} live />
        <View style={{ flex: 1 }}>
          <T v="bold">{t('صوّر جدولك وخلّي التطبيق يعبّيه')}</T>
          <T v="tiny" color={C.muted}>{t('سكرين شوت من بوابة الجامعة، وبنقرأ المواد والأيام والأوقات والقاعات.')}</T>
        </View>
        {reading && <ActivityIndicator color={C.primary} />}
      </Tap>

      <Modal visible={reading} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.55)', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <View style={{ backgroundColor: C.card, borderRadius: 24, padding: 24, gap: 12, alignItems: 'center', maxWidth: 320 }}>
            <ActivityIndicator size="large" color={C.primary} />
            <T v="h3" style={{ textAlign: 'center' }}>{t('عم نقرأ جدولك…')}</T>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('عادة بياخد ثواني، وأحياناً لحد دقيقة. خليك على هالصفحة.')}</T>
          </View>
        </View>
      </Modal>

      <Modal visible={!!found} transparent animationType="fade" onRequestClose={() => setFound(null)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setFound(null)} />
        <Animated.View entering={SlideInDown.duration(240)} style={{ backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12, paddingBottom: 40, maxHeight: '88%' }}>
          <T v="h3">{t('هاد اللي قرأناه')}</T>
          <T v="tiny" color={C.muted}>{t('شيل العلامة عن أي مادة غلط. بعد الحفظ بتقدر تعدّل أي وقت.')}</T>
          <ScrollView contentContainerStyle={{ gap: 10 }}>
            {(found ?? []).map((c, i) => {
              const on = !skip.has(i);
              return (
                <Tap key={i} haptic={false} onPress={() => setSkip((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })}
                  style={{ flexDirection: 'row', gap: 10, backgroundColor: C.card, borderRadius: 18, padding: 12, opacity: on ? 1 : 0.5 }}>
                  <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: on ? C.primary : C.soft, alignItems: 'center', justifyContent: 'center', marginTop: 2 }}>
                    {on && <Check size={16} color={C.white} />}
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <T v="bold">{c.name}</T>
                    <T v="tiny" color={C.muted}>{[c.code, c.section ? t('شعبة {0}', [c.section]) : null, c.instructor].filter(Boolean).join(' · ')}</T>
                    {c.meetings.map((m, j) => (
                      <Row key={j} gap={6}>
                        <T v="small" color={C.ink2}>{m.days.map((d) => WEEKDAYS_SHORT[d]).join(' ')} · {clock(m.start)} - {clock(m.end)}</T>
                        <T v="tiny" color={C.muted}>{[kindL[m.kind], m.room].filter(Boolean).join(' · ')}</T>
                      </Row>
                    ))}
                    {!c.meetings.length && <T v="tiny" color={C.orange}>{t('ما لقينا وقت، ضيفه بعدين')}</T>}
                  </View>
                </Tap>
              );
            })}
          </ScrollView>
          <Button title={t('ضيف المواد ({0})', [String((found?.length ?? 0) - skip.size)])} loading={saving} disabled={saving || (found?.length ?? 0) === skip.size} onPress={save} />
        </Animated.View>
      </Modal>
    </>
  );
}
