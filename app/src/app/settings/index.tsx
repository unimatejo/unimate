import Constants from 'expo-constants';
import { router } from 'expo-router';
import {
  Ban, Bell, Palette, Bookmark, ChevronLeft, CircleHelp, EyeOff, FileText, Lock, LogOut, MessageCircle, Shield, Star, Trash2, UserPen, UserPlus, Users,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Header, IconTile, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { inviteFriends } from '@/lib/invite';
import { run } from '@/lib/run';
import { C, isDark } from '@/lib/theme';
import { flip, isAR, nm, t } from '@/lib/i18n';

function Group({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay)} style={{ gap: 8 }}>
      <T v="small" color={C.muted} style={{ paddingHorizontal: 6 }}>{title}</T>
      <View style={{ backgroundColor: C.card, borderRadius: 22, overflow: 'hidden' }}>{children}</View>
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

  function logout() {
    Alert.alert(t('تسجيل الخروج'), t('أكيد بدك تطلع من حسابك؟'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('اطلع'), style: 'destructive', onPress: async () => { try { await signOut(); } finally { router.replace('/(auth)/login'); } } },
    ]);
  }

  function deleteAccount() {
    Alert.alert(t('حذف الحساب'), t('رح ينحذف حسابك ومنشوراتك وقصصك ومتابعاتك نهائياً، وما بترجع. متأكد؟'), [
      { text: t('تراجع'), style: 'cancel' },
      { text: t('احذف حسابي'), style: 'destructive', onPress: async () => {
        const r = await run(supabase.rpc('delete_my_account'), { msg: t('ما زبط حذف الحساب، جرّب كمان مرة.') });
        if (!r.ok) return;
        await signOut();
        router.replace('/(auth)/login');
        Alert.alert(t('انحذف حسابك'), t('شكراً إنك جربت يونيميت.'));
      } },
    ]);
  }

  return (
    <Screen>
      <Header title={t('الإعدادات')} />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 20, paddingBottom: 60 }}>
        <Tap scale={0.98} onPress={() => router.push('/settings/edit-profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.card, borderRadius: 24, padding: 14 }}>
          <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={60} ring />
          <View style={{ flex: 1 }}>
            <T v="h3">{profile?.full_name}</T>
            <T v="small" color={C.muted}>{[nm(profile?.major), nm(university)].filter(Boolean).join(' · ')}</T>
          </View>
          <Row gap={4} style={{ backgroundColor: C.orangeSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
            <Star size={15} color={C.orange} fill={C.orange} /><T v="bold" color={C.orange} style={{ fontSize: 13 }}>{profile?.points ?? 0}</T>
          </Row>
        </Tap>

        <Group title={t('الحساب')} delay={40}>
          <Item icon={<UserPen {...ic} />} color={C.primary} label={t('تعديل البروفايل')} onPress={() => router.push('/settings/edit-profile')} />
          <Item icon={<Lock {...ic} />} color={C.violet} label={t('الخصوصية')} value={profile?.is_private ? t('خاص') : t('عام')} onPress={() => router.push('/settings/privacy')} />
          <Item icon={<Users {...ic} />} color={C.green} label={t('الأصدقاء المقربين')} onPress={() => router.push('/settings/close-friends')} />
          <Item icon={<Bookmark {...ic} />} color="#56627F" label={t('المحفوظات')} onPress={() => router.push('/settings/saved')} />
        </Group>

        <Group title={t('التطبيق')} delay={60}>
          <Item icon={<UserPlus {...ic} />} color={C.green} label={t('ادعي زملاءك')} onPress={() => inviteFriends(nm(university))} />
          <Item icon={<Palette {...ic} />} color={C.violet} label={t('المظهر واللغة')} value={[isDark ? t('غامق') : t('فاتح'), isAR ? 'العربية' : 'English'].join(' · ')} onPress={() => router.push('/settings/appearance')} />
        </Group>

        <Group title={t('التنبيهات والرسائل')} delay={80}>
          <Item icon={<Bell {...ic} />} color={C.orange} label={t('التنبيهات والمنبّهات')} onPress={() => router.push('/settings/reminders')} />
          <Item icon={<MessageCircle {...ic} />} color={C.pink} label={t('الرسائل والاختفاء')} onPress={() => router.push('/settings/privacy')} />
        </Group>

        <Group title={t('الأمان')} delay={120}>
          <Item icon={<Ban {...ic} />} color={C.red} label={t('المحظورين')} onPress={() => router.push('/settings/blocked')} />
          <Item icon={<EyeOff {...ic} />} color="#56627F" label={t('الكلمات المخفية')} onPress={() => router.push('/settings/hidden-words')} />
        </Group>

        <Group title={t('المساعدة')} delay={160}>
          <Item icon={<CircleHelp {...ic} />} color={C.primary} label={t('الدعم والمساعدة')} onPress={() => router.push('/settings/support')} />
          <Item icon={<Shield {...ic} />} color={C.green} label={t('سياسة الخصوصية')} onPress={() => router.push({ pathname: '/settings/legal', params: { doc: 'privacy' } })} />
          <Item icon={<FileText {...ic} />} color={C.violet} label={t('شروط الاستخدام')} onPress={() => router.push({ pathname: '/settings/legal', params: { doc: 'terms' } })} />
        </Group>

        <Group title="" delay={200}>
          <Item icon={<LogOut {...ic} />} color="#56627F" label={t('تسجيل الخروج')} onPress={logout} />
          <Item icon={<Trash2 {...ic} />} color={C.red} label={t('حذف الحساب')} danger onPress={deleteAccount} />
        </Group>

        <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>{t('يونيميت · الإصدار {0}', [Constants.expoConfig?.version ?? ''])}</T>
      </ScrollView>
    </Screen>
  );
}
