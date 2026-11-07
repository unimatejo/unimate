import * as Haptics from 'expo-haptics';
import { GraduationCap, RefreshCw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';

import { RideSheet } from '@/components/rides/RideSheet';
import { Button, Field, Row, T, Tap } from '@/components/ui';
import { LOCALE, t } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, F, shadow } from '@/lib/theme';
import { toast } from '@/lib/toast';

type Link = { url: string; synced_at: string | null; last_count: number };
const STALE = 12 * 3600000; // re-read Moodle at most twice a day, when the screen opens

const ERR: Record<string, string> = {
  not_university: t('يجب أن يكون الرابط من Moodle جامعتك.'),
  not_export_link: t('هذا ليس رابط تصدير التقويم. انسخ «رابط التقويم» من صفحة التصدير.'),
  bad_link: t('الرابط غير صحيح.'),
  moodle_refused: t('لم يقبل Moodle الرابط. ربما انتهت صلاحيته، أنشئ رابطاً جديداً.'),
  moodle_unreachable: t('تعذّر الوصول إلى Moodle الآن، حاول لاحقًا.'),
  not_calendar: t('لم يقبل Moodle الرابط: ربما انتهت صلاحيته أو نُسخ ناقصاً. أنشئ رابطاً جديداً والصقه كاملاً.'),
  too_big: t('التقويم كبير جداً.'),
};

async function call(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('moodle-import', { body });
  if (!error) return { ok: true as const, data: data as { added: number; updated: number; found: number; matched: number } };
  let code = '';
  try { code = (await (error as { context?: Response }).context?.json())?.error ?? ''; } catch { /* no body */ }
  return { ok: false as const, msg: ERR[code] ?? t('تعذّر ذلك، حاول مرة أخرى.') };
}

/**
 * Deadlines straight from Moodle: paste your calendar export link once, and assignments and quizzes land in your
 * timetable (and count toward your section). Refreshes by itself when the screen opens, at most twice a day.
 */
export function MoodleImport({ onImported }: { onImported?: () => void }) {
  const [link, setLink] = useState<Link | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('moodle_links').select('url, synced_at, last_count').maybeSingle();
    setLink((data as Link | null) ?? null);
    return (data as Link | null) ?? null;
  }, []);

  const sync = useCallback(async (u?: string, quiet = false) => {
    setBusy(true);
    const r = await call(u ? { url: u } : {});
    setBusy(false);
    if (!r.ok) { if (!quiet) toast.error(r.msg); return false; }
    await load();
    if (!quiet || r.data.added || r.data.updated) {
      toast(r.data.added ? t('تمت إضافة {0} موعد من Moodle ✓', [String(r.data.added)]) : t('كل مواعيد Moodle لديك ✓'));
      onImported?.();
    }
    return true;
  }, [load, onImported]);

  useEffect(() => {
    load().then((l) => {
      if (l && !auto.current && (!l.synced_at || Date.now() - new Date(l.synced_at).getTime() > STALE)) { auto.current = true; sync(undefined, true); }
    });
  }, [load, sync]);

  async function connect() {
    if (!url.trim() || busy) return;
    if (await sync(url.trim())) { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); setOpen(false); setUrl(''); }
  }

  function forget() {
    Alert.alert(t('فصل Moodle؟'), t('تبقى المواعيد المضافة، لكن لن تُضاف مواعيد جديدة.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('افصل'), style: 'destructive', onPress: async () => { await call({ forget: true }); load(); } },
    ]);
  }

  if (link === undefined) return null;
  return (
    <>
      {link ? (
        <Row gap={10} style={[{ backgroundColor: C.card, borderRadius: 20, padding: 12 }, shadow]}>
          <GraduationCap size={20} color={C.primary} />
          <View style={{ flex: 1 }}>
            <T v="bodyMd">{t('مرتبط بـ Moodle')}</T>
            <T v="tiny" color={C.muted}>{link.synced_at ? t('آخر تحديث {0}', [new Date(link.synced_at).toLocaleString(LOCALE, { weekday: 'short', hour: 'numeric', minute: '2-digit' })]) : t('لم يُحدَّث بعد')}</T>
          </View>
          <Tap onPress={() => sync()} disabled={busy} accessibilityRole="button" accessibilityLabel={t('تحديث من Moodle')} style={{ padding: 8 }}>
            <RefreshCw size={18} color={busy ? C.faint : C.ink} />
          </Tap>
          <Tap onPress={forget} accessibilityRole="button" style={{ padding: 8 }}><T v="tiny" color={C.red}>{t('افصل')}</T></Tap>
        </Row>
      ) : (
        <Tap haptic={false} scale={0.985} onPress={() => setOpen(true)} accessibilityRole="button"
          style={[{ backgroundColor: C.card, borderRadius: 22, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }, shadow]}>
          <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
            <GraduationCap size={21} color={C.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T v="bold">{t('استورد واجباتك من Moodle')}</T>
            <T v="tiny" color={C.muted}>{t('المصدر الرسمي: واجباتك وامتحاناتك وفق تسجيلك الفعلي، وتتحدّث تلقائياً')}</T>
          </View>
          <T v="small" color={C.primary} style={{ fontFamily: F.bodyBold }}>{t('اربط')}</T>
        </Tap>
      )}

      <RideSheet open={open} onClose={() => setOpen(false)} title={t('اربط Moodle')} sub={t('يستغرق دقيقة واحدة')}>
        <View style={{ gap: 6, backgroundColor: C.soft, borderRadius: 16, padding: 12 }}>
          {[t('افتح Moodle جامعتك من المتصفح وسجّل الدخول (الهاشمية: lms.hu.edu.jo).'), t('انتقل إلى «التقويم»، ثم اضغط في الأسفل على «استيراد أو تصدير التقويمات» ثم «تصدير التقويم».'),
            t('اختر «كل الأحداث» و«الأيام الـ60 القادمة» أو «الفترة المخصصة».'), t('اضغط «احصل على رابط التقويم» وانسخ الرابط والصقه هنا.')]
            .map((s, i) => <T key={i} v="small" color={C.ink2}>{`${i + 1}. ${s}`}</T>)}
        </View>
        <Field value={url} onChangeText={setUrl} placeholder="https://…/calendar/export_execute.php?…" autoCapitalize="none" autoCorrect={false} keyboardType="url"
          style={{ textAlign: 'left', writingDirection: 'ltr', fontSize: 13 }} />
        <T v="tiny" color={C.muted}>{t('يبقى الرابط خاصاً بك، ونقرأ منه المواعيد فقط. يمكنك فصله في أي وقت.')}</T>
        <Button title={t('استورد')} onPress={connect} loading={busy} disabled={busy || !url.trim()} />
      </RideSheet>
    </>
  );
}
