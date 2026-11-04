import { router, useFocusEffect } from 'expo-router';
import { BadgeCheck, BarChart3, BookOpen, FileText, Flag, Grid3x3, Lock, MessageCircle, Rows3, Settings, Star, UserX, WifiOff } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, RefreshControl, ScrollView, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { LikesSheet } from './LikesSheet';
import { InstagramGlyph, SnapGlyph } from './SocialGlyphs';
import { PostCard } from './PostCard';
import { Avatar, Button, Empty, IconButton, Row, T, Tap } from './ui';
import { useAuth } from '@/lib/auth';
import { POST_SELECT, withMine } from '@/lib/posts';
import { mediaUrl, supabase } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import type { Post, Profile } from '@/lib/types';
import { nm, t, ta } from '@/lib/i18n';
import { Bone } from './Skeleton';
import { run } from '@/lib/run';

type Rel = 'none' | 'pending' | 'accepted';

/** Open the Instagram / Snapchat app on that profile, or the website if the app isn't installed. */
export function openSocial(site: 'instagram' | 'snapchat', handle: string) {
  // people paste "@name", full links or spaces — keep only the handle
  const clean = handle.trim().replace(/^https?:\/\/(www\.)?(instagram\.com|snapchat\.com\/add)\//i, '').replace(/^@/, '').split(/[/?#\s]/)[0];
  if (!clean) return;
  const h = encodeURIComponent(clean);
  const app = site === 'instagram' ? `instagram://user?username=${h}` : `snapchat://add/${h}`;
  const web = site === 'instagram' ? `https://www.instagram.com/${h}/` : `https://www.snapchat.com/add/${h}`;
  Linking.openURL(app).catch(() => Linking.openURL(web).catch(() => Alert.alert(t('ما قدرنا نفتح الرابط'))));
}

const TILE_G: [string, string][] = [['#6E95FF', '#2E5BFF'], ['#FF8FB1', '#E0306B'], ['#5EE3A1', '#0E9F6E'], ['#FFB86B', '#FF6B2C'], ['#B794FF', '#7C3AED']];

/** One square in the profile grid: the photo, or a colored card with the text. */
function HighlightBubble({ h, owner }: { h: { id: string; title: string; cover_url: string | null }; owner: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { if (h.cover_url) mediaUrl('stories', h.cover_url).then(setUri); }, [h.cover_url]);
  return (
    <Tap onPress={() => router.push({ pathname: '/story/[id]', params: { id: owner, highlight: h.id } })} style={{ alignItems: 'center', gap: 5, width: 70 }} accessibilityLabel={h.title}>
      <View style={{ width: 64, height: 64, borderRadius: 32, padding: 2.5, borderWidth: 1.5, borderColor: C.line }}>
        <View style={{ flex: 1, borderRadius: 30, overflow: 'hidden', backgroundColor: C.soft }}>{uri && <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" />}</View>
      </View>
      <T v="tiny" numberOfLines={1}>{h.title}</T>
    </Tap>
  );
}

export function GridTile({ post, i }: { post: Post; i: number }) {
  const img = (post.media ?? []).find((m) => m.kind === 'image');
  const file = (post.media ?? []).some((m) => m.kind === 'file');
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { if (img) mediaUrl('posts', img.url).then(setUri); }, [img]);
  return (
    <Tap haptic={false} scale={0.97} onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })} style={{ width: '33.333%', aspectRatio: 1, padding: 1.5 }} accessibilityLabel={post.title ?? post.body.slice(0, 40)}>
      <View style={{ flex: 1, borderRadius: 6, overflow: 'hidden', backgroundColor: C.soft }}>
        {img ? (uri ? <Image source={{ uri }} style={{ flex: 1 }} contentFit="cover" transition={150} /> : null) : (
          <LinearGradient colors={TILE_G[i % TILE_G.length]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, padding: 8, justifyContent: 'center' }}>
            <T v="tiny" color="#fff" numberOfLines={5} style={{ fontSize: 11, lineHeight: 16 }}>{post.title || post.body}</T>
          </LinearGradient>
        )}
        {(file || post.poll) && (
          <View style={{ position: 'absolute', top: 5, right: 5, width: 20, height: 20, borderRadius: 6, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' }}>
            {file ? <FileText size={12} color="#fff" /> : <BarChart3 size={12} color="#fff" />}
          </View>
        )}
      </View>
    </Tap>
  );
}

export function ProfileView({ userId, onTitle }: { userId: string; onTitle?: (title: string) => void }) {
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
  const [hasStory, setHasStory] = useState(false);
  const [hls, setHls] = useState<{ id: string; title: string; cover_url: string | null }[]>([]);
  const [failed, setFailed] = useState<'none' | 'error' | 'missing'>('none');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!me) return;
    setLoading(true);
    try {
    const { data, error } = await supabase.from('profiles').select('*, major:majors(name_ar, name_en), college:colleges(name_ar, name_en), university:universities(name_ar, name_en)').eq('id', userId).maybeSingle();
    if (error) { setFailed('error'); return; }
    if (!data) { setFailed('missing'); return; }
    setFailed('none');
    setP(data as Profile);
    onTitle?.((data as Profile).username ? `\u200E@${(data as Profile).username}` : (data as Profile).full_name ?? '');
    if (!mine) {
      const [{ data: f }, { data: back }, { data: cf }] = await Promise.all([
        supabase.from('follows').select('status').eq('follower_id', me.id).eq('followee_id', userId).maybeSingle(),
        supabase.from('follows').select('status').eq('follower_id', userId).eq('followee_id', me.id).eq('status', 'accepted').maybeSingle(),
        supabase.from('close_friends').select('friend_id').eq('owner_id', userId).eq('friend_id', me.id).maybeSingle(),
      ]);
      setRel((f?.status as Rel) ?? 'none'); setFollowsMe(!!back); setIsClose(!!cf);
    }
    const { count: sc } = await supabase.from('stories').select('id', { count: 'exact', head: true }).eq('author_id', userId).gt('expires_at', new Date().toISOString());
    setHasStory((sc ?? 0) > 0);
    supabase.from('highlights').select('id, title, cover_url').eq('owner_id', userId).order('position').then(({ data }) => setHls(data ?? []));
    const { data: ps } = await supabase.from('posts').select(POST_SELECT).eq('author_id', userId).order('created_at', { ascending: false }).limit(30);
    setPosts(await withMine((ps ?? []) as unknown as Post[], me.id));
    } catch { setFailed((f) => (f === 'none' && !p ? 'error' : f)); }
    finally { setLoading(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, userId, mine]);

  useEffect(() => { load(); }, [load]);
  // refresh when coming back from edit profile / privacy
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const bump = (d: number) => setP((x) => (x ? { ...x, follower_count: Math.max(0, (x.follower_count ?? 0) + d) } : x));

  async function doFollow() {
    if (!me || busy) return;
    setBusy(true);
    try {
      if (rel === 'none') {
        const next: Rel = p?.is_private ? 'pending' : 'accepted';
        setRel(next); if (next === 'accepted') bump(1);
        const r = await run(supabase.from('follows').insert({ follower_id: me.id, followee_id: userId }));
        if (!r.ok) { setRel('none'); if (next === 'accepted') bump(-1); }
      } else {
        const prev = rel;
        setRel('none'); if (prev === 'accepted') bump(-1);
        const r = await run(supabase.from('follows').delete().eq('follower_id', me.id).eq('followee_id', userId));
        if (!r.ok) { setRel(prev); if (prev === 'accepted') bump(1); }
      }
    } finally { setBusy(false); }
  }

  function follow() {
    if (rel === 'none') return doFollow();
    const title = rel === 'pending' ? t('تلغي طلب المتابعة؟') : t('تلغي متابعة {0}؟', [p?.full_name ?? '']);
    Alert.alert(title, p?.is_private && rel === 'accepted' ? t('حسابه خاص، رح تحتاج تبعث طلب جديد لتشوف منشوراته.') : undefined, [
      { text: t('إلغاء'), style: 'cancel' },
      { text: rel === 'pending' ? t('إلغاء الطلب') : t('إلغاء المتابعة'), style: 'destructive', onPress: doFollow },
    ]);
  }

  async function message() {
    const { data, error } = await supabase.rpc('start_direct', { target: userId, context: null });
    if (error) { Alert.alert(t('ما بتقدر تراسله'), error.message.includes('not accepting') ? t('هاد الطالب مسكّر الرسائل من ناس خارج دفعته.') : t('جرّب بعدين.')); return; }
    router.push({ pathname: '/messages/[id]', params: { id: data as string } });
  }

  if (!p && failed !== 'none') return (
    <View style={{ flex: 1, padding: 24, paddingTop: 60 }}>
      <Empty icon={failed === 'missing' ? <UserX size={28} color={C.muted} /> : <WifiOff size={28} color={C.muted} />} title={failed === 'missing' ? t('هالحساب مش موجود') : t('ما قدرنا نفتح البروفايل')}
        body={failed === 'missing' ? t('يمكن انحذف أو الرابط غلط.') : t('تأكد من الإنترنت وجرّب كمان مرة.')}
        action={failed === 'error' ? <Button kind="soft" title={t('جرّب مرة ثانية')} onPress={load} style={{ paddingHorizontal: 28 }} /> : undefined} />
    </View>
  );
  if (!p) return (
    <View style={{ flex: 1, padding: 18, gap: 16 }}>
      <Row gap={16}><Bone w={86} h={86} r={43} /><View style={{ flex: 1, gap: 10 }}><Bone h={18} w="70%" /><Bone h={12} w="50%" /></View></Row>
      <Bone h={16} w="40%" /><Bone h={12} w="60%" />
      <Row gap={8}><Bone h={46} r={14} style={{ flex: 1 }} /><Bone h={46} r={14} style={{ flex: 1 }} /></Row>
    </View>
  );
  const canSee = mine || !p.is_private || rel === 'accepted';
  const friends = rel === 'accepted' && followsMe;
  const socialsVisible = mine || (p.socials_visible_to === 'everyone') || (p.socials_visible_to === 'friends' && friends) || (p.socials_visible_to === 'close_friends' && isClose);
  const shown = tab === 2 ? posts.filter((x) => x.category === 'summaries') : posts;

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
            <Tap haptic={false} scale={0.95} disabled={!hasStory} onPress={() => router.push({ pathname: '/story/[id]', params: { id: p.id } })} accessibilityLabel={hasStory ? t('شوف قصته') : p.full_name}>
              {hasStory ? (
                <LinearGradient colors={['#FFB547', '#FF4F7B', '#7C3AED']} start={{ x: 0, y: 1 }} end={{ x: 1, y: 0 }} style={{ padding: 3, borderRadius: 50 }}>
                  <View style={{ padding: 3, borderRadius: 48, backgroundColor: C.bg }}><Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={82} /></View>
                </LinearGradient>
              ) : <Avatar id={p.id} name={p.full_name} url={p.avatar_url} size={86} ring />}
            </Tap>
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
              <Button kind={rel === 'none' ? 'primary' : 'soft'} title={rel === 'none' ? t('متابعة') : rel === 'pending' ? t('تم إرسال الطلب') : friends ? t('أصدقاء') : t('تتابعه')} onPress={follow} loading={busy} disabled={busy} style={{ flex: 1.4, minHeight: 46 }} />
              <Button kind="white" title={t('رسالة')} icon={<MessageCircle size={18} color={C.ink} />} onPress={message} style={{ flex: 1, minHeight: 46 }} />
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
          {canSee && hls.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {hls.map((h) => <HighlightBubble key={h.id} h={h} owner={userId} />)}
            </ScrollView>
          )}
        </View>

        {canSee ? (
          <View style={{ gap: 10 }}>
            <Row style={{ borderBottomWidth: 0.5, borderBottomColor: C.line }}>
              {[[Grid3x3, t('المنشورات')], [Rows3, t('القائمة')], [BookOpen, t('الملخصات')]].map(([Icon, label], i) => {
                const I = Icon as typeof Grid3x3;
                return (
                  <Tap key={i} haptic={false} onPress={() => setTab(i)} accessibilityRole="tab" accessibilityLabel={label as string} accessibilityState={{ selected: tab === i }}
                    style={{ flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: tab === i ? C.ink : 'transparent' }}>
                    <I size={22} color={tab === i ? C.ink : C.faint} />
                  </Tap>
                );
              })}
            </Row>
            {shown.length === 0 ? <Empty title={t('ما في منشورات لهلأ')} />
              : tab === 0 ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 1.5 }}>
                  {shown.map((x, i) => <GridTile key={x.id} post={x} i={i} />)}
                </View>
              ) : (
                <View style={{ paddingHorizontal: 18, gap: 14 }}>{shown.map((x) => <PostCard key={x.id} post={x} onLikes={setLikesOf} compact />)}</View>
              )}
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
