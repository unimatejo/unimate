import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { AtSign, BadgeCheck, Check, ChevronLeft, Lock, X } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInLeft, FadeOutRight, ZoomIn } from 'react-native-reanimated';

import { MajorPicker } from '@/components/MajorPicker';
import { InstagramGlyph, SnapGlyph } from '@/components/SocialGlyphs';
import { Avatar, Button, Card, Chip, Field, Row, Screen, T, Tap } from '@/components/ui';
import { importTeamsCourses, useAuth } from '@/lib/auth';
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

  useEffect(() => {
    if (!profile || ready) return;
    setName(/^\d+$/.test(profile.full_name ?? '') ? '' : profile.full_name ?? '');
    setUsername(profile.username ?? '');
    setCol(profile.college_id); setMaj(profile.major_id); setEntry(profile.entry_year ?? null);
    setIg(profile.instagram ?? ''); setSnap(profile.snapchat ?? '');
    supabase.from('profile_private').select('student_number, email, birth_date').eq('user_id', profile.id).single().then(({ data }) => {
      setPriv(data); if (data?.birth_date) setBirth(new Date(data.birth_date));
    });
    setReady(true);
  }, [profile, ready]);

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

  function next() {
    if (step === 1) {
      if (name.trim().length < 3) { Alert.alert(t('اكتب اسمك الكامل')); return; }
      if (!locked && uState !== 'ok') { Alert.alert(t('اسم المستخدم'), uState === 'taken' ? t('هاد اليوزر مأخوذ، جرّب غيره.') : t('اختار يوزر من 3 لـ 24 حرف إنجليزي صغير أو أرقام أو . و _')); return; }
    }
    if (step === 2 && !maj) { Alert.alert(t('اختار كليتك وتخصصك')); return; }
    if (step === 3 && !entry) { Alert.alert(t('اختار سنة دخولك للجامعة')); return; }
    if (step === 4) { finish(); return; }
    setStep(step + 1);
  }

  async function finish() {
    if (!profile) return;
    const igH = handleFrom(ig, 'instagram'); const snH = handleFrom(snap, 'snapchat');
    if (igH && !/^[A-Za-z0-9._]{1,30}$/.test(igH)) { Alert.alert(t('إنستغرام'), t('اكتب اليوزر أو الصق رابط حسابك.')); return; }
    if (snH && !/^[A-Za-z0-9._-]{1,30}$/.test(snH)) { Alert.alert(t('سناب شات'), t('اكتب اليوزر أو الصق رابط حسابك.')); return; }
    setSaving(true);
    const patch: Record<string, unknown> = {
      full_name: name.trim(), college_id: col, major_id: maj, entry_year: entry, study_year: studyYearFrom(entry),
      instagram: igH || null, snapchat: snH || null, onboarded: true,
    };
    if (!locked) patch.username = username.trim().toLowerCase();
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id);
    if (!error && birth) await supabase.rpc('set_birth_date', { d: birth.toISOString().slice(0, 10) });
    setSaving(false);
    if (error) {
      Alert.alert(t('ما انحفظ'), error.code === '23505' ? t('اليوزر انأخذ هلأ، اختار غيره.') : t('تأكد من الإنترنت وجرّب كمان مرة.'));
      if (error.code === '23505') setStep(1);
      return;
    }
    await refreshProfile();
    router.replace('/(tabs)');
  }

  const autoRows: [string, string | null | undefined][] = [
    [t('الجامعة'), nm(university)],
    [t('الإيميل الجامعي'), priv?.email],
    [t('الرقم الجامعي'), priv?.student_number ?? '—'],
    [t('التوثيق'), profile?.is_verified ? t('موثّق بمايكروسوفت') : t('بالإيميل')],
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
            {step > 0 ? <Tap onPress={() => setStep(step - 1)} style={{ minHeight: 36, justifyContent: 'center' }}><T v="bold" color={C.primary}>{t('رجوع')}</T></Tap> : <View />}
            <View style={{ flex: 1 }} />
            <T v="tiny" color={C.muted}>{t('{0} من {1}', [step + 1, STEPS.length])}</T>
          </Row>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 22, gap: 18 }}>
          <Animated.View key={step} entering={FadeInLeft.springify().damping(18)} exiting={FadeOutRight} style={{ gap: 18 }}>
            {step === 0 && (
              <>
                <View style={{ alignItems: 'center', gap: 12 }}>
                  <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={92} ring />
                  <Row gap={6}>
                    <T v="h1" style={{ textAlign: 'center' }}>{t('أهلاً فيك')}</T>
                    {profile?.is_verified && <Animated.View entering={ZoomIn.delay(600)}><BadgeCheck size={26} color={C.white} fill={C.primary} /></Animated.View>}
                  </Row>
                  <T v="body" color={C.muted} style={{ textAlign: 'center' }}>{t('هاي معلوماتك من حسابك الجامعي، انعبّت لحالها.')}</T>
                </View>
                <Card pad={6} style={{ paddingHorizontal: 16 }}>
                  {autoRows.map(([k, v], i) => (
                    <Row key={k} gap={12} style={{ minHeight: 56 }}>
                      {i < auto ? (
                        <Animated.View entering={ZoomIn.springify()} style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                          <Check size={16} color={C.white} strokeWidth={3} />
                        </Animated.View>
                      ) : <ActivityIndicator color={C.primary} style={{ width: 28 }} />}
                      <T v="small" color={C.muted} style={{ flex: 1 }}>{k}</T>
                      {i < auto && <Animated.View entering={FadeIn} style={{ flexShrink: 1 }}><T v="bold" numberOfLines={1} style={{ writingDirection: k === t('الإيميل الجامعي') ? 'ltr' : 'rtl' }}>{v ?? '...'}</T></Animated.View>}
                    </Row>
                  ))}
                </Card>
                <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('ضل كم سؤال بسيط، بتعبيهم مرة وحدة بس.')}</T>
              </>
            )}

            {step === 1 && (
              <>
                <T v="h1">{t('شو اسمك؟')}</T>
                <Field label={t('اسمك الكامل')} value={name} onChangeText={setName} placeholder={t('مثلاً سارة أحمد')} maxLength={60} />
                <View style={{ gap: 6 }}>
                  <Field label={t('اسم المستخدم (اليوزر)')} value={username} editable={!locked} onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())}
                    autoCapitalize="none" autoCorrect={false} placeholder="sara.cs" style={{ textAlign: 'left', writingDirection: 'ltr' }} />
                  <Row gap={6}>
                    {locked ? <><Lock size={14} color={C.muted} /><T v="tiny" color={C.muted}>{t('اليوزر ثابت وما بيتغيّر.')}</T></>
                      : uState === 'checking' ? <><ActivityIndicator size="small" color={C.primary} /><T v="tiny" color={C.muted}>{t('عم نتأكد...')}</T></>
                      : uState === 'ok' ? <><Check size={14} color={C.greenInk} /><T v="tiny" color={C.greenInk}>{t('متاح ✓ (بس انتبه: بعد ما تحفظه ما بيتغيّر)')}</T></>
                      : uState === 'taken' ? <><X size={14} color={C.danger} /><T v="tiny" color={C.danger}>{t('مأخوذ، جرّب غيره')}</T></>
                      : uState === 'bad' ? <T v="tiny" color={C.danger}>{t('من 3 لـ 24: حروف إنجليزي صغيرة، أرقام، . و _')}</T>
                      : <T v="tiny" color={C.muted}>{t('زملاءك بيلاقوك فيه بالبحث.')}</T>}
                  </Row>
                </View>
              </>
            )}

            {step === 2 && (
              <>
                <T v="h1">{t('شو بتدرس؟')}</T>
                <T v="small" color={C.muted}>{t('بنضيفك تلقائياً لجروب كليتك وتخصصك ودفعتك.')}</T>
                <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
                <Button kind="soft" title={teams === null ? t('جيب موادي هالفصل من Teams') : teams > 0 ? t('انضافت {0} مواد ✓', [teams]) : t('ما لقينا مواد، بتضيفها بعدين')} loading={teamsBusy}
                  onPress={async () => { setTeamsBusy(true); const r = await importTeamsCourses(); setTeamsBusy(false); if ('count' in r) setTeams(r.count); else if (r.error !== 'cancelled') { setTeams(0); Alert.alert(t('ما زبط'), t('بتقدر تضيف موادك من صفحة الجدول.')); } }} />
              </>
            )}

            {step === 3 && (
              <>
                <T v="h1">{t('عنك')}</T>
                <View style={{ gap: 8 }}>
                  <T v="bold">{t('أي سنة دخلت الجامعة؟')}</T>
                  <Row gap={8} style={{ flexWrap: 'wrap' }}>
                    {years.map((y) => <Chip key={y} label={String(y)} active={entry === y} onPress={() => setEntry(y)} />)}
                  </Row>
                  {entry && <Animated.View entering={FadeIn}><T v="small" color={C.primary}>{t('يعني إنت سنة')} {studyYearFrom(entry)}{t('، وبتتحدث لحالها كل سنة.')}</T></Animated.View>}
                </View>
                <View style={{ gap: 8 }}>
                  <T v="bold">{t('تاريخ ميلادك (بيضل مخفي، بس إلك)')}</T>
                  {Platform.OS !== 'ios' && <Button kind="soft" title={birth ? birth.toLocaleDateString(LOCALE) : t('اختار التاريخ')} onPress={() => setShowDate(true)} />}
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
                <T v="h1">{t('حساباتك الثانية')}</T>
                <T v="small" color={C.muted}>{t('اختياري. بتطلع أيقونة على بروفايلك بتفتح حسابك بكبسة، وانت بتختار مين بيشوفها من الخصوصية.')}</T>
                <Row gap={10}>
                  <InstagramGlyph size={44} />
                  <View style={{ flex: 1 }}><Field label={t('إنستغرام')} value={ig} onChangeText={setIg} autoCapitalize="none" autoCorrect={false} placeholder={t('اليوزر أو الرابط')} style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View>
                </Row>
                <Row gap={10}>
                  <SnapGlyph size={44} />
                  <View style={{ flex: 1 }}><Field label={t('سناب شات')} value={snap} onChangeText={setSnap} autoCapitalize="none" autoCorrect={false} placeholder={t('اليوزر أو الرابط')} style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View>
                </Row>
                {handleFrom(ig, 'instagram') ? <Row gap={6}><AtSign size={13} color={C.muted} /><T v="tiny" color={C.muted} style={{ writingDirection: 'ltr' }}>instagram.com/{handleFrom(ig, 'instagram')}</T></Row> : null}
              </>
            )}
          </Animated.View>

          <View style={{ marginTop: 'auto', gap: 8 }}>
            <Button title={step === 4 ? t('خلصنا، يلا نبلش') : t('التالي')} loading={saving} disabled={step === 0 && auto < 4}
              iconEnd icon={step < 4 ? <ChevronLeft size={18} color={C.white} style={flip} /> : <Check size={18} color={C.white} />} onPress={next} />
            {step === 4 && <T v="tiny" color={C.muted} style={{ textAlign: 'center', fontFamily: F.body }}>{t('بتقدر تعدّل كل إشي بعدين، إلا اليوزر.')}</T>}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
