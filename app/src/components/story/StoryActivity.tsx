import { Image } from 'expo-image';
import { router } from 'expo-router';
import { Eye, Heart, MessageCircle, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { SheetModal } from '@/components/chat/ChatExtras';
import { ListSkeleton } from '@/components/ui/Skeleton';
import { Avatar, Row, T, Tap } from '@/components/ui';
import { mediaUrl, supabase, photoWidth } from '@/lib/supabase';
import { C, F } from '@/lib/theme';
import { timeAgo } from '@/lib/util';
import { t } from '@/lib/i18n';

type Story = { id: string; media_url: string; kind: string };
type Person = { full_name: string; avatar_url: string | null; username?: string | null };
export type StoryViewer = { viewer_id: string; liked: boolean; viewed_at?: string | null; p: Person | null };
type Reply = { id: string; conversation_id: string; sender_id: string; body: string | null; created_at: string; p?: Person | null };

/** The pill at the bottom of your own story: the first viewers' faces and how many saw it. Tap or swipe up for the details. */
export function ActivityChip({ viewers, onOpen }: { viewers: StoryViewer[]; onOpen: () => void }) {
  const faces = viewers.slice(0, 3);
  const likes = viewers.filter((v) => v.liked).length;
  return (
    <Tap onPress={onOpen} haptic={false} accessibilityLabel={t('النشاط: {0} مشاهدة', [viewers.length])}
      style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingStart: faces.length ? 8 : 16, paddingEnd: 16, borderRadius: 24, backgroundColor: 'rgba(5,8,24,0.45)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }}>
      {faces.length > 0 ? (
        <View style={{ width: 32 + (faces.length - 1) * 20, height: 32 }}>
          {faces.map((v, k) => (
            <View key={v.viewer_id} style={{ position: 'absolute', top: 0, left: k * 20, zIndex: faces.length - k, borderRadius: 16, borderWidth: 2, borderColor: 'rgba(5,8,24,0.9)' }}>
              <Avatar id={v.viewer_id} name={v.p?.full_name} url={v.p?.avatar_url} size={28} />
            </View>
          ))}
        </View>
      ) : <Eye size={18} color="#FFFFFF" />}
      <View>
        <T v="bold" color="#FFFFFF" style={{ fontSize: 13 }}>{t('النشاط')}</T>
        <T v="tiny" color="#D5DAEA">{viewers.length ? t('{0} مشاهدة', [viewers.length]) : t('ما حدا شافها لهلأ')}</T>
      </View>
      {likes > 0 && <Row gap={3}><Heart size={14} color={C.pink} fill={C.pink} /><T v="tiny" color="#FFFFFF">{likes}</T></Row>}
    </Tap>
  );
}

/**
 * Instagram-style "Activity" for your own stories: pick a story from the strip on top,
 * then see who viewed it (and who liked or replied) and read the replies.
 */
export function StoryActivitySheet({ open, onClose, stories, index, onPick, me }: {
  open: boolean; onClose: () => void; stories: Story[]; index: number; onPick: (i: number) => void; me?: string;
}) {
  const [tab, setTab] = useState<'views' | 'replies'>('views');
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [views, setViews] = useState<StoryViewer[] | null>(null);
  const [replies, setReplies] = useState<Reply[] | null>(null);
  const story = stories[index];

  // thumbnails for the strip (photos only; videos get a play tile)
  useEffect(() => {
    if (!open) return;
    stories.filter((s) => s.kind !== 'video' && !thumbs[s.id]).forEach((s) => {
      mediaUrl('stories', s.media_url, photoWidth(80)).then((u) => { if (u) setThumbs((x) => ({ ...x, [s.id]: u })); }, () => {});
    });
  }, [open, stories]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !story) return;
    let live = true;
    setViews(null); setReplies(null);
    supabase.from('story_views').select('viewer_id, liked, viewed_at, p:profiles!story_views_viewer_id_fkey(full_name, avatar_url, username)')
      .eq('story_id', story.id).order('viewed_at', { ascending: false })
      .then(({ data }) => { if (live) setViews((data ?? []) as unknown as StoryViewer[]); }, () => { if (live) setViews([]); });
    supabase.from('messages').select('id, conversation_id, sender_id, body, created_at').eq('kind', 'story_reply').eq('ref_id', story.id)
      .neq('sender_id', me ?? '').is('deleted_at', null).order('created_at', { ascending: false }).limit(200)
      .then(async ({ data }) => {
        const list = (data ?? []) as Reply[];
        const ids = [...new Set(list.map((r) => r.sender_id))];
        if (ids.length) {
          const { data: ps } = await supabase.from('profiles').select('id, full_name, avatar_url, username').in('id', ids);
          const by = Object.fromEntries((ps ?? []).map((p) => [p.id as string, p as Person]));
          list.forEach((r) => { r.p = by[r.sender_id] ?? null; });
        }
        if (live) setReplies(list);
      }, () => { if (live) setReplies([]); });
    return () => { live = false; };
  }, [open, story?.id, me]); // eslint-disable-line react-hooks/exhaustive-deps

  const repliedBy = new Set((replies ?? []).map((r) => r.sender_id));
  const likes = (views ?? []).filter((v) => v.liked).length;

  return (
    <SheetModal open={open} onClose={onClose} style={{ maxHeight: '78%', paddingHorizontal: 0 }}>
      {/* the strip of your stories, like Instagram */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 18, alignItems: 'center' }}>
        {stories.map((s, k) => {
          const on = k === index;
          return (
            <Tap key={s.id} onPress={() => onPick(k)} haptic={false} accessibilityLabel={t('القصة {0}', [k + 1])} accessibilityState={{ selected: on }}
              style={{ width: on ? 60 : 50, height: on ? 96 : 80, borderRadius: 12, overflow: 'hidden', backgroundColor: C.soft, borderWidth: on ? 2 : 0, borderColor: C.inverse, opacity: on ? 1 : 0.6, alignItems: 'center', justifyContent: 'center' }}>
              {thumbs[s.id] ? <Image source={{ uri: thumbs[s.id] }} style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }} contentFit="cover" />
                : s.kind === 'video' ? <Play size={18} color={C.ink} fill={C.ink} /> : null}
            </Tap>
          );
        })}
      </ScrollView>

      {/* tabs */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.line }}>
        {([['views', t('المشاهدين'), views?.length], ['replies', t('الردود'), replies?.length]] as const).map(([k, label, n]) => {
          const on = tab === k;
          return (
            <Tap key={k} onPress={() => setTab(k)} haptic={false} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: on ? C.ink : 'transparent', flexDirection: 'row', gap: 6 }}>
              {k === 'views' ? <Eye size={17} color={on ? C.ink : C.muted} /> : <MessageCircle size={17} color={on ? C.ink : C.muted} />}
              <T v={on ? 'bold' : 'bodyMd'} color={on ? C.ink : C.muted}>{label}{n != null ? ` · ${n}` : ''}</T>
            </Tap>
          );
        })}
      </View>

      <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 12, gap: 4 }}>
        {tab === 'views' ? (
          views === null ? <ListSkeleton n={4} /> : views.length === 0 ? (
            <Empty icon={<Eye size={26} color={C.muted} />} text={t('ما حدا شاف هالقصة لهلأ.')} />
          ) : (
            <>
              {likes > 0 && <Row gap={6} style={{ paddingVertical: 6 }}><Heart size={15} color={C.pink} fill={C.pink} /><T v="small" color={C.muted}>{t('عجبت {0}', [likes])}</T></Row>}
              {views.map((v) => (
                <Tap key={v.viewer_id} haptic={false} onPress={() => { onClose(); router.push({ pathname: '/user/[id]', params: { id: v.viewer_id } }); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 }}>
                  <Avatar id={v.viewer_id} name={v.p?.full_name} url={v.p?.avatar_url} size={44} />
                  <View style={{ flex: 1 }}>
                    <T v="bodyMd" numberOfLines={1}>{v.p?.full_name ?? t('مستخدم')}</T>
                    {v.viewed_at ? <T v="tiny" color={C.muted}>{timeAgo(v.viewed_at)}</T> : null}
                  </View>
                  {repliedBy.has(v.viewer_id) && <MessageCircle size={18} color={C.muted} accessibilityLabel={t('رد')} />}
                  {v.liked && <Heart size={18} color={C.pink} fill={C.pink} accessibilityLabel={t('عجبته')} />}
                </Tap>
              ))}
            </>
          )
        ) : replies === null ? <ListSkeleton n={3} /> : replies.length === 0 ? (
          <Empty icon={<MessageCircle size={26} color={C.muted} />} text={t('ما في ردود على هالقصة لهلأ.')} />
        ) : replies.map((r) => (
          <Tap key={r.id} haptic={false} onPress={() => { onClose(); router.push({ pathname: '/messages/[id]', params: { id: r.conversation_id } }); }}
            style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 8 }}>
            <Avatar id={r.sender_id} name={r.p?.full_name} url={r.p?.avatar_url} size={40} />
            <View style={{ flex: 1, gap: 4 }}>
              <Row gap={6}><T v="bold" numberOfLines={1} style={{ flexShrink: 1 }}>{r.p?.full_name ?? t('مستخدم')}</T><T v="tiny" color={C.muted}>{timeAgo(r.created_at)}</T></Row>
              <View style={{ alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: C.soft, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 }}>
                <T style={{ fontFamily: F.body, fontSize: onlyEmoji(r.body) ? 26 : 15 }}>{r.body}</T>
              </View>
            </View>
          </Tap>
        ))}
      </ScrollView>
    </SheetModal>
  );
}

/** a reply that is just an emoji (a quick reaction) shows bigger, like Instagram */
const onlyEmoji = (b: string | null) => !!b && b.length <= 8 && !/[A-Za-z0-9\u0600-\u06FF\s]/.test(b);

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return <View style={{ alignItems: 'center', gap: 10, paddingVertical: 36 }}>{icon}<T v="small" color={C.muted}>{text}</T></View>;
}
