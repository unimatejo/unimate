import { router } from 'expo-router';
import { Check, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { MajorPicker } from '@/components/MajorPicker';
import { Avatar, Button, Card, Field, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

export default function Welcome() {
  const { profile, university, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [courses, setCourses] = useState<number | null>(null);
  const [studentNo, setStudentNo] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [col, setCol] = useState<string | null>(null);
  const [maj, setMaj] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);
  useEffect(() => {
    if (!profile) return;
    supabase.from('enrollments').select('section_id', { count: 'exact', head: true }).eq('user_id', (profile?.id ?? ''))
      .then(({ count }) => setCourses(count ?? 0));
    supabase.from('profile_private').select('student_number').eq('user_id', (profile?.id ?? '')).single()
      .then(({ data }) => setStudentNo(data?.student_number ?? null));
  }, [profile]);
  useEffect(() => {
    if (!profile) return;
    setName((n) => n || (/^\d+$/.test(profile.full_name ?? '') ? '' : profile.full_name ?? ''));
    setCol((c) => c ?? profile.college_id); setMaj((m) => m ?? profile.major_id);
  }, [profile]);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s >= 5 ? s : s + 1)), 600);
    return () => clearInterval(t);
  }, []);

  const rows: [string, string | null | undefined][] = [
    ['الجامعة', university?.name_ar],
    ['الرقم الجامعي', studentNo ?? 'من إيميلك'],
    ['الكلية', profile?.college?.name_ar ?? 'بتختارها بالبروفايل'],
    ['التخصص', profile?.major?.name_ar ?? 'بتختاره بالبروفايل'],
    ['موادك هالفصل', courses === null ? null : courses > 0 ? `${courses} مواد` : 'بتنضاف من حسابك الجامعي'],
  ];
  const done = step >= 5;
  const needsSetup = !!profile && !saved && (/^\d+$/.test(profile.full_name ?? '') || !profile.major_id);
  const first = needsSetup ? '' : (profile?.full_name?.split(' ')[0] ?? '');

  async function save() {
    if (name.trim().length < 3) { Alert.alert('اكتب اسمك الكامل'); return; }
    if (!maj) {
      const { count } = await supabase.from('colleges').select('id', { count: 'exact', head: true }).eq('university_id', university?.id ?? '');
      if (count) { Alert.alert('اختار كليتك وتخصصك'); return; }
    }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ full_name: name.trim(), college_id: col, major_id: maj }).eq('id', (profile?.id ?? ''));
    setSaving(false);
    if (error) { Alert.alert('ما زبط الحفظ', 'جرّب كمان مرة.'); return; }
    await refreshProfile(); setSaved(true);
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, padding: 22, paddingTop: 40, gap: 22 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={92} ring />
          <T v="h1" style={{ textAlign: 'center' }}>{done ? `أهلاً ${first}، حسابك جاهز` : 'بنجهّز حسابك...'}</T>
          <T v="body" color={C.muted} style={{ textAlign: 'center' }}>بنجيب معلوماتك من حسابك الجامعي. ما بتحتاج تعبّي ولا إشي.</T>
        </View>
        <Card pad={6} style={{ paddingHorizontal: 16 }}>
          {rows.map(([k, v], i) => (
            <Row key={k} gap={12} style={{ minHeight: 56 }}>
              {i < step ? (
                <Animated.View entering={ZoomIn.springify()} style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={16} color={C.white} strokeWidth={3} />
                </Animated.View>
              ) : i === step ? <ActivityIndicator color={C.primary} style={{ width: 28 }} /> : <View style={{ width: 28, height: 28, borderRadius: 10, backgroundColor: '#EEF0F6' }} />}
              <T v="small" color={C.muted} style={{ flex: 1 }}>{k}</T>
              {i < step && <Animated.View entering={FadeIn}><T v="bold">{v ?? '...'}</T></Animated.View>}
            </Row>
          ))}
        </Card>
        {done && needsSetup && (
          <Animated.View entering={FadeIn.duration(400)}>
            <Card style={{ gap: 12 }}>
              <T v="h3">خطوة أخيرة</T>
              <Field label="اسمك الكامل" value={name} onChangeText={setName} placeholder="مثلاً سارة أحمد" maxLength={60} />
              <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
              <Button title="احفظ" loading={saving} onPress={save} />
            </Card>
          </Animated.View>
        )}
        {done && !needsSetup && (
          <Animated.View entering={FadeIn.duration(400)}>
            <Row gap={10} center={false} style={{ backgroundColor: C.greenSoft, borderRadius: 18, padding: 14 }}>
              <Users size={20} color={C.greenInk} />
              <T v="small" color={C.greenInk} style={{ flex: 1 }}>انضميت لمجتمع {university?.name_ar} ولجروب كل مادة من موادك.</T>
            </Row>
          </Animated.View>
        )}
        <View style={{ marginTop: 'auto', gap: 8 }}>
          <Button title="يلا نبلش" disabled={!done || needsSetup} onPress={() => router.replace('/(tabs)')} />
          <Button kind="ghost" title="ضيف صورة ونبذة (اختياري)" onPress={() => router.push('/settings/edit-profile')} style={{ minHeight: 44 }} />
        </View>
      </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
