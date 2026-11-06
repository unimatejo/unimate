import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { AtSign, Bell, GraduationCap, Heart, MessageCircle, UserPlus } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, SectionList, RefreshControl, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { titledName } from '@/components/profile/TitleBadge';
import { Avatar, Empty, Header, Screen, T, Tap } from '@/components/ui';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { useAuth } from '@/lib/auth';
import { mediaUrl, supabase, photoWidth } from '@/lib/supabase';
import { C, F, R } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { isAR, nm, t } from '@/lib/i18n';
import { run } from '@/lib/run';
import { readCache, writeCache } from '@/lib/cache';

// Server-made notification texts are Arabic; show them in English when the app is in English.
const NOTE_EN: [RegExp, string][] = [
  [/^حدا /, 'Someone '], [/ عجبه منشورك$/, ' liked your post'], [/ علّق على منشورك$/, ' commented on your post'],
  [/ صار يتابعك$/, ' started following you'], [/ قبل طلب متابعتك$/, ' accepted your follow request'],
  [/^لقينا تبديل مطابق$/, 'We found a matching swap'], [/^في حدا بدّه نفس التبديل بالعكس$/, 'Someone wants the same swap the other way'],
];
function localizeNote(s: string) { return isAR ? s : NOTE_EN.reduce((x, [re, en]) => x.replace(re, en), s); }

type N = { id: string; kind: string; title: string; body: string | null; data: Record<string, string>; read_at: string | null; created_at: string; actor_id?: string | null };
type FR = { follower_id: string; profile: { id: string; full_name: string; avatar_url: string | null; major: { name_ar: string } | null } | null };
type P = { id: string; full_name: string | null; avatar_url: string | null; academic_title?: string | null; title_verified?: boolean };

type Filter = 'all' | 'follow' | 'act' | 'uni';
const FOLLOW = ['follow', 'follow_request', 'follow_accept'];
const ACT = ['like', 'comment', 'mention', 'story_like', 'story_reply', 'reply'];
const kindOf = (k: string): Exclude<Filter, 'all'> => (FOLLOW.includes(k) ? 'follow' : ACT.includes(k) ? 'act' : 'uni');

// the small badge on the avatar: what happened
const BADGE: Record<string, [typeof Bell, string]> = {
  follow: [UserPlus, '#2E5BFF'], like: [Heart, '#FF5470'], story_like: [Heart, '#FF5470'], comment: [MessageCircle, '#0D9488'], reply: [MessageCircle, '#0D9488'],
  story_reply: [MessageCircle, '#0D9488'], mention: [AtSign, '#6A3BE0'],
};

const DAY = 86400000;
function bucket(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return 0;
  return now.getTime() - d.getTime() < 7 * DAY ? 1 : 2;
}

function Thumb({ path }: { path: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { mediaUrl('posts', path, photoWidth(46)).then(setUri); }, [path]);
  return <View style={{ width: 46, height: 46, borderRadius: 12, overflow: 'hidden', backgroundColor: C.soft }}>{uri && <Image source={{ uri }} style={{ width: 46, height: 46 }} contentFit="cover" transition={150} />}</View>;
}

export default function Notifications() {
  const { profile } = useAuth();
  // opens with last time's list, then refreshes quietly
  type Saved = { items: N[]; reqs: FR[]; people: Record<string, P>; following: Record<string, 'accepted' | 'pending'>; ringed: string[]; thumbs: Record<string, string> };
  const cacheKey = profile ? `notifs:${profile.id}` : null;
  const seen = readCache<Saved>(cacheKey);
  const [items, setItems] = useState<N[]>(seen?.items ?? []);
  const [reqs, setReqs] = useState<FR[]>(seen?.reqs ?? []);
  const [people, setPeople] = useState<Record<string, P>>(seen?.people ?? {});
  const [following, setFollowing] = useState<Record<string, 'accepted' | 'pending'>>(seen?.following ?? {});
  const [ringed, setRinged] = useState<Set<string>>(new Set(seen?.ringed ?? []));
  const [thumbs, setThumbs] = useState<Record<string, string>>(seen?.thumbs ?? {});
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(!seen);
  const [showReqs, setShowReqs] = useState(false);

  const load = useCallback(async () => {
    if (!profile) return;
    if (!readCache(cacheKey)) setLoading(true);
    const [{ data: n }, { data: f }] = await Promise.all([
      // app errors live in the admin panel (أخطاء التطبيق), never in the notifications list
      supabase.from('notifications').select('*').eq('user_id', profile.id).neq('kind', 'admin_alert').order('created_at', { ascending: false }).limit(80),
      supabase.from('follows').select('follower_id, profile:profiles!follows_follower_id_fkey(id, full_name, avatar_url, major:majors!profiles_major_id_fkey(name_ar, name_en))').eq('followee_id', profile.id).eq('status', 'pending'),
    ]);
    const list = (n ?? []) as N[];
    const actors = [...new Set(list.map((x) => x.actor_id ?? x.data?.user_id).filter(Boolean) as string[])];
    const postIds = [...new Set(list.map((x) => x.data?.post_id).filter(Boolean) as string[])];
    const [{ data: ps }, { data: fl }, { data: st }, { data: md }] = await Promise.all([
      actors.length ? supabase.from('profiles').select('id, full_name, avatar_url, academic_title, title_verified').in('id', actors) : Promise.resolve({ data: [] }),
      actors.length ? supabase.from('follows').select('followee_id, status').eq('follower_id', profile.id).in('followee_id', actors) : Promise.resolve({ data: [] }),
      actors.length ? supabase.from('stories').select('author_id').in('author_id', actors).gt('expires_at', new Date().toISOString()) : Promise.resolve({ data: [] }),
      postIds.length ? supabase.from('post_media').select('post_id, url, position').in('post_id', postIds).eq('kind', 'image').order('position') : Promise.resolve({ data: [] }),
    ]);
    const saved: Saved = {
      items: list, reqs: (f ?? []) as unknown as FR[],
      people: Object.fromEntries(((ps ?? []) as P[]).map((p) => [p.id, p])),
      following: Object.fromEntries(((fl ?? []) as { followee_id: string; status: 'accepted' | 'pending' }[]).map((x) => [x.followee_id, x.status])),
      ringed: ((st ?? []) as { author_id: string }[]).map((x) => x.author_id), thumbs: {},
    };
    setPeople(saved.people);
    setFollowing(saved.following);
    setRinged(new Set(saved.ringed));
    const th: Record<string, string> = {};
    for (const m of (md ?? []) as { post_id: string; url: string }[]) if (!th[m.post_id]) th[m.post_id] = m.url;
    setThumbs(th);
    setItems(list); setReqs(saved.reqs); setLoading(false);
    // saved as read: the dots are for things that are new since then
    writeCache(cacheKey, { ...saved, thumbs: th, items: list.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() })) });
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', profile.id).is('read_at', null);
    // the dots disappear on screen too, after a moment so you can see what is new
    if (!error) setTimeout(() => setItems((x) => x.map((i) => (i.read_at ? i : { ...i, read_at: new Date().toISOString() }))), 2500);
  }, [profile, cacheKey]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [busy, setBusy] = useState<string | null>(null);
  async function answer(r: FR, accept: boolean) {
    if (!profile || busy) return;
    setBusy(r.follower_id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    const res = accept
      ? await run(supabase.from('follows').update({ status: 'accepted' }).eq('follower_id', r.follower_id).eq('followee_id', profile.id))
      : await run(supabase.from('follows').delete().eq('follower_id', r.follower_id).eq('followee_id', profile.id));
    setBusy(null);
    if (res.ok) setReqs((x) => x.filter((y) => y.follower_id !== r.follower_id));
  }

  /** Follow back / unfollow straight from the notification. */
  async function toggleFollow(uid: string) {
    if (!profile || busy) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    const was = following[uid];
    setBusy(uid);
    if (was) {
      setFollowing((f) => { const c = { ...f }; delete c[uid]; return c; });
      const r = await run(supabase.from('follows').delete().eq('follower_id', profile.id).eq('followee_id', uid));
      if (!r.ok) setFollowing((f) => ({ ...f, [uid]: was }));
    } else {
      setFollowing((f) => ({ ...f, [uid]: 'accepted' }));
      const { data, error } = await supabase.from('follows').insert({ follower_id: profile.id, followee_id: uid }).select('status').single();
      if (error) setFollowing((f) => { const c = { ...f }; delete c[uid]; return c; });
      else setFollowing((f) => ({ ...f, [uid]: (data?.status as 'accepted' | 'pending') ?? 'accepted' }));
    }
    setBusy(null);
  }

  /** Where each kind of notification takes you. */
  function open(n: N) {
    const d = n.data ?? {};
    if (n.kind === 'ride') return router.push(d.ride_id ? { pathname: '/rides/[id]', params: { id: String(d.ride_id) } } as never : '/rides' as never);
    if (n.kind === 'announcement') return router.push('/announcements');
    if (n.kind === 'swap_match') return router.push('/swap');
    // app broke / content waiting for review: straight to the right admin screen
    if (n.kind === 'admin_alert') return router.push((typeof d.url === 'string' && d.url.startsWith('/admin') ? d.url : '/admin/errors') as never);
    if (['exam', 'lecture', 'assignment', 'event', 'summary'].includes(n.kind)) return router.push('/(tabs)/schedule');
    if ((n.kind === 'message' || n.kind === 'call') && d.conversation_id) return router.push({ pathname: '/messages/[id]', params: { id: d.conversation_id } });
    if (n.kind === 'message_request') return router.push('/messages/requests');
    if (n.kind === 'study' || n.kind === 'study_request') return router.push('/study');
    if (d.post_id) return router.push({ pathname: '/post/[id]', params: { id: d.post_id } });
    if (d.user_id) return router.push({ pathname: '/user/[id]', params: { id: d.user_id } });
    if (n.actor_id) return router.push({ pathname: '/user/[id]', params: { id: n.actor_id } });
  }

  const sections = useMemo(() => {
    const shown = items.filter((n) => filter === 'all' || kindOf(n.kind) === filter);
    const titles = [t('اليوم'), t('هذا الأسبوع'), t('أقدم')];
    const g: N[][] = [[], [], []];
    for (const n of shown) g[bucket(n.created_at)].push(n);
    return g.map((data, i) => ({ title: titles[i], data })).filter((s) => s.data.length);
  }, [items, filter]);

  const FILTERS: [Filter, string][] = [['all', t('الكل')], ['follow', t('المتابعات')], ['act', t('التفاعلات')], ['uni', t('الجامعة')]];

  function renderRow(n: N) {
    const uid = n.actor_id ?? n.data?.user_id ?? null;
    const who = uid ? people[uid] : undefined;
    const k = kindOf(n.kind);
    const [Icon, color] = BADGE[n.kind] ?? (k === 'uni' ? [GraduationCap, C.primary] : [Bell, C.primary]);
    const title = localizeNote(n.title);
    const name = titledName(who?.full_name, who?.academic_title, who?.title_verified);
    const rest = name && title.startsWith(name) ? title.slice(name.length) : null;
    const isFollow = n.kind === 'follow' && !!uid;
    const fs = uid ? following[uid] : undefined;
    const thumb = n.data?.post_id ? thumbs[n.data.post_id] : undefined;
    const ring = !!uid && ringed.has(uid);
    return (
      <Tap scale={0.985} haptic={false} onPress={() => open(n)} accessibilityRole="button"
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: n.read_at ? 'transparent' : C.primarySoft }}>
        <Tap haptic={false} scale={0.94} disabled={!uid} onPress={() => uid && router.push({ pathname: '/user/[id]', params: { id: uid } })} accessibilityLabel={name || t('الملف')}>
          <View style={{ width: 50, height: 50, borderRadius: 25, padding: 2, borderWidth: 2, borderColor: ring ? C.primary : 'transparent' }}>
            {uid ? <Avatar id={uid} name={who?.full_name} url={who?.avatar_url} size={42} /> : (
              <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: C.soft, alignItems: 'center', justifyContent: 'center' }}><GraduationCap size={20} color={C.ink} /></View>
            )}
            <View style={{ position: 'absolute', bottom: -2, left: -2, width: 22, height: 22, borderRadius: 11, backgroundColor: color, borderWidth: 2, borderColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={11} color={color === C.primary ? C.onPrimary : '#FFFFFF'} strokeWidth={2.6} />
            </View>
          </View>
        </Tap>
        <T v="small" style={{ flex: 1, lineHeight: 21 }}>
          {rest !== null ? <><T v="bold" style={{ fontSize: 14 }}>{name}</T>{rest}</> : <T v="bold" style={{ fontSize: 14 }}>{title}</T>}
          {n.body ? <T v="small">{` ${localizeNote(n.body)}`}</T> : null}
          <T v="small" color={C.muted}>{`  ${timeAgo(n.created_at)}`}</T>
        </T>
        {isFollow ? (
          <Tap onPress={() => toggleFollow(uid!)} disabled={busy === uid} accessibilityRole="button"
            style={{ minHeight: 36, minWidth: 92, paddingHorizontal: 14, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: fs ? C.soft : C.primary }}>
            <T v="bold" style={{ fontSize: 13 }} color={fs ? C.ink : C.onPrimary}>{fs === 'pending' ? t('مطلوب') : fs ? t('تتابعه') : t('تابِع بالمثل')}</T>
          </Tap>
        ) : thumb ? <Thumb path={thumb} /> : null}
      </Tap>
    );
  }

  const first = reqs[0]?.profile, second = reqs[1]?.profile;
  return (
    <Screen>
      <Header title={t('الإشعارات')} />
      <SectionList
        sections={sections}
        keyExtractor={(n) => n.id}
        stickySectionHeadersEnabled={false}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={C.primary} />}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListHeaderComponent={
          <View style={{ gap: 10, paddingBottom: 4 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {FILTERS.map(([k, label]) => {
                const on = filter === k;
                return (
                  <Tap key={k} onPress={() => setFilter(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
                    style={{ minHeight: 36, paddingHorizontal: 16, borderRadius: R.pill, justifyContent: 'center', backgroundColor: on ? C.inverse : 'transparent', borderWidth: 1, borderColor: on ? C.inverse : C.line }}>
                    <T v="bold" style={{ fontSize: 13 }} color={on ? C.onInverse : C.ink}>{label}</T>
                  </Tap>
                );
              })}
            </ScrollView>
            {reqs.length > 0 && (filter === 'all' || filter === 'follow') && (
              <View style={{ marginHorizontal: 16, borderRadius: R.lg, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, overflow: 'hidden' }}>
                <Tap scale={0.99} onPress={() => setShowReqs((v) => !v)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 14 }}>
                  <View style={{ width: 48, height: 42 }}>
                    <View style={{ position: 'absolute', top: 0, right: 0, borderRadius: 18, borderWidth: 2, borderColor: C.card }}><Avatar id={reqs[0].follower_id} name={first?.full_name} url={first?.avatar_url} size={32} /></View>
                    {second && <View style={{ position: 'absolute', bottom: 0, left: 0, borderRadius: 18, borderWidth: 2, borderColor: C.card }}><Avatar id={reqs[1].follower_id} name={second.full_name} url={second.avatar_url} size={32} /></View>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <T v="bold" style={{ fontSize: 14 }}>{t('طلبات المتابعة')}</T>
                    <T v="tiny" color={C.muted}>{reqs.length === 1 ? (first?.full_name ?? '') : t('{0} و{1} غيرهم', [first?.full_name ?? '', reqs.length - 1])}</T>
                  </View>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.primary }} />
                </Tap>
                {showReqs && reqs.map((r) => (
                  <Animated.View key={r.follower_id} entering={FadeIn.duration(250)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                    <Tap haptic={false} accessibilityLabel={r.profile?.full_name ?? t('بروفايل')} onPress={() => router.push({ pathname: '/user/[id]', params: { id: r.follower_id } })}><Avatar id={r.follower_id} name={r.profile?.full_name} url={r.profile?.avatar_url} size={42} /></Tap>
                    <View style={{ flex: 1 }}>
                      <T v="bold" style={{ fontSize: 14 }} numberOfLines={1}>{r.profile?.full_name}</T>
                      <T v="tiny" color={C.muted} numberOfLines={1}>{nm(r.profile?.major)}</T>
                    </View>
                    <Tap onPress={() => answer(r, true)} disabled={!!busy} accessibilityRole="button" style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.primary, justifyContent: 'center' }}>
                      <T v="bold" style={{ fontSize: 13 }} color={C.onPrimary}>{t('قبول')}</T>
                    </Tap>
                    <Tap onPress={() => answer(r, false)} disabled={!!busy} accessibilityRole="button" style={{ minHeight: 36, paddingHorizontal: 14, borderRadius: R.pill, backgroundColor: C.soft, justifyContent: 'center' }}>
                      <T v="bold" style={{ fontSize: 13 }}>{t('حذف')}</T>
                    </Tap>
                  </Animated.View>
                ))}
              </View>
            )}
          </View>
        }
        renderSectionHeader={({ section }) => <T v="bold" style={{ fontSize: 15, fontFamily: F.title, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>{section.title}</T>}
        renderItem={({ item }) => renderRow(item)}
        ListEmptyComponent={loading ? <ListSkeleton n={7} /> : reqs.length ? undefined : (
          <Empty icon={<Bell size={28} color={C.primary} />} title={t('ما في إشعارات')} body={t('بنخبرك هون بالمحاضرات والامتحانات والتبديلات والتعليقات.')} />
        )}
      />
    </Screen>
  );
}
