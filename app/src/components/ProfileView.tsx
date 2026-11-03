import { router, useFocusEffect } from 'expo-router';
import { BadgeCheck, BookOpen, Flag, Lock, MessageCircle, Settings, Star } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { LikesSheet } from './LikesSheet';
import { InstagramGlyph, SnapGlyph } from './SocialGlyphs';
import { PostCard } from './PostCard';
import { Avatar, Button, Empty, IconButton, Row, Segmented, T, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, withMine } from '@/lib/posts';
import { supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import type { Post, Profile } from '@/lib/types';
import { nm, t, ta } from '@/lib/i18n';

type Rel = 'none' | 'pending' | 'accepted';

/** Open the Instagram / Snapchat app on that profile, or the website if the app isn't installed. */
export function openSocial(site: 'instagram' | 'snapchat', handle: string) {
  const h = encodeURIComponent(handle);
  const app = site === 'instagram' ? `instagram://user?username=${h}` : `snapchat://add/${h}`;
  const web = site === 'instagram' ? `https://www.instagram.com/${h}/` : `https://www.snapchat.com/add/${h}`;
  Linking.openURL(app).catch(() => Linking.openURL(web).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط'))));
}

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
    const { data } = await supabase.from('profiles').select('*, major:majors(name_ar, name_en), college:colleges(name_ar, name_en), university:universities(name_ar, name_en)').eq('id', userId).single();
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
  // refresh when coming back from edit profile / privacy
  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    if (error) { Alert.alert(t('ما بتقدر تراسله'), error.message.includes('not accepting') ? t('هاد الطالب مسكّر الرسائل من ناس خارج دفعته.') : t('جرّب بعدين.')); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  if (!p) return <View style={{ flex: 1 }} />;
  const canSee = mine || !p.is_private || rel === 'accepted';
  const friends = rel === 'accepted' && followsMe;
  const socialsVisible = mine || (p.socials_visible_to === 'everyone') || (p.socials_visible_to === 'friends' && friends) || (p.socials_visible_to === 'close_friends' && isClose);
  const shown = tab === 0 ? posts : posts.filter((x) => x.category === 'summaries');

  return (
    <>
      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}>
        <View style={{ padding: 18, gap: 14 }}>
          <Row gap={8}>
            <Row gap={6} style={{ flex: 1 }}>
              {p.is_private && <Lock size={15} color={C.muted} />}
              <T v="small" color={C.muted}>{p.is_private ? t('حساب خاص') : t('حساب عام')}</T>
            </Row>
            {mine ? (
              <IconButton label={t('الإعدادات')} onPress={() => router.push('/settings')}><Settings size={21} color={C.ink} /></IconButton>
            ) : (
              <IconButton label={t('إبلاغ')} onPress={() => router.push({ pathname: '/report', params: { type: 'user', id: userId, user: userId } })}><Flag size={19} color={C.ink} /></IconButton>
            )}
          </Row>

          <Row gap={16}>
            <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={86} ring />
            <View style={{ flex: 1, flexDirection: 'row' }}>
              {[[p.post_count, t('منشور'), true], [p.follower_count, t('متابِع'), mine || !p.hide_followers], [p.following_count, t('يتابع'), mine || !p.hide_following]].map(([n, l, vis]) => (
                <Tap key={l as string} haptic={false} scale={0.95} disabled={!vis || l === t('منشور') || !canSee}
                  onPress={() => router.push({ pathname: '/follows', params: { user: userId, type: l === t('متابِع') ? 'followers' : 'following', name: p.full_name } })}
                  style={{ flex: 1, alignItems: 'center' }} accessibilityLabel={l as string}>
                  {vis ? <T style={{ fontFamily: F.display, fontSize: 20 }}>{String(n)}</T> : <Lock size={18} color={C.faint} style={{ height: 30 }} />}
                  <T v="tiny" color={C.muted}>{l as string}</T>
                </Tap>
              ))}
            </View>
          </Row>

          <View style={{ gap: 3 }}>
            <Row gap={6}>
              <T v="h2" style={{ fontFamily: F.display }}>{p.full_name}</T>
              {p.is_verified && <BadgeCheck size={18} color={C.white} fill={C.primary} accessibilityLabel={t('طالب موثّق بحساب الجامعة')} />}
              {friends && <Animated.View entering={FadeIn}><View style={{ backgroundColor: C.greenSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}><T v="tiny" color={C.greenInk}>{t('أصدقاء')}</T></View></Animated.View>}
            </Row>
            {p.username ? <T v="small" color={C.muted} style={{ writingDirection: 'ltr', textAlign: ta }}>@{p.username}</T> : null}
            <T v="small" color={C.ink2}>{[nm(p.major), p.study_year ? t('سنة {0}', [p.study_year]) : null].filter(Boolean).join(t('، '))}</T>
            {p.bio ? <T v="body">{p.bio}</T> : null}
            {p.points > 0 && <Row gap={5}><Star size={14} color="#F59E0B" fill="#F59E0B" /><T v="tiny" color={C.muted}>{p.points} {t('نقطة مساعدة')}</T></Row>}
          </View>

          {mine ? (
            <Row gap={8}>
              <Button kind="soft" title={t('تعديل البروفايل')} onPress={() => router.push('/settings/edit-profile')} style={{ flex: 1, minHeight: 46 }} />
              <Button kind="soft" title={t('الخصوصية')} onPress={() => router.push('/settings/privacy')} style={{ flex: 1, minHeight: 46 }} />
            </Row>
          ) : (
            <Row gap={8}>
              <Button kind={rel === 'none' ? 'primary' : 'soft'} title={rel === 'none' ? t('متابعة') : rel === 'pending' ? t('تم إرسال الطلب') : friends ? t('أصدقاء') : t('تتابعه')} onPress={follow} style={{ flex: 1.4, minHeight: 46 }} />
              <Button kind="white" title={t('رسالة')} icon={<MessageCircle size={18} color={C.ink} />} onPress={message} style={{ flex: 1, minHeight: 46 }} />
              <IconButton label={t('ادرسوا سوا')} onPress={() => router.push('/study')}><BookOpen size={20} color={C.ink} /></IconButton>
            </Row>
          )}

          {socialsVisible && (p.instagram || p.snapchat) && (
            <Animated.View entering={FadeInDown} style={{ flexDirection: 'row', gap: 12 }}>
              {p.instagram && (
                <Tap onPress={() => openSocial('instagram', p.instagram!)} scale={0.9} accessibilityLabel={t('افتح إنستغرام {0}', [p.instagram])} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{ shadowColor: '#E1306C', shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}><InstagramGlyph size={52} /></View>
                  <T v="tiny" color={C.muted}>{t('إنستغرام')}</T>
                </Tap>
              )}
              {p.snapchat && (
                <Tap onPress={() => openSocial('snapchat', p.snapchat!)} scale={0.9} accessibilityLabel={t('افتح سناب {0}', [p.snapchat])} style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{ shadowColor: '#C9B800', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } }}><SnapGlyph size={52} /></View>
                  <T v="tiny" color={C.muted}>{t('سناب')}</T>
                </Tap>
              )}
            </Animated.View>
          )}
        </View>

        {canSee ? (
          <View style={{ paddingHorizontal: 18, gap: 14 }}>
            <Segmented items={[t('المنشورات'), t('الملخصات')]} value={tab} onChange={setTab} />
            {shown.length === 0 ? <Empty title={t('ما في منشورات لهلأ')} /> : shown.map((x) => <PostCard key={x.id} post={x} onLikes={setLikesOf} compact />)}
          </View>
        ) : (
          <View style={{ margin: 18, backgroundColor: C.card, borderRadius: 26, padding: 28, alignItems: 'center', gap: 10 }}>
            <View style={{ width: 60, height: 60, borderRadius: 22, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' }}><Lock size={28} color={C.primary} /></View>
            <T v="h3">{t('هاد الحساب خاص')}</T>
            <T v="small" color={C.muted} style={{ textAlign: 'center' }}>{t('لما يتقبل طلب متابعتك، بتشوف منشوراته وقصصه وحساباته الثانية.')}</T>
          </View>
        )}
      </ScrollView>
      <LikesSheet post={likesOf} onClose={() => setLikesOf(null)} />
    </>
  );
}
