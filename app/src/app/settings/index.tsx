import { router } from 'expo-router';
import {
  Ban, Bell, Bookmark, ChevronLeft, CircleHelp, EyeOff, FileText, Lock, LogOut, MessageCircle, Shield, Star, Trash2, UserPen, Users,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Header, IconTile, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';

function Group({ title, children, delay = 0 }: { title: string; children: ReactNode; delay?: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay)} style={{ gap: 8 }}>
      <T v="small" color={C.muted} style={{ paddingHorizontal: 6 }}>{title}</T>
      <View style={{ backgroundColor: C.white, borderRadius: 22, overflow: 'hidden' }}>{children}</View>
    </Animated.View>
  );
}

function Item({ icon, color, label, value, onPress, danger }: { icon: ReactNode; color: string; label: string; value?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap scale={0.985} haptic={false} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingHorizontal: 14, borderBottomWidth: 0.5, borderBottomColor: C.line }}>
      <IconTile color={color}>{icon}</IconTile>
      <T v="bodyMd" color={danger ? C.red : C.ink} style={{ flex: 1 }}>{label}</T>
      {value ? <T v="small" color={C.muted}>{value}</T> : null}
      <ChevronLeft size={18} color={C.faint} />
    </Tap>
  );
}

const ic = { size: 19, color: C.white };

export default function Settings() {
  const { profile, university, signOut } = useAuth();

  function logout() {
    Alert.alert('تسجيل الخروج', 'أكيد بدك تطلع من حسابك؟', [
      { text: 'لا', style: 'cancel' },
      { text: 'اطلع', style: 'destructive', onPress: async () => { await signOut(); router.replace('/(auth)/login'); } },
    ]);
  }

  function deleteAccount() {
    Alert.alert('حذف الحساب', 'رح نبعت طلب حذف لفريق يونيميت، وبنحذف حسابك ومنشوراتك خلال 30 يوم. بتقدر تلغي الطلب لو رجعت فتحت التطبيق قبلها.', [
      { text: 'تراجع', style: 'cancel' },
      { text: 'اطلب الحذف', style: 'destructive', onPress: async () => {
        await supabase.from('support_tickets').insert({ user_id: (profile?.id ?? ''), subject: 'طلب حذف الحساب', body: 'المستخدم طلب حذف حسابه من الإعدادات.' });
        Alert.alert('وصل طلبك', 'بنحذف الحساب خلال 30 يوم.');
      } },
    ]);
  }

  return (
    <Screen>
      <Header title="الإعدادات" />
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 20, paddingBottom: 60 }}>
        <Tap scale={0.98} onPress={() => router.push('/settings/edit-profile')}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.white, borderRadius: 24, padding: 14 }}>
          <Avatar id={profile?.id} name={profile?.full_name} url={profile?.avatar_url} size={60} ring />
          <View style={{ flex: 1 }}>
            <T v="h3">{profile?.full_name}</T>
            <T v="small" color={C.muted}>{[profile?.major?.name_ar, university?.name_ar].filter(Boolean).join(' · ')}</T>
          </View>
          <Row gap={4} style={{ backgroundColor: C.orangeSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
            <Star size={15} color={C.orange} fill={C.orange} /><T v="bold" color={C.orange} style={{ fontSize: 13 }}>{profile?.points ?? 0}</T>
          </Row>
        </Tap>

        <Group title="الحساب" delay={40}>
          <Item icon={<UserPen {...ic} />} color={C.primary} label="تعديل البروفايل" onPress={() => router.push('/settings/edit-profile')} />
          <Item icon={<Lock {...ic} />} color={C.violet} label="الخصوصية" value={profile?.is_private ? 'خاص' : 'عام'} onPress={() => router.push('/settings/privacy')} />
          <Item icon={<Users {...ic} />} color={C.green} label="الأصدقاء المقربين" onPress={() => router.push('/settings/close-friends')} />
          <Item icon={<Bookmark {...ic} />} color={C.ink} label="المحفوظات" onPress={() => router.push('/settings/saved')} />
        </Group>

        <Group title="التنبيهات والرسائل" delay={80}>
          <Item icon={<Bell {...ic} />} color={C.orange} label="التنبيهات والمنبّهات" onPress={() => router.push('/settings/reminders')} />
          <Item icon={<MessageCircle {...ic} />} color={C.pink} label="الرسائل والاختفاء" onPress={() => router.push('/settings/privacy')} />
        </Group>

        <Group title="الأمان" delay={120}>
          <Item icon={<Ban {...ic} />} color={C.red} label="المحظورين" onPress={() => router.push('/settings/blocked')} />
          <Item icon={<EyeOff {...ic} />} color={C.ink2} label="الكلمات المخفية" onPress={() => router.push('/settings/hidden-words')} />
        </Group>

        <Group title="المساعدة" delay={160}>
          <Item icon={<CircleHelp {...ic} />} color={C.primary} label="الدعم والمساعدة" onPress={() => router.push('/settings/support')} />
          <Item icon={<Shield {...ic} />} color={C.green} label="سياسة الخصوصية" onPress={() => router.push({ pathname: '/settings/legal', params: { doc: 'privacy' } })} />
          <Item icon={<FileText {...ic} />} color={C.violet} label="شروط الاستخدام" onPress={() => router.push({ pathname: '/settings/legal', params: { doc: 'terms' } })} />
        </Group>

        <Group title="" delay={200}>
          <Item icon={<LogOut {...ic} />} color={C.ink} label="تسجيل الخروج" onPress={logout} />
          <Item icon={<Trash2 {...ic} />} color={C.red} label="حذف الحساب" danger onPress={deleteAccount} />
        </Group>

        <T v="tiny" color={C.faint} style={{ textAlign: 'center' }}>يونيميت · الإصدار 1.0.0</T>
      </ScrollView>
    </Screen>
  );
}
