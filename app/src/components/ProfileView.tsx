import { router } from 'expo-router';
import { AtSign, BadgeCheck, BookOpen, Flag, Lock, MessageCircle, Settings, Star } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { LikesSheet } from './LikesSheet';
import { PostCard } from './PostCard';
import { Avatar, Button, Empty, IconButton, Row, Segmented, T, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, withMine } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import type { Post, Profile } from '@/lib/types';

type Rel = 'none' | 'pending' | 'accepted';

export function ProfileView({ userId }: { userId: string }) {
  const { profile: me } = useAuth();
  const mine = me?.id === userId;
  const [p, setP] = useState<Profile | null>(null);
  const [rel, setRel] = useState<Rel>('none');
  const [followsMe, setFollowsMe] = useState(false);
  const [isClose, setIsClose] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [tab, setTab] = useState(0);
  const [likesOf, setLikesOf] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    const { data } = await supabase.from('profiles').select('*, major:majors(name_ar), college:colleges(name_ar), university:universities(name_ar)').eq('id', userId).single();
    setP(data as Profile);
    if (!mine) {
      const [{ data: f }, { data: back }, { data: cf }] = await Promise.all([
        supabase.from('follows').select('status').eq('follower_id', me.id).eq('followee_id', userId).maybeSingle(),
        supabase.from('follows').select('status').eq('follower_id', userId).eq('followee_id', me.id).eq('status', 'accepted').maybeSingle(),
        supabase.from('close_friends').select('friend_id').eq('owner_id', userId).eq('friend_id', me.id).maybeSingle(),
      ]);
      setRel((f?.status as Rel) ?? 'none'); setFollowsMe(!!back); setIsClose(!!cf);
    }
    const { data: ps } = await supabase.from('posts').select(POST_SELECT).eq('author_id', userId).order('created_at', { ascending: false }).limit(30);
    setPosts(await withMine((ps ?? []) as unknown as Post[], me.id));
    setLoading(false);
  }, [me, userId, mine]);

  useEffect(() => { load(); }, [load]);

  async function follow() {
    if (!me) return;
    if (rel === 'none') {
      const { error } = await supabase.from('follows').insert({ follower_id: me.id, followee_id: userId });
      if (!error) setRel(p?.is_private ? 'pending' : 'accepted');
    } else {
      await supabase.from('follows').delete().eq('follower_id', me.id).eq('followee_id', userId);
      setRel('none');
    }
  }

  async function message() {
    const { data, error } = await supabase.rpc('start_direct', { target: userId, context: null });
    if (error) { Alert.alert('ما بتقدر تراسله', error.message.includes('not accepting') ? 'هاد الطالب مسكّر الرسائل من ناس خارج دفعته.' : 'جرّب بعدين.'); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  if (!p) return <View style={{ flex: 1 }} />;
  const canSee = mine || !p.is_private || rel === 'accepted';
  const friends = rel === 'accepted' && followsMe;
  const socialsVisible = mine || (p.socials_visible_to === 'everyone') || (p.socials_visible_to === 'friends' && friends) || (p.socials_visible_to === 'close_friends' && isClose);
  const shown = tab === 0 ? posts : posts.filter((x) => x.category === 'summaries');

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={{ padding: 18, gap: 14 }}>
          <Row gap={8}>
            <Row gap={6} style={{ flex: 1 }}>
              {p.is_private && <Lock size={15} color={C.muted} />}
              <T v="small" color={C.muted}>{p.is_private ? 'حساب خاص' : 'حساب عام'}</T>
            </Row>
            {mine ? (
              <IconButton label="الإعدادات" onPress={() => router.push('/settings')}><Settings size={21} color={C.ink} /></IconButton>
            ) : (
              <IconButton label="إبلاغ" onPress={() => router.push({ pathname: '/report', params: { type: 'user', id: userId, user: userId } })}><Flag size={19} color={C.ink} /></IconButton>
            )}
          </Row>

          <Row gap={16}>
            <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={86} ring />
            <View style={{ flex: 1, flexDirection: 'row' }}>
              {[[p.post_count, 'منشور', true], [p.follower_count, 'متابِع', mine || !p.hide_followers], [p.following_count, 'يتابع', mine || !p.hide_following]].map(([n, l, vis]) => (
                <View key={l as string} style={{ flex: 1, alignItems: 'center' }}>
                  {vis ? <T style={{ fontFamily: F.display, fontSize: 20 }}>{String(n)}</T> : <Lock size={18} color={C.faint} style={{ height: 30 }} />}
                  <T v="tiny" color={C.muted}>{l as string}</T>
                </View>
              ))}
            </View>
          </Row>

          <View style={{ gap: 3 }}>
            <Row gap={6}>
              <T v="h2" style={{ fontFamily: F.display }}>{p.full_name}</T>
              <BadgeCheck size={18} color={C.white} fill={C.primary} accessibilityLabel="طالب موثّق" />
              {friends && <Animated.View entering={FadeIn}><View style={{ backgroundColor: C.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><T v="tiny" color={C.greenInk}>أصدقاء</T></View></Animated.View>}
            </Row>
            <T v="small" color={C.ink2}>{[p.major?.name_ar, p.study_year ? `سنة ${p.study_year}` : null].filter(Boolean).join('، ')}</T>
            {p.bio ? <T v="body">{p.bio}</T> : null}
            {p.points > 0 && <Row gap={5}><Star size={14} color="#F59E0B" fill="#F59E0B" /><T v="tiny" color={C.muted}>{p.points} نقطة مساعدة</T></Row>}
          </View>

          {mine ? (
            <Row gap={8}>
              <Button kind="soft" title="تعديل البروفايل" onPress={() => router.push('/settings/edit-profile')} style={{ flex: 1, minHeight: 46 }} />
              <Button kind="soft" title="الخصوصية" onPress={() => router.push('/settings/privacy')} style={{ flex: 1, minHeight: 46 }} />
            </Row>
          ) : (
            <Row gap={8}>
              <Button kind={rel === 'none' ? 'primary' : 'soft'} title={rel === 'none' ? 'متابعة' : rel === 'pending' ? 'تم إرسال الطلب' : friends ? 'أصدقاء' : 'تتابعه'} onPress={follow} style={{ flex: 1.4, minHeight: 46 }} />
              <Button kind="white" title="رسالة" icon={<MessageCircle size={18} color={C.ink} />} onPress={message} style={{ flex: 1, minHeight: 46 }} />
              <IconButton label="ادرسوا سوا" onPress={() => router.push('/study')}><BookOpen size={20} color={C.ink} /></IconButton>
            </Row>
          )}

          {socialsVisible && (p.instagram || p.snapchat) && (
            <Animated.View entering={FadeInDown}>
              <Row gap={8}>
                {p.instagram && (
                  <Tap onPress={() => Linking.openURL(`https://instagram.com/${p.instagram}`)} style={{ flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: '#E1306C', alignItems: 'center', justifyContent: 'center' }}><AtSign size={16} color={C.white} /></View>
                    <T v="small" numberOfLines={1}>{p.instagram}</T>
                  </Tap>
                )}
                {p.snapchat && (
                  <Tap onPress={() => Linking.openURL(`https://snapchat.com/add/${p.snapchat}`)} style={{ flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 9, backgroundColor: '#FFFC00', alignItems: 'center', justifyContent: 'center' }}><AtSign size={16} color={C.ink} /></View>
                    <T v="small" numberOfLines={1}>{p.snapchat}</T>
                  </Tap>
                )}
              </Row>
            </Animated.View>
          )}
        </View>

        {canSee ? (
          <View style={{ paddingHorizontal: 18, gap: 14 }}>
            <Segmented items={['المنشورات', 'الملخصات']} value={tab} onChange={setTab} />
            {shown.length === 0 ? <Empty title="ما في منشورات لهلأ" /> : shown.map((x) => <PostCard key={x.id} post={x} onLikes={setLikesOf} compact />)}
          </View>
        ) : (
          <View style={{ margin: 18, backgroundColor: C.white, borderRadius: 26, padding: 28, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 60, height: 60, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Lock size={28} color={C.primary} /></View>
            <T v="h3">هاد الحساب خاص</T>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>لما يتقبل طلب متابعتك، بتشوف منشوراته وقصصه وحساباته الثانية.</T>
          </View>
        )}
      </ScrollView>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </>
  );
}
