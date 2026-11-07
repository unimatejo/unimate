import { router } from 'expo-router';
import { Heart, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Row, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { run } from '@/lib/run';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { nm, t } from '@/lib/i18n';
import { likesShown } from '@/lib/posts';
import { fmtCount } from '@/lib/util';

type Liker = { user_id: string; profile: { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null } | null };

/** Bottom sheet listing who liked a post. */
export function LikesSheet({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Liker[]>([]);
  const [following, setFollowing] = useState<Map<string, string>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!post || !profile) return;
    setRows([]); setLoading(true);
    supabase.from('post_likes').select('user_id, profile:profiles!post_likes_user_id_fkey(id, full_name, avatar_url, major:majors!profiles_major_id_fkey(name_ar, name_en))').eq('post_id', post.id).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => { setRows((data ?? []) as unknown as Liker[]); setLoading(false); }, () => setLoading(false));
    supabase.from('follows').select('followee_id, status').eq('follower_id', profile.id)
      .then(({ data }) => setFollowing(new Map((data ?? []).map((x) => [x.followee_id as string, x.status as string]))));
  }, [post, profile]);

  async function follow(uid: string) {
    if (!profile || busy) return;
    setBusy(uid);
    try {
      if (following.has(uid)) {
        const r = await run(supabase.from('follows').delete().eq('follower_id', profile.id).eq('followee_id', uid));
        if (r.ok) setFollowing((s) => { const n = new Map(s); n.delete(uid); return n; });
      } else {
        const r = await run(supabase.from('follows').insert({ follower_id: profile.id, followee_id: uid }).select('status').single());
        if (r.ok) setFollowing((s) => new Map(s).set(uid, (r.data as { status: string } | null)?.status ?? 'accepted'));
      }
    } finally { setBusy(null); }
  }
  const label = (uid: string) => { const st = following.get(uid); return !st ? t('متابعة') : st === 'pending' ? t('تم الطلب') : t('تتابعه'); };

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={onClose} accessibilityLabel={t('إغلاق')} />
      <View style={{ maxHeight: '70%', backgroundColor: C.card, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 16 }}>
        <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 12 }} />
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <T v="h2">{t('الإعجابات')}</T>
          <Row gap={5}><Heart size={16} color={C.pink} fill={C.pink} /><T v="bold" color="#D12C4F">{fmtCount(post ? likesShown(post) : 0)}</T></Row>
        </Row>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.user_id}
          renderItem={({ item }) => (
            <Row gap={12} style={{ minHeight: 60 }}>
              <Tap onPress={() => { onClose(); router.push({ pathname: '/user/[id]', params: { id: item.user_id } }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                <Avatar id={item.user_id} name={item.profile?.full_name} url={item.profile?.avatar_url} size={46} />
                <View style={{ flex: 1 }}>
                  <T v="bold">{item.profile?.full_name}</T>
                  <T v="tiny" color={C.muted}>{nm(item.profile?.major) ?? ''}</T>
                </View>
              </Tap>
              {item.user_id !== profile?.id && (
                <Button kind={following.has(item.user_id) ? 'soft' : 'primary'} title={label(item.user_id)}
                  loading={busy === item.user_id} disabled={!!busy} onPress={() => follow(item.user_id)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
              )}
            </Row>
          )}
          ListEmptyComponent={loading ? <ActivityIndicator color={C.primary} style={{ marginVertical: 24 }} /> : <T v="small" color={C.muted}>{t('لا توجد إعجابات حتى الآن.')}</T>}
        />
        <Row gap={6} style={{ marginTop: 10 }}>
          <Lock size={14} color={C.muted} />
          <T v="tiny" color={C.muted}>{t('يمكن لصاحب المنشور إخفاء عدد الإعجابات من الإعدادات')}</T>
        </Row>
      </View>
    </Modal>
  );
}
