import { Image } from 'expo-image';
import { router } from 'expo-router';
import { AtSign, Camera, Check, Lock, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { MajorPicker } from '@/components/MajorPicker';
import { InstagramGlyph, SnapGlyph } from '@/components/SocialGlyphs';
import { Avatar, Button, Chip, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { handleFrom } from '@/lib/util';

const validHandle = (s: string) => /^[A-Za-z0-9._-]{1,30}$/.test(s);

export default function EditProfile() {
  const { profile, university, refreshProfile } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [ig, setIg] = useState('');
  const [snap, setSnap] = useState('');
  const [col, setCol] = useState<string | null>(null);
  const [maj, setMaj] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);   // saved URL
  const [preview, setPreview] = useState<string | null>(null); // local file shown immediately
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  // fill the form once the profile is loaded (the screen can open before it arrives)
  useEffect(() => {
    if (!profile || ready) return;
    setName(/^\d+$/.test(profile.full_name) ? '' : profile.full_name);
    setUsername(profile.username ?? ''); setBio(profile.bio ?? ''); setYear(profile.study_year ?? null);
    setIg(profile.instagram ?? ''); setSnap(profile.snapchat ?? '');
    setCol(profile.college_id); setMaj(profile.major_id); setAvatar(profile.avatar_url);
    setReady(true);
  }, [profile, ready]);

  async function setPhoto(url: string | null) {
    const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile?.id ?? '');
    if (error) throw error;
    setAvatar(url); await refreshProfile();
  }

  async function choose(camera: boolean) {
    const f = await pickMedia({ square: true, camera });
    if (!f) return;
    setPreview(f.uri); setUploading(true);
    try {
      const path = await uploadFile('avatars', profile?.id ?? '', f);
      await setPhoto(publicUrl('avatars', path));
    } catch (e) {
      setPreview(null);
      Alert.alert('ما زبط تغيير الصورة', e instanceof Error ? e.message : 'جرّب كمان مرة.');
    }
    setUploading(false);
  }

  function changePhoto() {
    const opts = ['اختار من الصور', 'صوّر هلأ', ...(avatar ? ['شيل الصورة'] : []), 'إلغاء'];
    const run = (i: number) => {
      if (opts[i] === 'اختار من الصور') choose(false);
      else if (opts[i] === 'صوّر هلأ') choose(true);
      else if (opts[i] === 'شيل الصورة') setPhoto(null).then(() => setPreview(null)).catch(() => Alert.alert('ما زبط', 'جرّب كمان مرة.'));
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: opts.length - 1, destructiveButtonIndex: avatar ? 2 : undefined, title: 'صورة البروفايل' }, run);
    else Alert.alert('صورة البروفايل', undefined, opts.map((o, i) => ({ text: o, style: o === 'إلغاء' ? 'cancel' : o === 'شيل الصورة' ? 'destructive' : 'default', onPress: () => run(i) })));
  }

  async function save() {
    if (!profile) return;
    const u = username.trim().replace(/^@+/, '').toLowerCase();
    const igH = handleFrom(ig, 'instagram'); const snH = handleFrom(snap, 'snapchat');
    if (name.trim().length < 2) { Alert.alert('اكتب اسمك'); return; }
    if (u && !/^[a-z0-9._]{3,24}$/.test(u)) { Alert.alert('اسم المستخدم', 'من 3 لـ 24 حرف إنجليزي أو أرقام أو . و _ (بدون مسافات).'); return; }
    if (u && !profile.username) {
      const { data: ok } = await supabase.rpc('username_available', { u });
      if (!ok) { Alert.alert('اسم المستخدم', 'هاد اليوزر مأخوذ، جرّب غيره.'); return; }
      const sure = await new Promise<boolean>((res) => Alert.alert('تثبيت اليوزر', `@${u}\nبعد الحفظ ما بتقدر تغيّره. متأكد؟`, [{ text: 'لا', style: 'cancel', onPress: () => res(false) }, { text: 'ثبّته', onPress: () => res(true) }]));
      if (!sure) return;
    }
    if (igH && !validHandle(igH)) { Alert.alert('إنستغرام', 'اكتب اسم المستخدم أو الصق رابط حسابك.'); return; }
    if (snH && !validHandle(snH)) { Alert.alert('سناب شات', 'اكتب اسم المستخدم أو الصق رابط حسابك.'); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(), ...(profile.username ? {} : { username: u || null }), bio: bio.trim().slice(0, 150), study_year: year,
      instagram: igH || null, snapchat: snH || null, college_id: col, major_id: maj,
    }).eq('id', profile.id);
    setSaving(false);
    if (error) {
      reportError(new Error(`profile save: ${error.code} ${error.message}`));
      Alert.alert('ما انحفظ', error.code === '23505' ? 'اسم المستخدم مأخوذ، جرّب غيره.' : error.message.includes('username_locked') ? 'اليوزر ثابت وما بيتغيّر.' : 'تأكد من الإنترنت وجرّب كمان مرة.');
      return;
    }
    await refreshProfile();
    if (router.canGoBack()) router.back(); else router.replace('/profile');
  }

  const shown = preview ?? avatar;
  const igH = handleFrom(ig, 'instagram');

  return (
    <Screen>
      <Header title="تعديل البروفايل" right={
        <Tap onPress={save} disabled={saving || uploading} accessibilityLabel="احفظ" style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: saving || uploading ? 0.5 : 1 }}>
          {saving ? <ActivityIndicator color={C.white} /> : <T v="bold" color={C.white}>احفظ</T>}
        </Tap>
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Tap onPress={changePhoto} disabled={uploading} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }} accessibilityLabel="غيّر الصورة">
            <View>
              {shown ? <Image source={{ uri: shown }} style={{ width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: C.white }} contentFit="cover" transition={150} />
                : <Avatar id={profile?.id} name={name || profile?.full_name} url={null} size={108} ring />}
              {uploading && <View style={{ position: 'absolute', inset: 0, borderRadius: 54, backgroundColor: 'rgba(14,20,48,0.45)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.white} /></View>}
              <View style={{ position: 'absolute', bottom: 2, left: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg }}>
                <Camera size={16} color={C.white} />
              </View>
            </View>
            <T v="bold" color={C.primary}>{uploading ? 'عم نرفع الصورة…' : shown ? 'غيّر الصورة' : 'حط صورة'}</T>
          </Tap>

          <Field label="الاسم" value={name} onChangeText={setName} maxLength={60} placeholder="اسمك الكامل" />
          <View style={{ gap: 4 }}>
            <Field label="اسم المستخدم" value={username} editable={!profile?.username} onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" autoCorrect={false} placeholder="مثلاً sara.cs" style={{ textAlign: 'left', writingDirection: 'ltr', opacity: profile?.username ? 0.6 : 1 }} />
            <Row gap={6}><Lock size={12} color={C.muted} /><T v="tiny" color={C.muted}>{profile?.username ? 'اليوزر ثابت وما بيتغيّر.' : 'بعد ما تحفظ اليوزر ما بيتغيّر.'}</T></Row>
          </View>
          <Field label="نبذة" value={bio} onChangeText={setBio} multiline maxLength={150} placeholder="إشي عنك بسطر" style={{ minHeight: 84, textAlignVertical: 'top', paddingTop: 12 }} />
          <T v="tiny" color={C.muted} style={{ marginTop: -10 }}>{bio.length}/150</T>

          <View style={{ gap: 8 }}>
            <T v="bold" style={{ fontSize: 14 }}>السنة الدراسية</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((y) => <Chip key={y} label={`سنة ${y}`} active={year === y} onPress={() => setYear(year === y ? null : y)} />)}
            </Row>
          </View>

          <View style={{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <T v="h3">حساباتك التانية</T>
            <T v="tiny" color={C.muted}>اكتب اسم المستخدم أو الصق رابط حسابك. بيطلع زر على بروفايلك بيفتح حسابك بكبسة، حسب «مين بيشوف حساباتي» بالخصوصية.</T>
            <Row gap={10}><InstagramGlyph size={40} /><View style={{ flex: 1 }}><Field label="إنستغرام" value={ig} onChangeText={setIg} autoCapitalize="none" autoCorrect={false} placeholder="username أو instagram.com/username" style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View></Row>
            {igH ? <Row gap={6}><AtSign size={13} color={C.muted} /><T v="tiny" color={C.muted} style={{ writingDirection: 'ltr' }}>instagram.com/{igH}</T></Row> : null}
            <Row gap={10}><SnapGlyph size={40} /><View style={{ flex: 1 }}><Field label="سناب شات" value={snap} onChangeText={setSnap} autoCapitalize="none" autoCorrect={false} placeholder="username أو الرابط" style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View></Row>
          </View>

          <View style={{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <T v="h3">الكلية والتخصص</T>
            <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
          </View>

          <Button title="احفظ التغييرات" icon={<Check size={18} color={C.white} />} onPress={save} loading={saving} disabled={uploading} />
          {avatar && <Button kind="ghost" title="شيل صورة البروفايل" icon={<Trash2 size={16} color={C.danger} />} onPress={() => setPhoto(null).then(() => setPreview(null))} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
