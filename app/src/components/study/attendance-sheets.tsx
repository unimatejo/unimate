import * as Haptics from 'expo-haptics';
import { Check, RefreshCw, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, Field, Row, Segmented, T, Tap } from '@/components/ui';
import { AbsenceDate, ymdOf } from './attendance-date';
import { isRateLimited, run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { toast } from '@/lib/toast';
import { LOCALE, t } from '@/lib/i18n';

export type CourseRow = {
  section_id: string; course_name: string; course_code: string | null; per_week: number; total_sessions: number;
  absent: number; excused: number; limit_sessions: number; remaining: number; absence_pct: number;
};
export type Mark = { id: string; section_id: string; on_date: string; slot: string; status: 'absent' | 'excused'; note: string | null };

const done = () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

/** The bottom sheet frame used by both sheets (drag handle, dim background, safe area). */
function Sheet({ open, onClose, title, sub, children }: { open: boolean; onClose: () => void; title: string; sub?: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={onClose} accessibilityLabel={t('إغلاق')} />
        <View style={{ maxHeight: '82%', backgroundColor: C.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 16 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 12 }} />
          <T v="h2" numberOfLines={2}>{title}</T>
          {sub ? <T v="small" color={C.muted} style={{ marginTop: 2, marginBottom: 12 }}>{sub}</T> : <View style={{ height: 12 }} />}
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** "+ سجّل غياب": pick the day, absent or with an excuse, an optional note. */
export function AddAbsenceSheet({ course, onClose, onSaved }: { course: CourseRow | null; onClose: () => void; onSaved: (c: CourseRow, status: Mark['status']) => void }) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const min = new Date(today); min.setDate(min.getDate() - 240);
  const [date, setDate] = useState(today);
  const [kind, setKind] = useState(0);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (course) { setDate(today); setKind(0); setNote(''); } }, [course?.section_id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    if (!course || busy) return;
    setBusy(true);
    const status: Mark['status'] = kind === 1 ? 'excused' : 'absent';
    // user_id is filled in by the database (it's always the signed-in student)
    const { error } = await supabase.from('attendance_marks').insert({ section_id: course.section_id, on_date: ymdOf(date), slot: '', status, note: note.trim().slice(0, 120) || null });
    setBusy(false);
    if (error) {
      if (error.code === '23505') { Alert.alert(t('مسجّل غياب في هذا اليوم لهذه المادة'), t('افتح التفاصيل إذا أردت تعديله أو حذفه.')); return; }
      if (isRateLimited(error)) { toast.error(t('انتظر قليلاً، لقد سجّلت كثيراً في وقت قصير.')); return; }
      await run(Promise.resolve({ data: null, error }), { msg: t('لم يُحفظ الغياب، حاول مرة أخرى.') });
      return;
    }
    done();
    toast(status === 'excused' ? t('تم تسجيل غياب بعذر ✓') : t('تم تسجيل الغياب ✓'));
    onSaved(course, status);
  }

  return (
    <Sheet open={!!course} onClose={onClose} title={t('سجّل غيابًا')} sub={course?.course_name}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 6 }}>
          <T v="bold" style={{ fontSize: 14 }}>{t('متى تغيّبت؟')}</T>
          <AbsenceDate value={date} onChange={setDate} min={min} max={today} />
        </View>
        <Segmented items={[t('غياب'), t('بعذر')]} value={kind} onChange={setKind} />
        {kind === 1 && <T v="tiny" color={C.muted}>{t('الغياب بعذر لا يُحتسب من الحد لدينا. تأكد من قبول العذر لدى الدكتور.')}</T>}
        <Field label={t('ملاحظة (اختياري)')} value={note} onChangeText={setNote} placeholder={t('مثلاً: كنت مريضًا')} maxLength={120} />
        <Button title={t('سجّل')} loading={busy} onPress={save} icon={<Check size={18} color={C.white} />} />
      </View>
    </Sheet>
  );
}

/** Every absence of one course: switch absent ↔ excused, or delete one that was a mistake. */
export function MarksSheet({ course, onClose, onChanged }: { course: CourseRow | null; onClose: () => void; onChanged: () => void }) {
  const [marks, setMarks] = useState<Mark[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!course) return;
    setMarks(null);
    supabase.from('attendance_marks').select('id, section_id, on_date, slot, status, note').eq('section_id', course.section_id).order('on_date', { ascending: false }).limit(200)
      .then(({ data, error }) => { if (error) { setMarks([]); toast.error(t('تعذّر جلب الغيابات.')); } else setMarks((data ?? []) as Mark[]); }, () => setMarks([]));
  }, [course]);

  async function flip(m: Mark) {
    if (busy) return;
    const next: Mark['status'] = m.status === 'absent' ? 'excused' : 'absent';
    setBusy(m.id);
    setMarks((x) => x?.map((y) => (y.id === m.id ? { ...y, status: next } : y)) ?? null);
    const r = await run(supabase.from('attendance_marks').update({ status: next }).eq('id', m.id), { msg: t('لم يُحفظ التعديل، حاول مرة أخرى.') });
    setBusy(null);
    if (!r.ok) { setMarks((x) => x?.map((y) => (y.id === m.id ? { ...y, status: m.status } : y)) ?? null); return; }
    done(); onChanged();
  }

  function remove(m: Mark) {
    Alert.alert(t('حذف هذا الغياب؟'), new Date(`${m.on_date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' }), [
      { text: t('لا'), style: 'cancel' },
      { text: t('احذف'), style: 'destructive', onPress: async () => {
        setBusy(m.id);
        const before = marks;
        setMarks((x) => x?.filter((y) => y.id !== m.id) ?? null);
        const r = await run(supabase.from('attendance_marks').delete().eq('id', m.id), { msg: t('لم يُحذف، حاول مرة أخرى.') });
        setBusy(null);
        if (!r.ok) { setMarks(before); return; }
        done(); onChanged();
      } },
    ]);
  }

  return (
    <Sheet open={!!course} onClose={onClose} title={course?.course_name ?? ''} sub={course ? t('{0} محاضرات في الأسبوع · {1} محاضرة في الفصل', [course.per_week, course.total_sessions]) : undefined}>
      {marks === null ? <ActivityIndicator color={C.primary} style={{ marginVertical: 30 }} />
      : marks.length === 0 ? (
        <View style={{ alignItems: 'center', paddingVertical: 28, gap: 6 }}>
          <T v="h3">{t('لا توجد غيابات 👏')}</T>
          <T v="small" color={C.muted}>{t('حافظ على التزامك هكذا.')}</T>
        </View>
      ) : (
        <ScrollView style={{ maxHeight: 440 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
          {marks.map((m) => {
            const ex = m.status === 'excused';
            return (
              <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.soft, borderRadius: 18, padding: 12, opacity: busy === m.id ? 0.6 : 1 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <T v="bodyMd">{new Date(`${m.on_date}T12:00:00`).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</T>
                  <Row gap={6}>
                    <View style={{ backgroundColor: ex ? C.greenSoft : C.redSoft, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 }}>
                      <T v="tiny" color={ex ? C.greenInk : C.red}>{ex ? t('بعذر') : t('غياب')}</T>
                    </View>
                    {m.note ? <T v="tiny" color={C.muted} numberOfLines={1} style={{ flexShrink: 1 }}>{m.note}</T> : null}
                  </Row>
                </View>
                <Tap onPress={() => flip(m)} disabled={!!busy} accessibilityLabel={ex ? t('اجعله غيابًا') : t('اجعله بعذر')}
                  style={{ height: 36, paddingHorizontal: 10, borderRadius: 12, backgroundColor: C.card, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <RefreshCw size={14} color={C.ink2} /><T v="tiny" color={C.ink2}>{ex ? t('غياب') : t('بعذر')}</T>
                </Tap>
                <Tap onPress={() => remove(m)} disabled={!!busy} accessibilityLabel={t('احذف')}
                  style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={16} color={C.red} />
                </Tap>
              </View>
            );
          })}
        </ScrollView>
      )}
    </Sheet>
  );
}
