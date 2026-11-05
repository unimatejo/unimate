import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BadgeIcon, BadgeLine } from './BadgeTile';
import { Button, T, Tap } from '../ui';
import { BADGES, sortBadges, type BadgeState } from '@/lib/badges';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';

/**
 * Earned badges under the bio, like story highlights. Tap → all badges in a sheet
 * (on my own profile also the locked ones with how far I am; on others only what they earned).
 */
export function BadgesRow({ userId, mine }: { userId: string; mine: boolean }) {
  const [list, setList] = useState<BadgeState[] | null>(null);
  const [open, setOpen] = useState(false);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    let live = true;
    supabase.rpc('user_badges', { p_user: userId }).then(({ data }) => { if (live) setList(sortBadges((data ?? []) as BadgeState[])); }, () => {});
    return () => { live = false; };
  }, [userId]);

  if (!list) return null;
  const earned = list.filter((b) => b.earned);
  if (!earned.length && !mine) return null;
  const shown = mine ? list : earned;

  return (
    <>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 2 }}>
        {earned.map((b) => (
          <Tap key={b.key} onPress={() => setOpen(true)} scale={0.94} accessibilityLabel={BADGES[b.key].name} style={{ width: 64, alignItems: 'center', gap: 4 }}>
            <BadgeIcon b={b} />
            <T v="tiny" numberOfLines={1} style={{ fontSize: 10 }}>{BADGES[b.key].name}</T>
          </Tap>
        ))}
        {mine && (
          <Tap onPress={() => setOpen(true)} scale={0.94} accessibilityLabel={t('كل الشارات')} style={{ width: 64, alignItems: 'center', gap: 4 }}>
            <BadgeIcon b={{ ...(list.find((b) => !b.earned) ?? list[0]), earned: false }} />
            <T v="tiny" numberOfLines={1} color={C.muted} style={{ fontSize: 10 }}>{earned.length ? t('كل الشارات') : t('شاراتك')}</T>
          </Tap>
        )}
      </ScrollView>

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={() => setOpen(false)} accessibilityLabel={t('إغلاق')} />
        <View style={{ maxHeight: '82%', backgroundColor: C.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 16, gap: 12 }}>
          <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line }} />
          <View style={{ gap: 2 }}>
            <T v="h2">{t('الشارات')}</T>
            <T v="small" color={C.muted}>{mine ? t('حصّلت {0} من {1}', [earned.length, list.length]) : t('{0} شارة', [earned.length])}</T>
          </View>
          <ScrollView contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
            {shown.map((b) => <BadgeLine key={b.key} b={b} showProgress={mine} />)}
          </ScrollView>
          <Button kind="soft" title={t('لوحة الشرف')} onPress={() => { setOpen(false); router.push('/leaderboard'); }} />
        </View>
      </Modal>
    </>
  );
}
