import { router } from 'expo-router';
import { Check, Users } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { Avatar, Button, Card, Row, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

export default function Welcome() {
  const { profile, university, refreshProfile } = useAuth();
  const [step, setStep] = useState(0);
  const [courses, setCourses] = useState<number | null>(null);
  const [studentNo, setStudentNo] = useState<string | null>(null);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);
  useEffect(() => {
    if (!profile) return;
    supabase.from('enrollments').select('section_id', { count: 'exact', head: true }).eq('user_id', profile.id)
      .then(({ count }) => setCourses(count ?? 0));
    supabase.from('profile_private').select('student_number').eq('user_id', profile.id).single()
      .then(({ data }) => setStudentNo(data?.student_number ?? null));
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
  const first = profile?.full_name?.split(' ')[0] ?? '';

  return (
    <Screen>
      <View style={{ flex: 1, padding: 22, paddingTop: 40, gap: 22 }}>
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
        {done && (
          <Animated.View entering={FadeIn.duration(400)}>
            <Row gap={10} center={false} style={{ backgroundColor: C.greenSoft, borderRadius: 18, padding: 14 }}>
              <Users size={20} color={C.greenInk} />
              <T v="small" color={C.greenInk} style={{ flex: 1 }}>انضميت لمجتمع {university?.name_ar} ولجروب كل مادة من موادك.</T>
            </Row>
          </Animated.View>
        )}
        <View style={{ marginTop: 'auto', gap: 8 }}>
          <Button title="يلا نبلش" disabled={!done} onPress={() => router.replace('/(tabs)')} />
          <Button kind="ghost" title="ضيف صورة ونبذة (اختياري)" onPress={() => router.push('/settings/edit-profile')} style={{ minHeight: 44 }} />
        </View>
      </View>
    </Screen>
  );
}
