import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  BadgeCheck, Ban, Bell, KeyRound, Palette, Search, Bookmark, ChevronLeft, CircleHelp, EyeOff, FileText, Lock, LogOut, MessageCircle, Shield, Star, Trash2, UserPen, UserPlus, Users, Info, ShieldCheck, GraduationCap } from 'lucide-react-native';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, ScrollView, TextInput, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { titleLabel } from '@/components/TitleBadge';
import { Avatar, Header, IconTile, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { inviteFriends } from '@/lib/invite';
import { run } from '@/lib/run';
import { C, F, isDark, shadow, themePref } from '@/lib/theme';
import { normalize } from '@/lib/util';
import { flip, isAR, nm, t, ta } from '@/lib/i18n';

function Group({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeIn.delay(delay).duration(220)} style={{ gap: 8 }}>
      <T v="small" color={C.muted} style={{ paddingHorizontal: 6 }}>{title}</T>
      {/* shadow on the outer box, clipping on the inner one (iOS drops shadows on clipped views) */}
      <View style={[{ borderRadius: 22, backgroundColor: C.card }, shadow]}><View style={{ borderRadius: 22, overflow: 'hidden' }}>{children}</View></View>
    </Animated.View>
  );
}

function Item({ icon, color, label, value, onPress, danger }: { icon: ReactNode; color: string; label: string; value?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap scale={0.985} haptic={false} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
      <IconTile color={color}>{icon}</IconTile>
      <T v="bodyMd" color={danger ? C.red : C.ink} style={{ flex: 1 }}>{label}</T>
      {value ? <T v="small" color={C.muted}>{value}</T> : null}
      <ChevronLeft size={18} color={C.faint} style={flip} />
    </Tap>
  );
}

const ic = { size: 19, color: C.white };

export default function Settings() {
  const { profile, university, signOut } = useAuth();
  const [q, setQ] = useState('');
  // the owner / moderators get the admin panel right here, signed in already
  const [admin, setAdmin] = useState(false);
  useEffect(() => { supabase.rpc('is_admin').then(({ data }) => setAdmin(data === true), () => {}); }, []);
  const openAdmin = () => router.push('/admin');

  function logout() {
    Alert.alert(t('تسجيل الخروج'), t('أكيد بدك تطلع من حسابك؟'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('اطلع'), style: 'destructive', onPress: async () => { try { await signOut(); } finally { router.replace('/(auth)/login'); } } },
    ]);
  }

  // two steps on purpose: "log out" sits right above this, and a slip used to wipe the account
  function deleteAccount() {
    Alert.alert(t('حذف الحساب؟'), t('هاد مش تسجيل خروج. إذا بدك تطلع بس، اختار «تسجيل الخروج».'), [
      { text: t('تراجع'), style: 'cancel' },
      { text: t('سجّل خروج بس'), onPress: logout },
      { text: t('كمّل للحذف'), style: 'destructive', onPress: confirmDelete },
    ]);
  }
  function confirmDelete() {
    Alert.alert(t('متأكد بدك تحذف حسابك؟'), t('بنحذف حسابك ومنشوراتك وقصصك ومتابعاتك بعد 30 يوم. إذا سجلت دخول قبلها، بيرجع كل إشي زي ما هو.'), [
      { text: t('تراجع'), style: 'cancel' },
      { text: t('احذف حسابي'), style: 'destructive', onPress: async () => {
        const r = await run(supabase.rpc('delete_my_account'), { msg: t('ما زبط حذف الحساب، جرّب كمان مرة.') });
        if (!r.ok) return;
        await signOut();
        router.replace('/(auth)/login');
        Alert.alert(t('رح ينحذف حسابك بعد 30 يوم'), t('إذا غيّرت رأيك، بس سجّل دخول قبلها وبيرجع كل إشي.'));
      } },
    ]);
  }

  type It = { icon: ReactNode; color: string; label: string; value?: string; onPress: () => void; danger?: boolean };
  const groups: { title: string; items: It[] }[] = [
    ...(admin ? [{ title: t('الإدارة'), items: [
      { icon: <ShieldCheck {...ic} />, color: C.primary, label: t('لوحة الإدارة'), value: t('كل الصلاحيات'), onPress: openAdmin },
    ] }] : []),
    { title: t('الحساب'), items: [
      { icon: <UserPen {...ic} />, color: C.primary, label: t('تعديل البروفايل'), onPress: () => router.push('/settings/edit-profile') },
      { icon: <Lock {...ic} />, color: C.violet, label: t('الخصوصية'), value: profile?.is_private ? t('خاص') : t('عام'), onPress: () => router.push('/settings/privacy') },
      { icon: <Users {...ic} />, color: C.green, label: t('الأصدقاء المقربين'), onPress: () => router.push('/settings/close-friends') },
      { icon: <GraduationCap {...ic} />, color: '#3D6BFF', label: t('أنا عضو هيئة تدريس / موظف'), value: profile?.title_verified ? titleLabel(profile.academic_title) : undefined, onPress: () => router.push('/settings/faculty') },
      { icon: <Bookmark {...ic} />, color: '#56627F', label: t('المحفوظات'), onPress: () => router.push('/settings/saved') },
    ] },
    { title: t('التنبيهات والرسائل'), items: [
      { icon: <Bell {...ic} />, color: C.orange, label: t('التنبيهات والمنبّهات'), onPress: () => router.push('/settings/reminders') },
      { icon: <MessageCircle {...ic} />, color: C.pink, label: t('الرسائل والاختفاء'), onPress: () => router.push('/settings/privacy') },
    ] },
    { title: t('الجهاز'), items: [
      { icon: <KeyRound {...ic} />, color: C.primary, label: t('الصلاحيات'), value: t('كاميرا، صور، مايك…'), onPress: () => router.push('/settings/permissions') },
      { icon: <Palette {...ic} />, color: C.violet, label: t('المظهر واللغة'), value: [{ midnight: t('كحلي'), black: t('أسود'), light: t('فاتح') }[themePref()], isAR ? 'العربية' : 'English'].join(' · '), onPress: () => router.push('/settings/appearance') },
      { icon: <UserPlus {...ic} />, color: C.green, label: t('ادعي زملاءك'), onPress: () => inviteFriends(nm(university)) },
    ] },
    { title: t('الأمان'), items: [
      { icon: <Ban {...ic} />, color: C.red, label: t('المحظورين'), onPress: () => router.push('/settings/blocked') },
      { icon: <EyeOff {...ic} />, color: '#56627F', label: t('الكلمات المخفية'), onPress: () => router.push('/settings/hidden-words') },
    ] },
    { title: t('المساعدة'), items: [
      { icon: <CircleHelp {...ic} />, color: C.primary, label: t('الدعم والمساعدة'), onPress: () => router.push('/settings/support') },
      { icon: <Shield {...ic} />, color: C.green, label: t('سياسة الخصوصية'), onPress: () => router.push({ pathname: '/settings/legal', params: { doc: 'privacy' } }) },
      { icon: <FileText {...ic} />, color: C.violet, label: t('شروط الاستخدام'), onPress: () => router.push({ pathname: '/settings/legal', params: { doc: 'terms' } }) },
      { icon: <Info {...ic} />, color: '#56627F', label: t('عن يونيميت'), value: t('محمد شنيك'), onPress: () => router.push('/settings/about') },
    ] },
    { title: '', items: [
      { icon: <LogOut {...ic} />, color: '#56627F', label: t('تسجيل الخروج'), onPress: logout },
    ] },
    { title: t('منطقة الخطر'), items: [
      { icon: <Trash2 {...ic} />, color: C.red, label: t('حذف الحساب'), value: t('بعد 30 يوم'), danger: true, onPress: deleteAccount },
    ] },
  ];
  const k = normalize(q);
  const shownGroups = k ? [{ title: t('نتائج البحث'), items: groups.flatMap((g) => g.items).filter((it) => normalize(it.label + ' ' + (it.value ?? '')).includes(k)) }] : groups;

  return (
    <Screen>
      <Header title={t('الإعدادات')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 20, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Row gap={8} style={[{ minHeight: 46, borderRadius: 15, backgroundColor: C.card, paddingHorizontal: 14 }, shadow]}>
          <Search size={18} color={C.muted} />
          <TextInput value={q} onChangeText={setQ} placeholder={t('ابحث بالإعدادات')} placeholderTextColor={C.faint} keyboardAppearance={isDark ? 'dark' : 'light'}
            style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} accessibilityLabel={t('ابحث بالإعدادات')} />
        </Row>

        {!k && (
          <Tap scale={0.98} onPress={() => router.push('/profile')}
            style={[{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 24, padding: 14 }, shadow]}>
            <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={60} ring />
            <View style={{ flex: 1, gap: 1 }}>
              <Row gap={5}><T v="h3" numberOfLines={1} style={{ flexShrink: 1 }}>{profile?.full_name}</T>{profile?.is_verified && <BadgeCheck size={16} color={C.white} fill={C.primary} />}</Row>
              {profile?.username ? <T v="small" color={C.muted} style={{ writingDirection: 'ltr', textAlign: ta }}>@{profile.username}</T> : null}
              <T v="tiny" color={C.muted} numberOfLines={1}>{[nm(profile?.major), nm(university)].filter(Boolean).join(' · ')}</T>
            </View>
            <Tap onPress={() => router.push('/leaderboard')} accessibilityLabel={t('لوحة الشرف')} scale={0.94}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: C.orangeSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
              <Star size={15} color={C.orange} fill={C.orange} /><T v="bold" color={C.orange} style={{ fontSize: 13 }}>{profile?.points ?? 0}</T>
            </Tap>
          </Tap>
        )}

        {shownGroups.map((g, gi) => g.items.length ? (
          <Group key={g.title + gi} title={g.title} delay={gi * 30}>
            {g.items.map((it) => <Item key={it.label} {...it} />)}
          </Group>
        ) : <T key="none" v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('ما لقينا إعداد بهالاسم')}</T>)}

        <Tap haptic={false} onPress={() => router.push('/settings/about')} style={{ alignItems: 'center', gap: 2 }}>
          <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('يونيميت · الإصدار {0}', [Constants.expoConfig?.version ?? ''])}</T>
          <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('فكرة وتطوير محمد شنيك')}</T>
        </Tap>
      </ScrollView>
    </Screen>
  );
}
