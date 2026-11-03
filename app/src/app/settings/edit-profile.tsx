import { Camera } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { MajorPicker } from '@/components/MajorPicker';
import { Avatar, Button, Chip, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { pickMedia, uploadFile } from '@/lib/upload';

const clean = (s: string) => s.trim().replace(/^@/, '').replace(/^https?:\/\/(www\.)?(instagram\.com|snapchat\.com\/add)\//i, '').replace(/\/$/, '');

export default function EditProfile() {
  const { profile, university, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [username, setUsername] = useState(profile?.username ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [year, setYear] = useState<number | null>(profile?.study_year ?? null);
  const [ig, setIg] = useState(profile?.instagram ?? '');
  const [snap, setSnap] = useState(profile?.snapchat ?? '');
  const [avatar, setAvatar] = useState(profile?.avatar_url ?? null);
  const [busy, setBusy] = useState(false);
  const [col, setCol] = useState<string | null>(profile?.college_id ?? null);
  const [maj, setMaj] = useState<string | null>(profile?.major_id ?? null);

  async function changePhoto() {
    const f = await pickMedia();
    if (!f || !profile) return;
    setBusy(true);
    try {
      const path = await uploadFile('avatars', profile.id, f);
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      setAvatar(data.publicUrl);
    } catch { Alert.alert('ما زبط رفع الصورة'); }
    setBusy(false);
  }

  async function save() {
    if (!profile) return;
    const u = username.trim().toLowerCase();
    if (u && !/^[a-z0-9._]{3,24}$/.test(u)) { Alert.alert('اسم المستخدم', 'من 3 لـ 24 حرف إنجليزي صغير أو أرقام أو . و _'); return; }
    if (name.trim().length < 2) { Alert.alert('الاسم قصير'); return; }
    setBusy(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(), username: u || null, bio: bio.trim().slice(0, 150), study_year: year,
      instagram: clean(ig) || null, snapchat: clean(snap) || null, avatar_url: avatar, college_id: col, major_id: maj,
    }).eq('id', profile.id);
    setBusy(false);
    if (error) { Alert.alert('ما زبط', error.code === '23505' ? 'اسم المستخدم مأخوذ، جرّب غيره.' : 'جرّب كمان مرة.'); return; }
    await refreshProfile();
    Alert.alert('انحفظ ✓');
  }

  return (
    <Screen>
      <Header title="تعديل البروفايل" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Tap onPress={changePhoto} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }} accessibilityLabel="غيّر الصورة">
            <View>
              <Avatar id={profile?.id} name={name} url={avatar} size={104} ring />
              <View style={{ position: 'absolute', bottom: 2, left: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg }}>
                <Camera size={16} color={C.white} />
              </View>
            </View>
            <T v="bold" color={C.primary}>غيّر الصورة</T>
          </Tap>

          <Field label="الاسم" value={name} onChangeText={setName} maxLength={60} />
          <Field label="اسم المستخدم" value={username} onChangeText={setUsername} autoCapitalize="none" placeholder="مثلاً sara.cs" style={{ textAlign: 'left' }} />
          <Field label="نبذة" value={bio} onChangeText={setBio} multiline maxLength={150} placeholder="إشي عنك بسطر" style={{ minHeight: 84, textAlignVertical: 'top', paddingTop: 12 }} />
          <T v="tiny" color={C.muted} style={{ marginTop: -10 }}>{bio.length}/150</T>

          <View style={{ gap: 8 }}>
            <T v="bold" style={{ fontSize: 14 }}>السنة الدراسية</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((y) => <Chip key={y} label={`سنة ${y}`} active={year === y} onPress={() => setYear(year === y ? null : y)} />)}
            </Row>
          </View>

          <View style={{ gap: 10, backgroundColor: C.white, borderRadius: 22, padding: 14 }}>
            <T v="h3">حساباتك التانية</T>
            <T v="tiny" color={C.muted}>بتبيّن على بروفايلك حسب إعداد «مين بيشوف حساباتي» بالخصوصية.</T>
            <Field label="إنستغرام" value={ig} onChangeText={setIg} autoCapitalize="none" placeholder="username" style={{ textAlign: 'left' }} />
            <Field label="سناب شات" value={snap} onChangeText={setSnap} autoCapitalize="none" placeholder="username" style={{ textAlign: 'left' }} />
          </View>

          <View style={{ gap: 10, backgroundColor: C.white, borderRadius: 22, padding: 14 }}>
            <T v="h3">الكلية والتخصص</T>
            <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
          </View>

          <Button title="احفظ" onPress={save} loading={busy} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
