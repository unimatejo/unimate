import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { BadgeCheck, MoreHorizontal, Search, ShieldCheck, UserMinus, UserPlus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, TextInput, View } from 'react-native';

import { SheetModal } from '@/components/chat/ChatExtras';
import { TitleBadge } from '@/components/profile/TitleBadge';
import { Avatar, Header, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { t, ta } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';
import { C, F, R, isDark } from '@/lib/theme';
import { toast } from '@/lib/toast';
import type { Member } from './info';

const ROLE: Record<string, string> = { owner: t('صاحب الجروب'), admin: t('مشرف'), member: '' };

/** Everyone in the group with photo, name, @username and title; managers can promote or remove. */
export default function Members() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const [list, setList] = useState<Member[] | null>(null);
  const [mine, setMine] = useState('member');
  const [kind, setKind] = useState<string>('group');
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<Member | null>(null);

  const load = useCallback(async () => {
    const [{ data }, { data: r }, { data: c }] = await Promise.all([
      supabase.rpc('group_members', { conv: id }),
      supabase.rpc('conv_role', { conv: id }),
      supabase.from('conversations').select('kind').eq('id', id).maybeSingle(),
    ]);
    setList((data ?? []) as Member[]);
    setMine((r as string) ?? 'member');
    setKind(c?.kind ?? 'group');
  }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const manager = mine === 'owner' || mine === 'admin';
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/^@/, '');
    return (list ?? []).filter((m) => !s || m.full_name.toLowerCase().includes(s) || (m.username ?? '').toLowerCase().includes(s));
  }, [list, q]);

  async function act(fn: () => PromiseLike<{ error: { message?: string } | null }>, ok: string) {
    setMenu(null);
    const { error } = await fn();
    if (error) {
      const m = error.message ?? '';
      Alert.alert(t('ما زبط'), /owner_only/.test(m) ? t('بس صاحب الجروب بيقدر يعمل هاد.') : /cannot_remove_owner|cannot_change_owner/.test(m) ? t('ما بتقدر تغيّر صاحب الجروب.') : t('بس المشرفين بيقدروا يعملوا هاد.'));
      return;
    }
    toast(ok); load();
  }
  function remove(m: Member) {
    Alert.alert(t('تشيل {0} من الجروب؟', [m.full_name.split(' ')[0]]), t('ما رح توصله رسائل الجروب.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('شيله'), style: 'destructive', onPress: () => act(() => supabase.rpc('group_remove_member', { conv: id, uid: m.user_id }), t('انشال من الجروب')) },
    ]);
  }

  return (
    <Screen>
      <Header title={t('الأعضاء')} subtitle={list ? t('{0} عضو', [String(list.length)]) : undefined} />
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Row gap={8} style={{ minHeight: 46, borderRadius: R.md, backgroundColor: C.soft, paddingHorizontal: 14 }}>
          <Search size={18} color={C.muted} />
          <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={q} onChangeText={setQ} placeholder={t('ابحث بالأعضاء')} placeholderTextColor={C.muted}
            style={{ flex: 1, fontFamily: F.body, fontSize: 15, color: C.ink, textAlign: ta }} />
        </Row>
      </View>
      {list === null ? <ActivityIndicator color={C.muted} style={{ padding: 30 }} /> : (
        <FlatList
          data={shown}
          keyExtractor={(m) => m.user_id}
          initialNumToRender={20}
          contentContainerStyle={{ paddingBottom: 60 }}
          renderItem={({ item: m }) => (
            <Tap haptic={false} onPress={() => router.push({ pathname: '/user/[id]', params: { id: m.user_id } })} accessibilityLabel={m.full_name}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingHorizontal: 16 }}>
              <Avatar id={m.user_id} name={m.full_name} url={m.avatar_url} size={50} />
              <View style={{ flex: 1, gap: 2 }}>
                <Row gap={5}>
                  <T v="bodyMd" numberOfLines={1} style={{ flexShrink: 1 }}>{m.full_name}</T>
                  {m.is_verified && <BadgeCheck size={14} color={C.onPrimary} fill={C.primary} />}
                  <TitleBadge title={m.academic_title} verified={m.title_verified} />
                </Row>
                <Row gap={6}>
                  {m.username ? <T v="small" color={C.muted} numberOfLines={1}>{`⁦@${m.username}⁩`}</T> : null}
                  {m.state === 'request' ? <T v="tiny" color={C.muted}>{t('· ما قبل لسا')}</T> : null}
                </Row>
              </View>
              {ROLE[m.role] ? <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.pill, backgroundColor: m.role === 'owner' ? C.primarySoft : C.soft }}><T v="tiny" color={m.role === 'owner' ? C.primaryDark : C.ink2}>{ROLE[m.role]}</T></View> : null}
              {manager && m.user_id !== profile?.id && m.role !== 'owner' && kind === 'group' && (
                <Tap onPress={() => setMenu(m)} accessibilityLabel={t('خيارات {0}', [m.full_name])} style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <MoreHorizontal size={20} color={C.ink} />
                </Tap>
              )}
            </Tap>
          )}
        />
      )}
      <SheetModal open={!!menu} onClose={() => setMenu(null)} style={{ gap: 6 }}>
        {menu && (
          <>
            <Row gap={12} style={{ paddingBottom: 6 }}>
              <Avatar id={menu.user_id} name={menu.full_name} url={menu.avatar_url} size={44} />
              <T v="h3" numberOfLines={1} style={{ flex: 1 }}>{menu.full_name}</T>
            </Row>
            {menu.role === 'admin'
              ? <MenuRow icon={<ShieldCheck size={21} color={C.ink} />} label={t('شيل الإشراف')} onPress={() => act(() => supabase.rpc('group_set_role', { conv: id, uid: menu.user_id, p_role: 'member' }), t('ما عاد مشرف'))} />
              : <MenuRow icon={<UserPlus size={21} color={C.ink} />} label={t('اعمله مشرف')} onPress={() => act(() => supabase.rpc('group_set_role', { conv: id, uid: menu.user_id, p_role: 'admin' }), t('صار مشرف'))} />}
            <MenuRow icon={<UserMinus size={21} color={C.danger} />} label={t('شيله من الجروب')} danger onPress={() => remove(menu)} />
          </>
        )}
      </SheetModal>
    </Screen>
  );
}

function MenuRow({ icon, label, onPress, danger }: { icon: React.ReactNode; label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 54 }}>
      {icon}<T v="bodyMd" color={danger ? C.danger : C.ink}>{label}</T>
    </Tap>
  );
}
