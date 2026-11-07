import { router, useLocalSearchParams } from 'expo-router';
import { CircleAlert, Flag, Send, Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LikesSheet } from '@/components/feed/LikesSheet';
import { PostCard } from '@/components/feed/PostCard';
import { Avatar, Button, Empty, Header, IconButton, Row, Screen, T, Tap } from '@/components/ui';
import { PostSkeleton } from '@/components/ui/Skeleton';
import { toast } from '@/lib/toast';
import { TitleBadge, titledName } from '@/components/profile/TitleBadge';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, withMine } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { C, F, isDark } from '@/lib/theme';
import type { Post } from '@/lib/types';
import { normalize, timeAgo } from '@/lib/util';
import { isAR, t, ta } from '@/lib/i18n';
import { run } from '@/lib/run';

// posts opened before show instantly when you come back (then refresh quietly)
const seen = new Map<string, Post>();

type Comment = { id: string; author_id: string; parent_id: string | null; body: string; created_at: string; author: { full_name: string; avatar_url: string | null; academic_title?: string | null; title_verified?: boolean } | null };

export default function PostScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<Post | null>(() => seen.get(id) ?? null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [likesOf, setLikesOf] = useState<Post | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing' | 'error'>(() => (seen.has(id) ? 'ok' : 'loading'));

  const load = useCallback(async () => {
    try {
      const [{ data, error }, { data: c }, { data: hw }, { data: bl }] = await Promise.all([
        supabase.from('posts').select(POST_SELECT).eq('id', id).maybeSingle(),
        supabase.from('comments').select('id, author_id, parent_id, body, created_at, author:profiles!comments_author_id_fkey(full_name, avatar_url, academic_title, title_verified)').eq('post_id', id).order('created_at'),
        profile ? supabase.from('hidden_words').select('word').eq('user_id', profile.id) : Promise.resolve({ data: [] as { word: string }[] }),
        profile ? supabase.from('blocks').select('blocked_id').eq('blocker_id', profile.id) : Promise.resolve({ data: [] as { blocked_id: string }[] }),
      ]);
      if (error) { setState((s) => (s === 'ok' ? s : 'error')); return; }
      if (!data) { setState('missing'); return; }
      const full = (await withMine([data as unknown as Post], profile?.id))[0];
      seen.set(id, full);
      setPost(full);
      // hide comments with my hidden words, or from people I blocked (my own always show)
      const words = (hw ?? []).map((x) => normalize(x.word)).filter(Boolean);
      const blocked = new Set((bl ?? []).map((x) => x.blocked_id));
      setComments(((c ?? []) as unknown as Comment[]).filter((x) => x.author_id === profile?.id || (!blocked.has(x.author_id) && !words.some((w) => normalize(x.body).includes(w)))));
      setState('ok');
    } catch { setState((s) => (s === 'ok' ? s : 'error')); }
  }, [id, profile]);

  useEffect(() => { load(); }, [load]);

  const [sending, setSending] = useState(false);
  async function send() {
    if (!profile || !draft.trim() || sending) return;
    const body = draft.trim();
    setSending(true);
    const r = await run(supabase.from('comments').insert({ post_id: id, author_id: profile.id, body, parent_id: replyTo?.id ?? null })
      .select('id, author_id, parent_id, body, created_at, author:profiles!comments_author_id_fkey(full_name, avatar_url, academic_title, title_verified)').single(), { msg: t('لم يُرسل التعليق، حاول مرة أخرى.') });
    setSending(false);
    if (!r.ok || !r.data) return; // the text stays in the box
    setDraft(''); setReplyTo(null);
    setComments((c) => [...c, r.data as unknown as Comment]);
  }

  async function remove() {
    Alert.alert(t('حذف المنشور؟'), t('لا يمكن التراجع عن ذلك.'), [{ text: t('إلغاء'), style: 'cancel' }, { text: t('حذف'), style: 'destructive', onPress: async () => { const r = await run(supabase.from('posts').delete().eq('id', id)); if (r.ok) { toast(t('تم حذف المنشور')); router.back(); } } }]);
  }

  /** Long-press a comment: copy-free menu to reply, report, or delete (own comment, or any comment on my post). */
  function commentMenu(c: Comment) {
    const canDelete = c.author_id === profile?.id || post?.author_id === profile?.id;
    const opts: { text: string; style?: 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (!c.parent_id) opts.push({ text: t('رد'), onPress: () => setReplyTo(c) });
    if (c.author_id !== profile?.id) opts.push({ text: t('إبلاغ'), onPress: () => router.push({ pathname: '/report', params: { type: 'comment', id: c.id, user: c.author_id } }) });
    if (canDelete) opts.push({ text: t('حذف التعليق'), style: 'destructive', onPress: async () => {
      const prev = comments;
      setComments((x) => x.filter((y) => y.id !== c.id && y.parent_id !== c.id));
      const r = await run(supabase.from('comments').delete().eq('id', c.id));
      if (!r.ok) setComments(prev);
    } });
    opts.push({ text: t('إلغاء'), style: 'cancel' });
    Alert.alert('', c.body.slice(0, 80), opts);
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
              <Animated.View entering={FadeInDown}>
              <Tap haptic={false} scale={0.99} onLongPress={() => commentMenu(item)} onPress={() => {}} accessibilityHint={t('اضغط مطولاً لعرض الخيارات')} style={{ flexDirection: 'row', gap: 10, marginStart: item.parent_id ? 40 : 0 }}>
                <Avatar id={item.author_id} name={item.author?.full_name} url={item.author?.avatar_url} size={item.parent_id ? 32 : 36} />
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ backgroundColor: C.card, borderRadius: 18, borderTopRightRadius: 6, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' }}>
                    <Row gap={6}>
                      <T v="bold" style={{ fontSize: 13 }}>{titledName(item.author?.full_name, item.author?.academic_title, item.author?.title_verified)}</T>
                      <TitleBadge title={item.author?.academic_title} verified={item.author?.title_verified} />
                      {own && <View style={{ backgroundColor: C.primarySoft, borderRadius: 999, paddingHorizontal: 6 }}><T v="tiny" color={C.primary} style={{ fontSize: 10 }}>{t('صاحب المنشور')}</T></View>}
                    </Row>
                    <T v="small">{item.body}</T>
                  </View>
                  <Row gap={12}>
                    <T v="tiny" color={C.muted}>{timeAgo(item.created_at)}</T>
                    {!item.parent_id && <Tap onPress={() => setReplyTo(item)}><T v="tiny" color={C.ink2}>{t('رد')}</T></Tap>}
                    <Tap onPress={() => commentMenu(item)} accessibilityLabel={t('خيارات التعليق')}><T v="tiny" color={C.muted}>•••</T></Tap>
                  </Row>
                </View>
              </Tap>
              </Animated.View>
            );
          }}
          ListEmptyComponent={state === 'ok' ? <T v="small" color={C.muted}>{t('كن أول من يعلّق.')}</T>
            : state === 'loading' ? <PostSkeleton />
            : <Empty icon={<CircleAlert size={28} color={C.muted} />} title={state === 'missing' ? t('المنشور غير موجود') : t('تعذّر التحميل')}
                body={state === 'missing' ? t('ربما حذفه صاحبه أو لا يمكنك رؤيته.') : t('تحقق من اتصالك بالإنترنت وحاول مرة أخرى.')}
                action={state === 'error' ? <Button kind="soft" title={t('حاول مرة أخرى')} onPress={() => { setState('loading'); load(); }} /> : undefined} />}
        />
        {post && <View style={{ backgroundColor: C.card, paddingHorizontal: 12, paddingTop: 8, paddingBottom: insets.bottom + 8, borderTopWidth: 1, borderTopColor: C.line, gap: 6 }}>
          {replyTo && <Row gap={6}><T v="tiny" color={C.muted} style={{ flex: 1 }}>{t('رد على')} {replyTo.author?.full_name}</T><Tap onPress={() => setReplyTo(null)}><T v="tiny" color={C.primary}>{t('إلغاء')}</T></Tap></Row>}
          <Row gap={8}>
            <TextInput keyboardAppearance={isDark ? 'dark' : 'light'} value={draft} onChangeText={setDraft} placeholder={t('اكتب تعليقاً...')} placeholderTextColor={C.faint} multiline
              style={{ flex: 1, minHeight: 46, maxHeight: 110, borderRadius: 23, backgroundColor: C.field, paddingHorizontal: 16, paddingVertical: 11, fontFamily: F.body, fontSize: 15, textAlign: ta, color: C.ink }} accessibilityLabel={t('اكتب تعليقاً')} />
            <Tap onPress={send} disabled={sending || !draft.trim()} accessibilityLabel={t('إرسال')} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: draft.trim() ? C.primary : C.line, alignItems: 'center', justifyContent: 'center' }}>
              <Send size={19} color={C.white} style={isAR ? { transform: [{ scaleX: -1 }] } : undefined} />
            </Tap>
          </Row>
        </View>}
      </KeyboardAvoidingView>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </Screen>
  );
}
