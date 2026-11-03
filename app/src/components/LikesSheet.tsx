import { router } from 'expo-router';
import { Heart, Lock } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { FlatList, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Button, Row, T, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { C } from '@/lib/theme';
import type { Post } from '@/lib/types';

type Liker = { user_id: string; profile: { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null } | null };

export function LikesSheet({ post, onClose }: { post: Post | null; onClose: () => void }) {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<Liker[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!post || !profile) return;
    supabase.from('post_likes').select('user_id, profile:profiles(id, full_name, avatar_url, major:majors(name_ar))').eq('post_id', post.id).order('created_at', { ascending: false }).limit(200)
      .then(({ data }) => setRows((data ?? []) as unknown as Liker[]));
    supabase.from('follows').select('followee_id').eq('follower_id', profile.id)
      .then(({ data }) => setFollowing(new Set((data ?? []).map((x) => x.followee_id))));
  }, [post, profile]);

  async function follow(uid: string) {
    if (!profile) return;
    if (following.has(uid)) {
      await supabase.from('follows').delete().eq('follower_id', profile.id).eq('followee_id', uid);
      setFollowing((s) => { const n = new Set(s); n.delete(uid); return n; });
    } else {
      await supabase.from('follows').insert({ follower_id: profile.id, followee_id: uid });
      setFollowing((s) => new Set(s).add(uid));
    }
  }

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(14,20,48,0.45)' }} onPress={onClose} accessibilityLabel="إغلاق" />
      <View style={{ maxHeight: '70%', backgroundColor: C.white, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 18, paddingTop: 10, paddingBottom: insets.bottom + 16 }}>
        <View style={{ alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: '#DCE1EE', marginBottom: 12 }} />
        <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <T v="h2">الإعجابات</T>
          <Row gap={5}><Heart size={16} color={C.pink} fill={C.pink} /><T v="bold" color="#D12C4F">{post?.like_count ?? 0}</T></Row>
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
                  <T v="tiny" color={C.muted}>{item.profile?.major?.name_ar ?? ''}</T>
                </View>
              </Tap>
              {item.user_id !== profile?.id && (
                <Button kind={following.has(item.user_id) ? 'soft' : 'primary'} title={following.has(item.user_id) ? 'تتابعه' : 'متابعة'}
                  onPress={() => follow(item.user_id)} style={{ minHeight: 38, paddingHorizontal: 14, borderRadius: 12 }} />
              )}
            </Row>
          )}
          ListEmptyComponent={<T v="small" color={C.muted}>ما في إعجابات لهلأ.</T>}
        />
        <Row gap={6} style={{ marginTop: 10 }}>
          <Lock size={14} color={C.muted} />
          <T v="tiny" color={C.muted}>صاحب المنشور بيقدر يخفي عدد اللايكات من الإعدادات</T>
        </Row>
      </View>
    </Modal>
  );
}
