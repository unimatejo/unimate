import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Eye, Landmark, Send } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { AnnouncementCard, type Announcement } from '@/components/announcements/AnnouncementCard';
import { Button, Chip, Empty, Field, Header, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';
import { toast } from '@/lib/toast';

type Scope = { whole_university: boolean; college_id: string | null; college_name: string | null };
const WHOLE = 'whole';
const linkOk = (l: string) => !l.trim() || (/^https:\/\/\S+$/.test(l.trim()) && l.trim().length <= 300);

/** Write (or edit with ?id=) an official announcement. Only verified leadership / dean's office can open this. */
export default function NewAnnouncement() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { profile } = useAuth();
  const [scopes, setScopes] = useState<Scope[] | null>(null);
  const [scope, setScope] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('my_announce_scopes');
      const list = (data ?? []) as Scope[];
      setScopes(list);
      if (id) {
        const { data: feed } = await supabase.rpc('announcements_feed', { lim: 100 });
        const a = ((feed ?? []) as Announcement[]).find((x) => x.id === id && x.mine);
        if (a) { setEditing(a); setTitle(a.title); setBody(a.body); setLink(a.link ?? ''); setScope(a.college_id ?? WHOLE); }
      } else if (list.length) {
        const mine = list.find((s) => s.college_id && s.college_id === profile?.college_id);
        setScope(mine?.college_id ?? (list[0].whole_university ? WHOLE : list[0].college_id));
      }
    })().catch(() => setScopes([]));
  }, [id, profile?.college_id]);

  const options = useMemo(() => {
    const o: [string, string][] = [];
    if (scopes?.some((s) => s.whole_university)) o.push([WHOLE, t('الجامعة كاملة')]);
    for (const s of scopes ?? []) if (s.college_id) o.push([s.college_id, s.college_name ?? t('كلية')]);
    return o;
  }, [scopes]);

  const valid = title.trim().length >= 2 && title.trim().length <= 120 && body.trim().length >= 1 && body.trim().length <= 3000 && linkOk(link) && !!scope;
  const college = scope === WHOLE ? null : scope;

  async function submit() {
    if (!valid || busy) return;
    if (editing) {
      setBusy(true);
      const r = await run(supabase.rpc('edit_announcement', { p_id: editing.id, p_title: title.trim(), p_body: body.trim(), p_link: link.trim() || null }));
      setBusy(false);
      if (!r.ok) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      toast(t('تم حفظ التعديل ✓'));
      router.back();
      return;
    }
    setBusy(true);
    const { data: n } = await supabase.rpc('announcement_audience_count', { p_college: college });
    setBusy(false);
    const where = options.find(([k]) => k === scope)?.[1] ?? '';
    Alert.alert(t('نشر الإعلان؟'), t('سيصل إشعار إلى {0} شخص في {1}.', [String(n ?? 0), where]), [
      { text: t('لا'), style: 'cancel' },
      { text: t('انشر'), onPress: async () => {
        setBusy(true);
        const r = await run(supabase.rpc('post_announcement', { p_college: college, p_title: title.trim(), p_body: body.trim(), p_link: link.trim() || null }), { quiet: true });
        setBusy(false);
        if (!r.ok) {
          const m = String(r.error?.message ?? '');
          Alert.alert(t('تعذّر النشر'), /rate_limited/.test(m) ? t('وصلت إلى الحد: 10 إعلانات في اليوم.') : /bad_link/.test(m) ? t('يجب أن يبدأ الرابط بـ https://') : /not_allowed/.test(m) ? t('ليست لديك صلاحية النشر في هذا المكان.') : t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.'));
          return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        toast(t('تم نشر الإعلان ✓'));
        router.back();
      } },
    ]);
  }

  if (scopes === null) return <Screen><Header title={t('إعلان جديد')} /><ActivityIndicator color={C.primary} style={{ marginTop: 40 }} /></Screen>;
  if (!options.length) return (
    <Screen>
      <Header title={t('إعلان جديد')} />
      <Empty icon={<Landmark size={28} color={C.primary} />} title={t('النشر للإدارة والعمادات فقط')}
        body={t('ينشر الإعلانات الرسمية رئيس الجامعة والعمداء ورؤساء الأقسام ومكتب العميد بعد توثيق حساباتهم.')} />
    </Screen>
  );

  const draft: Announcement = {
    id: 'preview', college_id: college, college_name: college ? options.find(([k]) => k === college)?.[1] ?? null : null,
    title: title.trim() || t('عنوان الإعلان'), body: body.trim() || t('نص الإعلان'), link: linkOk(link) && link.trim() ? link.trim() : null,
    pinned: false, created_at: new Date().toISOString(), edited_at: null, author_id: profile?.id ?? '', author_name: profile?.full_name ?? '',
    author_avatar: profile?.avatar_url ?? null, author_title: profile?.title_verified ? profile?.academic_title ?? null : null,
    author_verified: !!profile?.title_verified, mine: true, can_pin: false,
  };

  return (
    <Screen>
      <Header title={editing ? t('تعديل الإعلان') : t('إعلان جديد')} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 60 }}>
          <View style={{ gap: 8 }}>
            <T v="bold">{t('لمن الإعلان؟')}</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {options.map(([k, label]) => (
                <Chip key={k} label={label} active={scope === k} onPress={() => { if (!editing) setScope(k); }} />
              ))}
            </Row>
            {editing && <T v="tiny" color={C.muted}>{t('لا يمكنك تغيير الجهة بعد النشر.')}</T>}
          </View>

          <View style={{ gap: 4 }}>
            <Field label={t('العنوان')} value={title} onChangeText={setTitle} maxLength={120} placeholder={t('مثلاً تأجيل امتحانات يوم الخميس')} />
            <T v="tiny" color={title.length > 110 ? C.orange : C.faint} style={{ alignSelf: 'flex-end' }}>{title.length}/120</T>
          </View>
          <View style={{ gap: 4 }}>
            <Field label={t('النص')} value={body} onChangeText={setBody} maxLength={3000} multiline placeholder={t('اكتب تفاصيل الإعلان…')}
              style={{ minHeight: 160, paddingTop: 14, textAlignVertical: 'top' }} />
            <T v="tiny" color={body.length > 2900 ? C.orange : C.faint} style={{ alignSelf: 'flex-end' }}>{body.length}/3000</T>
          </View>
          <View style={{ gap: 4 }}>
            <Field label={t('رابط (اختياري)')} value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} keyboardType="url"
              placeholder="https://hu.edu.jo/..." style={{ textAlign: 'left', writingDirection: 'ltr' }} />
            {!linkOk(link) && <T v="tiny" color={C.red}>{t('يجب أن يبدأ الرابط بـ https://')}</T>}
          </View>

          <Button kind="soft" title={preview ? t('إخفاء المعاينة') : t('معاينة')} icon={<Eye size={18} color={C.primary} />} onPress={() => setPreview((p) => !p)} />
          {preview && <AnnouncementCard a={draft} index={0} onAuthor={() => {}} />}

          <Button title={editing ? t('احفظ التعديل') : t('انشر الإعلان')} icon={<Send size={18} color={C.white} />} loading={busy} disabled={!valid} onPress={submit} />
          {!editing && <T v="tiny" color={C.muted} style={{ textAlign: 'center' }}>{t('سيصل إشعار إلى كل من في الجهة التي اخترتها، وسيظهر اسمك ورتبتك على الإعلان.')}</T>}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
