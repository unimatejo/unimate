import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { Megaphone, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, FlatList, View } from 'react-native';

import { AnnouncementCard, type Announcement } from '@/components/announcements/AnnouncementCard';
import { GlyphTile, GRAD } from '@/components/ui/Glyph';
import { PullRefresh } from '@/components/ui/PullRefresh';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Button, Empty, Header, IconButton, Screen, T } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { readCache, writeCache } from '@/lib/cache';
import { C } from '@/lib/theme';
import { nm, t } from '@/lib/i18n';
import { toast } from '@/lib/toast';

/** Official announcements from the university leadership, deans and the dean's office. */
export default function Announcements() {
  const { university } = useAuth();
  // the last feed this phone saw: opens at once, and without internet
  const [rows, setRows] = useState<Announcement[] | null>(() => readCache<Announcement[]>('announcements') ?? null);
  const [failed, setFailed] = useState(false);
  const [canPost, setCanPost] = useState(false);

  const load = useCallback(async () => {
    const [{ data, error }, { data: scopes }] = await Promise.all([
      supabase.rpc('announcements_feed', { lim: 50 }),
      supabase.rpc('my_announce_scopes'),
    ]);
    if (error) { setFailed(!readCache('announcements')); setRows((r) => r ?? []); return; }
    setFailed(false);
    setRows((data ?? []) as Announcement[]);
    writeCache('announcements', (data ?? []) as Announcement[]);
    setCanPost(((scopes ?? []) as unknown[]).length > 0);
  }, []);

  // refresh when coming back from writing / editing one
  useFocusEffect(useCallback(() => { load(); }, [load]));

  function menu(a: Announcement) {
    const opts: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (a.mine) opts.push({ text: t('تعديل'), onPress: () => router.push({ pathname: '/announcements/new', params: { id: a.id } }) });
    if (a.can_pin) opts.push({ text: a.pinned ? t('إلغاء التثبيت') : t('تثبيت في الأعلى'), onPress: () => pin(a) });
    if (a.mine) opts.push({ text: t('حذف'), style: 'destructive', onPress: () => remove(a) });
    opts.push({ text: t('إلغاء'), style: 'cancel' });
    Alert.alert(a.title, undefined, opts);
  }

  async function pin(a: Announcement) {
    setRows((r) => r?.map((x) => (x.id === a.id ? { ...x, pinned: !a.pinned } : x)) ?? r);
    const r = await run(supabase.rpc('pin_announcement', { p_id: a.id, p_pinned: !a.pinned }));
    if (!r.ok) { load(); return; }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    load();
  }

  function remove(a: Announcement) {
    Alert.alert(t('حذف الإعلان؟'), t('سيختفي لدى الجميع.'), [
      { text: t('لا'), style: 'cancel' },
      { text: t('احذف'), style: 'destructive', onPress: async () => {
        const before = rows;
        setRows((r) => r?.filter((x) => x.id !== a.id) ?? r);
        const r = await run(supabase.rpc('delete_announcement', { p_id: a.id }));
        if (!r.ok) { setRows(before); return; }
        toast(t('تم حذف الإعلان'));
      } },
    ]);
  }

  return (
    <Screen>
      <Header title={t('إعلانات رسمية')} subtitle={nm(university) || t('من رئاسة الجامعة والعمادات')}
        right={canPost ? (
          <IconButton label={t('إعلان جديد')} onPress={() => router.push('/announcements/new')}><Plus size={22} color={C.ink} /></IconButton>
        ) : undefined} />
      <FlatList
        data={rows ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 12, paddingBottom: 60 }}
        refreshControl={<PullRefresh onRefresh={load} />}
        ListHeaderComponent={canPost ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.primarySoft, borderRadius: 22, padding: 12 }}>
            <GlyphTile icon={Megaphone} colors={GRAD.orange} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="bodyMd">{t('يمكنك نشر إعلانات رسمية')}</T>
              <T v="tiny" color={C.ink2}>{t('سيصل إشعار إلى كل طالب في الكلية أو الجامعة التي تختارها.')}</T>
            </View>
            <Button title={t('انشر')} onPress={() => router.push('/announcements/new')} style={{ minHeight: 38, paddingHorizontal: 16 }} />
          </View>
        ) : undefined}
        renderItem={({ item, index }) => (
          <AnnouncementCard a={item} index={index}
            onAuthor={() => router.push({ pathname: '/user/[id]', params: { id: item.author_id } })}
            onMenu={item.mine || item.can_pin ? () => menu(item) : undefined} />
        )}
        ListEmptyComponent={rows === null ? <ListSkeleton n={4} />
          : failed ? <Empty title={t('تعذّر تحميل الإعلانات')} body={t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.')} action={<Button kind="soft" title={t('حاول مرة أخرى')} onPress={load} style={{ paddingHorizontal: 24 }} />} />
          : <Empty icon={<Megaphone size={28} color={C.primary} />} title={t('لا توجد إعلانات حتى الآن')} body={t('هنا تصلك إعلانات الجامعة والعمادة الرسمية أولًا بأول.')} />}
      />
    </Screen>
  );
}
