import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { AtSign, BadgeCheck, Check, ChevronLeft, Lock, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeOutRight, ZoomIn } from 'react-native-reanimated';

import { MajorPicker } from '@/components/profile/MajorPicker';
import { TitleBadge, titleLabel } from '@/components/profile/TitleBadge';
import { InstagramGlyph, SnapGlyph } from '@/components/profile/SocialGlyphs';
import { Avatar, Button, Card, Chip, Field, Row, Screen, T, Tap } from '@/components/ui';
import { importTeamsCourses, useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { handleFrom } from '@/lib/util';
import { LOCALE, flip, nm, t } from '@/lib/i18n';

/** Academic year starts in September: entry 2024 -> 2nd year in 2025/26. */
export function studyYearFrom(entry: number | null | undefined) {
  if (!entry) return null;
  const now = new Date();
  const cur = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return Math.min(8, Math.max(1, cur - entry + 1));
}

const STEPS = [t('حسابك'), t('اسمك'), t('دراستك'), t('عنك'), t('حساباتك')];

export default function Welcome() {
  const { profile, university, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [auto, setAuto] = useState(0);            // animated "filled from your account" rows
  const [priv, setPriv] = useState<{ student_number: string | null; email: string | null; birth_date: string | null } | null>(null);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [uState, setUState] = useState<'idle' | 'checking' | 'ok' | 'taken' | 'bad'>('idle');
  const [col, setCol] = useState<string | null>(null);
  const [maj, setMaj] = useState<string | null>(null);
  const [entry, setEntry] = useState<number | null>(null);
  const [birth, setBirth] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(Platform.OS === 'ios');
  const [ig, setIg] = useState('');
  const [snap, setSnap] = useState('');
  const [saving, setSaving] = useState(false);
  const [teams, setTeams] = useState<number | null>(null);
  const [teamsBusy, setTeamsBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [dept, setDept] = useState('');
  /** what was filled for them from the university's records (major, entry year), so the screen can say so */
  const [found, setFound] = useState<{ major?: boolean; year?: boolean }>({});
  // a university staff email (name@uni.edu.jo, not a student number): doctors, deans and staff skip the student questions
  const staff = profile?.account_type === 'faculty' || profile?.account_type === 'staff';

  useEffect(() => {
    if (!profile || ready) return;
    setName(/^\d+$/.test(profile.full_name ?? '') ? '' : profile.full_name ?? '');
    setUsername(profile.username ?? '');
    setCol(profile.college_id); setMaj(profile.major_id); setEntry(profile.entry_year ?? null);
    setIg(profile.instagram ?? ''); setDept(profile.department ?? ''); setSnap(profile.snapchat ?? '');
    supabase.from('profile_private').select('student_number, email, birth_date').eq('user_id', profile.id).single().then(({ data }) => {
      setPriv(data); if (data?.birth_date) setBirth(new Date(data.birth_date));
    });
    setReady(true);
  }, [profile, ready]);

  // major and entry year from the university's student file, Microsoft and the student number, where they're known (0135)
  const studentId = profile && profile.account_type === 'student' ? profile.id : null;
  useEffect(() => {
    if (!studentId) return;
    supabase.rpc('auto_academic').then(({ data }) => {
      const d = (data ?? {}) as { entry_year?: number; major_id?: string; college_id?: string };
      if (d.entry_year) setEntry((e) => e ?? d.entry_year ?? null);
      if (d.major_id) { setMaj((m) => m ?? d.major_id ?? null); setCol((c) => c ?? d.college_id ?? null); }
      setFound({ major: !!d.major_id, year: !!d.entry_year });
    }, () => {});
  }, [studentId]);

  useEffect(() => {
    const t = setInterval(() => setAuto((s) => (s >= 4 ? s : s + 1)), 450);
    return () => clearInterval(t);
  }, []);

  // live username check
  const locked = !!profile?.username;
  useEffect(() => {
    if (locked) return;
    const u = username.trim().toLowerCase();
    if (!u) { setUState('idle'); return; }
    if (!/^[a-z0-9._]{3,24}$/.test(u)) { setUState('bad'); return; }
    setUState('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc('username_available', { u });
      setUState(data ? 'ok' : 'taken');
    }, 400);
    return () => clearTimeout(t);
  }, [username, locked]);

  const years = useMemo(() => { const y = new Date().getFullYear(); return Array.from({ length: 8 }, (_, i) => y - i); }, []);

  async function next() {
    if (step === 1) {
      if (name.trim().length < 2) { Alert.alert(t('اكتب اسمك الكامل')); return; }
      if (!locked && uState !== 'ok') { Alert.alert(t('اسم المستخدم'), uState === 'taken' ? t('اسم المستخدم هذا محجوز، جرّب اسمًا آخر.') : t('اختر اسم مستخدم من 3 إلى 24 حرفاً من الأحرف الإنجليزية الصغيرة أو الأرقام أو . و _')); return; }
    }
    if (step === 2 && !maj && !staff) {
      // universities without colleges yet, or a college without majors, must not block sign-up
      const { count: cols } = await supabase.from('colleges').select('id', { count: 'exact', head: true }).eq('university_id', university?.id ?? '');
      if (cols) {
        if (!col) { Alert.alert(t('اختر كليتك وتخصصك')); return; }
        const { count: majs } = await supabase.from('majors').select('id', { count: 'exact', head: true }).eq('college_id', col);
        if (majs) { Alert.alert(t('اختر كليتك وتخصصك')); return; }
      }
    }
    if (step === 3 && !entry && !staff) { Alert.alert(t('اختر سنة التحاقك بالجامعة')); return; }
    if (step === 4) { finish(); return; }
    setStep(step + 1);
  }

  async function finish() {
    if (!profile) return;
    const igH = handleFrom(ig, 'instagram'); const snH = handleFrom(snap, 'snapchat');
    if (igH && !/^[A-Za-z0-9._]{1,30}$/.test(igH)) { Alert.alert(t('إنستغرام'), t('اكتب اسم المستخدم أو الصق رابط حسابك.')); return; }
    if (snH && !/^[A-Za-z0-9._-]{1,30}$/.test(snH)) { Alert.alert(t('سناب شات'), t('اكتب اسم المستخدم أو الصق رابط حسابك.')); return; }
    setSaving(true);
    try {
    const patch: Record<string, unknown> = {
      full_name: name.trim(), college_id: col, major_id: staff ? null : maj, entry_year: staff ? null : entry, study_year: staff ? null : studyYearFrom(entry),
      onboarded: true,
    };
    if (staff && dept.trim() && !profile.title_verified) patch.department = dept.trim().slice(0, 80);
    if (!locked) patch.username = username.trim().toLowerCase();
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id).select('id').single();
    if (!error) await supabase.rpc('set_my_socials', { p_instagram: igH || null, p_snapchat: snH || null });
    if (!error && birth) await supabase.rpc('set_birth_date', { d: birth.toISOString().slice(0, 10) });
    setSaving(false);
    if (error) {
      Alert.alert(t('لم يُحفظ'), error.code === '23505' ? t('اسم المستخدم محجوز الآن، اختر اسماً آخر.') : t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.'));
      if (error.code === '23505') setStep(1);
      return;
    }
    await refreshProfile();
    router.replace('/(tabs)');
    } catch (e) {
      reportError(e); Alert.alert(t('لم يُحفظ'), t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.'));
    } finally { setSaving(false); }
  }

  const autoRows: [string, string | null | undefined][] = [
    [t('الجامعة'), nm(university)],
    [t('البريد الإلكتروني الجامعي'), priv?.email],
    staff
      ? [t('نوع الحساب'), profile?.title_verified && profile.academic_title ? titleLabel(profile.academic_title) : t('كادر الجامعة')]
      : [t('الرقم الجامعي'), priv?.student_number ?? '—'],
    [t('التوثيق'), profile?.ms_verified ? t('موثّق عبر Microsoft') : t('بالبريد الإلكتروني')],
  ];

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ paddingHorizontal: 22, paddingTop: 12, gap: 10 }}>
          <Row gap={6}>
            {STEPS.map((s, i) => (
              <View key={s} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i <= step ? C.primary : C.line }} />
            ))}
          </Row>
          <Row>
            {step > 0 ? <Tap onPress={() => setStep(step - 1)} style={{ minHeight: 36, justifyContent: 'center' }}><T v="bold" color={C.primaryDark}>{t('رجوع')}</T></Tap> : <View />}
            <View style={{ flex: 1 }} />
            <T v="tiny" color={C.muted}>{t('{0} من {1}', [step + 1, STEPS.length])}</T>
          </Row>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 22, gap: 18 }}>
          <Animated.View key={step} entering={FadeInLeft.duration(240)} exiting={FadeOutRight} style={{ gap: 18 }}>
            {step === 0 && (
              <>
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={92} ring />
                  <Row gap={6}>
                    <T v="h1" style={{ textAlign: 'center' }}>{t('أهلاً بك')}</T>
                    {profile?.ms_verified && <Animated.View entering={ZoomIn.delay(600)}><BadgeCheck size={26} color={C.white} fill={C.green} /></Animated.View>}
                  </Row>
                  <T v="body" color={C.muted} style={{ textAlign: 'center' }}>{t('هذه معلوماتك من حسابك الجامعي، وقد عُبّئت تلقائيًا.')}</T>
                </View>
                <Card pad={6} style={{ paddingHorizontal: 16 }}>
                  {autoRows.map(([k, v], i) => (
                    <Row key={k} gap={12} style={{ minHeight: 56 }}>
                      {i < auto ? (
                        <Animated.View entering={ZoomIn.duration(240)} style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={16} color={C.white} strokeWidth={3} />
                        </Animated.View>
                      ) : <ActivityIndicator color={C.primary} style={{ width: 28 }} />}
                      <T v="small" color={C.muted} style={{ flex: 1 }}>{k}</T>
                      {i < auto && <Animated.View entering={FadeIn} style={{ flexShrink: 1 }}><T v="bold" numberOfLines={1} style={{ writingDirection: k === t('البريد الإلكتروني الجامعي') ? 'ltr' : 'rtl' }}>{v ?? '...'}</T></Animated.View>}
                    </Row>
                  ))}
                </Card>
                <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('بقيت بعض الأسئلة البسيطة، تملؤها مرة واحدة فقط.')}</T>
              </>
            )}

            {step === 1 && (
              <>
                <T v="h1">{t('ما اسمك؟')}</T>
                <Field label={t('اسمك الكامل')} value={name} onChangeText={setName} placeholder={t('مثلاً سارة أحمد')} maxLength={60} />
                <View style={{ gap: 6 }}>
                  <Field label={t('اسم المستخدم')} value={username} editable={!locked} onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())}
                    autoCapitalize="none" autoCorrect={false} placeholder="sara.cs" style={{ textAlign: 'left', writingDirection: 'ltr' }} />
                  <Row gap={6}>
                    {locked ? <><Lock size={14} color={C.muted} /><T v="tiny" color={C.muted}>{t('يمكنك تغييره لاحقاً من تعديل الملف الشخصي.')}</T></>
                      : uState === 'checking' ? <><ActivityIndicator size="small" color={C.primary} /><T v="tiny" color={C.muted}>{t('جارٍ التحقق...')}</T></>
                      : uState === 'ok' ? <><Check size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('متاح ✓')}</T></>
                      : uState === 'taken' ? <><X size={14} color={C.danger} /><T v="tiny" color={C.danger}>{t('مأخوذ، جرّب غيره')}</T></>
                      : uState === 'bad' ? <T v="tiny" color={C.danger}>{t('من 3 إلى 24: حروف إنجليزية صغيرة، أرقام، . و _')}</T>
                      : <T v="tiny" color={C.muted}>{t('يجدك زملاؤك من خلاله في البحث.')}</T>}
                  </Row>
                </View>
              </>
            )}

            {step === 2 && staff && (
              <>
                <T v="h1">{t('أين تعمل؟')}</T>
                {profile?.title_verified && profile.academic_title
                  ? <Row gap={8}><TitleBadge title={profile.academic_title} verified size="md" label={profile.position_title} /><T v="small" color={C.muted}>{t('رتبتك من قائمة الجامعة الرسمية')}</T></Row>
                  : <T v="small" color={C.muted}>{t('تُحدَّد رتبتك (دكتور، عميد…) من قائمة الجامعة الرسمية أو بعد التوثيق، ولا تُكتب يدويًا.')}</T>}
                <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
                {!profile?.title_verified && <Field label={t('القسم أو الدائرة (اختياري)')} value={dept} onChangeText={setDept} placeholder={t('مثلاً قسم علم الحاسوب')} maxLength={80} />}
              </>
            )}

            {step === 2 && !staff && (
              <>
                <T v="h1">{t('ماذا تدرس؟')}</T>
                <T v="small" color={C.muted}>{found.major ? t('اخترناه من سجلات جامعتك. إذا لم يكن صحيحاً فغيّره.') : t('سنضيفك تلقائياً إلى مجموعة كليتك وتخصصك ودفعتك.')}</T>
                <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
                <Button kind="soft" title={teams === null ? t('استيراد مواد هذا الفصل من Teams') : teams > 0 ? t('تمت إضافة {0} مواد ✓', [teams]) : t('لم يتم العثور على مواد، يمكنك إضافتها لاحقًا')} loading={teamsBusy}
                  onPress={async () => { setTeamsBusy(true); const r = await importTeamsCourses(); setTeamsBusy(false); if ('count' in r) setTeams(r.count); else if (r.error !== 'cancelled' && r.error !== 'redirecting') { setTeams(0); Alert.alert(t('تعذّر ذلك'), t('يمكنك إضافة موادك من صفحة الجدول.')); } }} />
              </>
            )}

            {step === 3 && (
              <>
                <T v="h1">{t('عنك')}</T>
                {!staff && <View style={{ gap: 8 }}>
                  <T v="bold">{t('في أي سنة التحقت بالجامعة؟')}</T>
                  {found.year && <T v="small" color={C.muted}>{t('عرفناها من رقمك الجامعي.')}</T>}
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    {years.map((y) => <Chip key={y} label={String(y)} active={entry === y} onPress={() => setEntry(y)} />)}
                  </Row>
                  {entry && <Animated.View entering={FadeIn}><T v="small" color={C.primaryDark}>{t('أي أنك في السنة')} {studyYearFrom(entry)}{t('، وتُحدَّث تلقائياً كل سنة.')}</T></Animated.View>}
                </View>}
                <View style={{ gap: 8 }}>
                  <T v="bold">{t('تاريخ ميلادك (يبقى مخفياً، لك فقط)')}</T>
                  {Platform.OS !== 'ios' && <Button kind="soft" title={birth ? birth.toLocaleDateString(LOCALE) : t('اختر التاريخ')} onPress={() => setShowDate(true)} />}
                  {showDate && (
                    <DateTimePicker value={birth ?? new Date(2004, 0, 1)} mode="date" display={Platform.OS === 'ios' ? 'spinner' : 'default'} locale="ar"
                      maximumDate={new Date(new Date().getFullYear() - 15, 11, 31)} minimumDate={new Date(1960, 0, 1)}
                      onChange={(_, d) => { if (Platform.OS !== 'ios') setShowDate(false); if (d) setBirth(d); }} />
                  )}
                </View>
              </>
            )}

            {step === 4 && (
              <>
                <T v="h1">{t('حساباتك الأخرى')}</T>
                <T v="small" color={C.muted}>{t('اختياري. ستظهر أيقونة في ملفك الشخصي تفتح حسابك بضغطة، وأنت تختار من يراها من إعدادات الخصوصية.')}</T>
                <Row gap={10}>
                  <InstagramGlyph size={44} />
                  <View style={{ flex: 1 }}><Field label={t('إنستغرام')} value={ig} onChangeText={setIg} autoCapitalize="none" autoCorrect={false} placeholder={t('اسم المستخدم أو الرابط')} style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View>
                </Row>
                <Row gap={10}>
                  <SnapGlyph size={44} />
                  <View style={{ flex: 1 }}><Field label={t('سناب شات')} value={snap} onChangeText={setSnap} autoCapitalize="none" autoCorrect={false} placeholder={t('اسم المستخدم أو الرابط')} style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View>
                </Row>
                {handleFrom(ig, 'instagram') ? <Row gap={6}><AtSign size={13} color={C.muted} /><T v="tiny" color={C.muted} style={{ writingDirection: 'ltr' }}>instagram.com/{handleFrom(ig, 'instagram')}</T></Row> : null}
              </>
            )}
          </Animated.View>

          <View style={{ marginTop: 'auto', gap: 8 }}>
            <Button title={step === 4 ? t('انتهينا، لنبدأ') : t('التالي')} loading={saving} disabled={step === 0 && auto < 4}
              iconEnd icon={step < 4 ? <ChevronLeft size={18} color={C.white} style={flip} /> : <Check size={18} color={C.white} />} onPress={next} />
            {step === 4 && <T v="tiny" color={C.muted} style={{ textAlign: 'center', fontFamily: F.body }}>{t('يمكنك تعديل كل شيء لاحقاً، باستثناء اسم المستخدم.')}</T>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
