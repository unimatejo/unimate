import { Image } from 'expo-image';
import { router } from 'expo-router';
import { AtSign, Camera, Check, Lock, Trash2 } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { MajorPicker } from '@/components/MajorPicker';
import { InstagramGlyph, SnapGlyph } from '@/components/SocialGlyphs';
import { Avatar, Button, Chip, Field, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { AvatarCropper } from '@/components/AvatarCropper';
import { pickMedia, publicUrl, uploadFile } from '@/lib/upload';
import { handleFrom } from '@/lib/util';
import { t } from '@/lib/i18n';

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
  const [cooldown, setCooldown] = useState(0);
  const [birth, setBirth] = useState<Date | null>(null);
  const [birthWas, setBirthWas] = useState<string | null>(null);
  const [showBirth, setShowBirth] = useState<'none' | 'year' | 'full'>('year');
  useEffect(() => {
    if (!profile) return;
    setShowBirth((profile.show_birth as 'none' | 'year' | 'full') ?? 'year');
    supabase.from('profile_private').select('birth_date').eq('user_id', profile.id).maybeSingle().then(({ data }) => {
      if (data?.birth_date) { setBirth(new Date(`${data.birth_date}T12:00:00`)); setBirthWas(data.birth_date); }
    }, () => {});
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { supabase.rpc('username_cooldown_days').then(({ data }) => setCooldown(Number(data) || 0), () => {}); }, []);
  const lockedDays = cooldown > 0 && profile?.username && profile.username_changed_at
    ? Math.max(0, Math.ceil((new Date(profile.username_changed_at).getTime() + cooldown * 86400000 - Date.now()) / 86400000)) : 0;

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

  // pick a photo, then crop it ourselves (drag + pinch under a circle) like Instagram
  const [cropSrc, setCropSrc] = useState<{ uri: string; width: number; height: number } | null>(null);
  async function choose(camera: boolean) {
    const f = await pickMedia({ camera, maxWidth: 1600 });
    if (!f) return;
    setCropSrc({ uri: f.uri, width: f.width ?? 1000, height: f.height ?? 1000 });
  }
  async function cropped(f: { uri: string; mime: string }) {
    setCropSrc(null);
    setPreview(f.uri); setUploading(true);
    try {
      const path = await uploadFile('avatars', profile?.id ?? '', f);
      await setPhoto(publicUrl('avatars', path));
    } catch (e) {
      setPreview(null);
      Alert.alert(t('ما زبط تغيير الصورة'), e instanceof Error ? e.message : t('جرّب كمان مرة.'));
    }
    setUploading(false);
  }

  function changePhoto() {
    const opts = [t('اختار من الصور'), t('صوّر هلأ'), ...(avatar ? [t('شيل الصورة')] : []), t('إلغاء')];
    const run = (i: number) => {
      if (opts[i] === t('اختار من الصور')) choose(false);
      else if (opts[i] === t('صوّر هلأ')) choose(true);
      else if (opts[i] === t('شيل الصورة')) setPhoto(null).then(() => setPreview(null)).catch(() => Alert.alert(t('ما زبط'), t('جرّب كمان مرة.')));
    };
    if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: opts.length - 1, destructiveButtonIndex: avatar ? 2 : undefined, title: t('صورة البروفايل') }, run);
    else Alert.alert(t('صورة البروفايل'), undefined, opts.map((o, i) => ({ text: o, style: o === t('إلغاء') ? 'cancel' : o === t('شيل الصورة') ? 'destructive' : 'default', onPress: () => run(i) })));
  }

  async function save() {
    if (!profile) return;
    const u = username.trim().replace(/^@+/, '').toLowerCase();
    const igH = handleFrom(ig, 'instagram'); const snH = handleFrom(snap, 'snapchat');
    if (name.trim().length < 2) { Alert.alert(t('اكتب اسمك')); return; }
    if (u && !/^[a-z0-9._]{3,24}$/.test(u)) { Alert.alert(t('اسم المستخدم'), t('من 3 لـ 24 حرف إنجليزي أو أرقام أو . و _ (بدون مسافات).')); return; }
    if (profile.username && !u) { Alert.alert(t('اسم المستخدم'), t('لازم يكون عندك يوزر.')); return; }
    const changingUser = !!u && u !== (profile.username ?? '').toLowerCase();
    if (changingUser) {
      if (lockedDays > 0) { Alert.alert(t('اسم المستخدم'), t('بتقدر تغيّر اليوزر بعد {0} يوم.', [lockedDays])); return; }
      const { data: ok } = await supabase.rpc('username_available', { u });
      if (!ok) { Alert.alert(t('اسم المستخدم'), t('هاد اليوزر مأخوذ، جرّب غيره.')); return; }
      if (cooldown > 0) {
        const sure = await new Promise<boolean>((res) => Alert.alert(t('تغيير اليوزر'), t('@{0}\nبعدها ما بتقدر تغيّره لمدة {1} يوم. متأكد؟', [u, cooldown]), [{ text: t('لا'), style: 'cancel', onPress: () => res(false) }, { text: t('غيّره'), onPress: () => res(true) }]));
        if (!sure) return;
      }
    }
    if (igH && !validHandle(igH)) { Alert.alert(t('إنستغرام'), t('اكتب اسم المستخدم أو الصق رابط حسابك.')); return; }
    if (snH && !validHandle(snH)) { Alert.alert(t('سناب شات'), t('اكتب اسم المستخدم أو الصق رابط حسابك.')); return; }
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: name.trim(), ...(changingUser ? { username: u } : {}), bio: bio.trim().slice(0, 150), study_year: year,
      instagram: igH || null, snapchat: snH || null, college_id: col, major_id: maj,
    }).eq('id', profile.id);
    setSaving(false);
    if (error) {
      reportError(new Error(`profile save: ${error.code} ${error.message}`));
      Alert.alert(t('ما انحفظ'), error.code === '23505' ? t('اسم المستخدم مأخوذ، جرّب غيره.') : error.message.includes('username_cooldown') ? t('بتقدر تغيّر اليوزر بعد {0} يوم.', [error.message.match(/username_cooldown:(\d+)/)?.[1] ?? cooldown]) : t('تأكد من الإنترنت وجرّب كمان مرة.'));
      return;
    }
    // birthday: the date stays private; what shows on the profile follows the choice
    const bd = birth ? `${birth.getFullYear()}-${String(birth.getMonth() + 1).padStart(2, '0')}-${String(birth.getDate()).padStart(2, '0')}` : null;
    if (bd && bd !== birthWas) await supabase.rpc('set_birth_date', { d: bd });
    if (showBirth !== (profile.show_birth ?? 'year') || (bd && bd !== birthWas)) await supabase.rpc('set_birth_visibility', { v: showBirth });
    await refreshProfile();
    if (router.canGoBack()) router.back(); else router.replace('/profile');
  }

  const shown = preview ?? avatar;
  const igH = handleFrom(ig, 'instagram');

  return (
    <Screen>
      <AvatarCropper src={cropSrc} onCancel={() => setCropSrc(null)} onDone={cropped} />
      <Header title={t('تعديل البروفايل')} right={
        <Tap onPress={save} disabled={saving || uploading} accessibilityLabel={t('احفظ')} style={{ minHeight: 40, paddingHorizontal: 14, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', opacity: saving || uploading ? 0.5 : 1 }}>
          {saving ? <ActivityIndicator color={C.onPrimary} /> : <T v="bold" color={C.onPrimary}>{t('احفظ')}</T>}
        </Tap>
      } />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 18, gap: 16, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <Tap onPress={changePhoto} disabled={uploading} style={{ alignSelf: 'center', alignItems: 'center', gap: 8 }} accessibilityLabel={t('غيّر الصورة')}>
            <View>
              {shown ? <Image source={{ uri: shown }} style={{ width: 108, height: 108, borderRadius: 54, borderWidth: 3, borderColor: C.white }} contentFit="cover" transition={150} />
                : <Avatar id={profile?.id} name={name || profile?.full_name} url={null} size={108} ring />}
              {uploading && <View style={{ position: 'absolute', inset: 0, borderRadius: 54, backgroundColor: 'rgba(14,20,48,0.45)', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={C.white} /></View>}
              <View style={{ position: 'absolute', bottom: 2, left: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: C.bg }}>
                <Camera size={16} color={C.onPrimary} />
              </View>
            </View>
            <T v="bold" color={C.primaryDark}>{uploading ? t('عم نرفع الصورة…') : shown ? t('غيّر الصورة') : t('حط صورة')}</T>
          </Tap>

          <Field label={t('الاسم')} value={name} onChangeText={setName} maxLength={60} placeholder={t('اسمك الكامل')} />
          <View style={{ gap: 4 }}>
            <Field label={t('اسم المستخدم')} value={username} editable={lockedDays === 0} onChangeText={(t) => setUsername(t.replace(/\s/g, '').toLowerCase())} autoCapitalize="none" autoCorrect={false} placeholder={t('مثلاً sara.cs')} style={{ textAlign: 'left', writingDirection: 'ltr', opacity: lockedDays > 0 ? 0.6 : 1 }} />
            <Row gap={6}><Lock size={12} color={C.muted} /><T v="tiny" color={C.muted}>{lockedDays > 0 ? t('بتقدر تغيّر اليوزر بعد {0} يوم.', [lockedDays]) : cooldown > 0 ? t('بتقدر تغيّر اليوزر مرة كل {0} يوم.', [cooldown]) : t('بتقدر تغيّر اليوزر متى ما بدك.')}</T></Row>
          </View>
          <Field label={t('نبذة')} value={bio} onChangeText={setBio} multiline maxLength={150} placeholder={t('إشي عنك بسطر')} style={{ minHeight: 84, textAlignVertical: 'top', paddingTop: 12 }} />
          <T v="tiny" color={C.muted} style={{ marginTop: -10 }}>{bio.length}/150</T>

          <View style={{ gap: 8 }}>
            <T v="bold" style={{ fontSize: 14 }}>{t('السنة الدراسية')}</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              {[1, 2, 3, 4, 5, 6].map((y) => <Chip key={y} label={t('سنة {0}', [y])} active={year === y} onPress={() => setYear(year === y ? null : y)} />)}
            </Row>
          </View>

          <View style={{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <T v="h3">{t('تاريخ الميلاد')} 🎂</T>
            <DateField value={birth} onChange={setBirth} max={new Date(new Date().getFullYear() - 14, 11, 31)} />
            <T v="small" color={C.ink2}>{t('شو بيبيّن على بروفايلك؟')}</T>
            <Row gap={8} style={{ flexWrap: 'wrap' }}>
              <Chip label={t('السنة بس (مواليد {0})', [birth ? String(birth.getFullYear()) : '…'])} active={showBirth === 'year'} onPress={() => setShowBirth('year')} />
              <Chip label={t('التاريخ كامل')} active={showBirth === 'full'} onPress={() => setShowBirth('full')} />
              <Chip label={t('ولا إشي')} active={showBirth === 'none'} onPress={() => setShowBirth('none')} />
            </Row>
            <T v="tiny" color={C.muted}>{t('بيومك بيطلع على بروفايلك إنه عيد ميلادك، إذا اخترت التاريخ كامل.')}</T>
          </View>

          <View style={{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <T v="h3">{t('حساباتك التانية')}</T>
            <T v="tiny" color={C.muted}>{t('اكتب اسم المستخدم أو الصق رابط حسابك. بيطلع زر على بروفايلك بيفتح حسابك بكبسة، حسب «مين بيشوف حساباتي» بالخصوصية.')}</T>
            <Row gap={10}><InstagramGlyph size={40} /><View style={{ flex: 1 }}><Field label={t('إنستغرام')} value={ig} onChangeText={setIg} autoCapitalize="none" autoCorrect={false} placeholder={t('username أو instagram.com/username')} style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View></Row>
            {igH ? <Row gap={6}><AtSign size={13} color={C.muted} /><T v="tiny" color={C.muted} style={{ writingDirection: 'ltr' }}>instagram.com/{igH}</T></Row> : null}
            <Row gap={10}><SnapGlyph size={40} /><View style={{ flex: 1 }}><Field label={t('سناب شات')} value={snap} onChangeText={setSnap} autoCapitalize="none" autoCorrect={false} placeholder={t('username أو الرابط')} style={{ textAlign: 'left', writingDirection: 'ltr' }} /></View></Row>
          </View>

          <View style={{ gap: 10, backgroundColor: C.card, borderRadius: 22, padding: 14 }}>
            <T v="h3">{t('الكلية والتخصص')}</T>
            <MajorPicker universityId={university?.id} collegeId={col} majorId={maj} onChange={(c, m) => { setCol(c); setMaj(m); }} />
          </View>

          <Button title={t('احفظ التغييرات')} icon={<Check size={18} color={C.white} />} onPress={save} loading={saving} disabled={uploading} />
          {avatar && <Button kind="ghost" title={t('شيل صورة البروفايل')} icon={<Trash2 size={16} color={C.danger} />} onPress={() => setPhoto(null).then(() => setPreview(null))} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
