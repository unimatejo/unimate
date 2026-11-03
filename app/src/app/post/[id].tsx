import { router, useLocalSearchParams } from 'expo-router';
import { Flag, Send, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LikesSheet } from '@/components/LikesSheet';
import { PostCard } from '@/components/PostCard';
import { Avatar, Header, IconButton, Row, Screen, T, Tap } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, withMine } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { timeAgo } from '@/lib/util';
import { isAR, t, ta } from '@/lib/i18n';

type Comment = { id: string; author_id: string; parent_id: string | null; body: string; created_at: string; author: { full_name: string; avatar_url: string | null } | null };

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [likesOf, setLikesOf] = useState<Post | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('posts').select(POST_SELECT).eq('id', id).single();
    if (data) setPost((await withMine([data as unknown as Post], profile?.id))[0]);
    const { data: c } = await supabase.from('comments').select('id, author_id, parent_id, body, created_at, author:profiles(full_name, avatar_url)').eq('post_id', id).order('created_at');
    setComments((c ?? []) as unknown as Comment[]);
  }, [id, profile]);

  useEffect(() => { load(); }, [load]);

  async function send() {
    if (!profile || !draft.trim()) return;
    const body = draft.trim(); setDraft('');
    const { data, error } = await supabase.from('comments').insert({ post_id: id, author_id: (profile?.id ?? ''), body, parent_id: replyTo?.id ?? null })
      .select('id, author_id, parent_id, body, created_at, author:profiles(full_name, avatar_url)').single();
    setReplyTo(null);
    if (!error && data) setComments((c) => [...c, data as unknown as Comment]);
  }

  async function remove() {
    Alert.alert(t('حذف المنشور؟'), t('ما بترجع.'), [{ text: t('إلغاء'), style: 'cancel' }, { text: t('حذف'), style: 'destructive', onPress: async () => { await supabase.from('posts').delete().eq('id', id); router.back(); } }]);
  }

  const ordered = comments.filter((c) => !c.parent_id).flatMap((c) => [c, ...comments.filter((r) => r.parent_id === c.id)]);

  return (
    <Screen>
      <Header title={t('المنشور')} right={post && (post.author_id === profile?.id
        ? <IconButton label={t('حذف')} onPress={remove}><Trash2 size={19} color={C.danger} /></IconButton>
        : <IconButton label={t('إبلاغ')} onPress={() => router.push({ pathname: '/report', params: { type: 'post', id, user: post.author_id } })}><Flag size={19} color={C.ink} /></IconButton>)} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <FlatList
          data={ordered}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 18, paddingTop: 4, gap: 12 }}
          ListHeaderComponent={post ? <View style={{ gap: 16 }}><PostCard detail post={post} onLikes={setLikesOf} /><T v="h3">{t('التعليقات')}</T></View> : undefined}
          renderItem={({ item }) => {
            const own = item.author_id === post?.author_id;
            return (
              <Animated.View entering={FadeInDown} style={{ flexDirection: 'row', gap: 10, marginRight: item.parent_id ? 40 : 0 }}>
                <Avatar id={item.author_id} name={item.author?.full_name} url={item.author?.avatar_url} size={item.parent_id ? 32 : 36} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ backgroundColor: C.card, borderRadius: 18, borderTopRightRadius: 6, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}>
                    <Row gap={6}>
                      <T v="bold" style={{ fontSize: 13 }}>{item.author?.full_name}</T>
                      {own && <View style={{ backgroundColor: C.primarySoft, borderRadius: 999, paddingHorizontal: 6 }}><T v="tiny" color={C.primary} style={{ fontSize: 10 }}>{t('صاحب المنشور')}</T></View>}
                    </Row>
                    <T v="small">{item.body}</T>
                  </View>
                  <Row gap={12}>
                    <T v="tiny" color={C.muted}>{timeAgo(item.created_at)}</T>
                    {!item.parent_id && <Tap onPress={() => setReplyTo(item)}><T v="tiny" color={C.ink2}>{t('رد')}</T></Tap>}
                  </Row>
                </View>
              </Animated.View>
            );
          }}
          ListEmptyComponent={<T v="small" color={C.muted}>{t('كون أول واحد بيعلّق.')}</T>}
        />
        <View style={{ backgroundColor: C.card, paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: C.line, gap: 6 }}>
          {replyTo && <Row gap={6}><T v="tiny" color={C.muted} style={{ flex: 1 }}>{t('رد على')} {replyTo.author?.full_name}</T><Tap onPress={() => setReplyTo(null)}><T v="tiny" color={C.primary}>{t('إلغاء')}</T></Tap></Row>}
          <Row gap={8}>
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={draft} onChangeText={setDraft} placeholder={t('اكتب تعليق...')} placeholderTextColor={C.faint} multiline
              style={{ flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 23, backgroundColor: C.field, paddingHorizontal: 16, paddingVertical: 11, fontFamily: F.body, fontSize: 15, textAlign: ta, color: C.ink }} accessibilityLabel={t('اكتب تعليق')} />
            <Tap onPress={send} accessibilityLabel={t('إرسال')} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: draft.trim() ? C.primary : C.line, alignItems: 'center', justifyContent: 'center' }}>
              <Send size={19} color={C.white} style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} />
            </Tap>
          </Row>
        </View>
      </KeyboardAvoidingView>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
