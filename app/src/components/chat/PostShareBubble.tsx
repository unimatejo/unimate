import { Image } from 'expo-image';
import { router } from 'expo-router';
import { FileText, Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { bubble, inkOn } from '@/components/chat/ChatExtras';
import { Avatar, Row, T, Tap } from '@/components/ui';
import { mediaUrl, supabase, photoWidth } from '@/lib/supabase';
import { C } from '@/lib/theme';
import { t } from '@/lib/i18n';
import type { Message } from '@/lib/types';

type Shared = {
  id: string; title: string | null; body: string;
  author: { id: string; full_name: string; username: string | null; avatar_url: string | null } | null;
  media: { kind: string; url: string; position: number; meta: { cover?: string } | null }[];
};

// a chat often shows the same shared post more than once
const cache = new Map<string, Shared | null>();

/** A post sent in a chat, like Instagram: who posted it, its first photo or video cover, the start of the text; tap to open it. */
export function PostShareBubble({ m, mine }: { m: Message; mine: boolean }) {
  const id = m.ref_id ?? '';
  const [post, setPost] = useState<Shared | null | undefined>(cache.get(id));
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!id) { setPost(null); return; }
    if (cache.has(id)) { setPost(cache.get(id)); return; }
    supabase.from('posts')
      .select('id, title, body, author:profiles!posts_author_id_fkey(id, full_name, username, avatar_url), media:post_media(kind, url, position, meta)')
      .eq('id', id).maybeSingle()
      .then(({ data }) => { const p = (data ?? null) as unknown as Shared | null; cache.set(id, p); setPost(p); }, () => setPost(null));
  }, [id]);
  const first = post?.media?.filter((x) => x.kind === 'image' || x.kind === 'video').sort((a, b) => a.position - b.position)[0];
  // a photo, or the cover of a video
  const still = first?.kind === 'image' ? first.url : first?.meta?.cover ?? null;
  useEffect(() => { if (still) mediaUrl('posts', still, photoWidth(240)).then(setThumb); }, [still]);

  const note = m.body?.trim();
  return (
    <View style={{ gap: 4, alignItems: mine ? 'flex-end' : 'flex-start' }}>
      {post === null ? (
        <View style={[{ paddingHorizontal: 14, paddingVertical: 12, maxWidth: 240 }, bubble(mine, C.soft)]}>
          <T v="small" color={C.muted}>{t('المنشور غير متاح، ربما حُذف أو جعله صاحبه خاصاً.')}</T>
        </View>
      ) : (
        <Tap onPress={() => post && router.push({ pathname: '/post/[id]', params: { id: post.id } })} scale={0.98}
          accessibilityLabel={t('افتح المنشور')}
          style={{ width: 240, borderRadius: 20, overflow: 'hidden', backgroundColor: C.card, borderWidth: 1, borderColor: C.line }}>
          <Row gap={8} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
            <Avatar id={post?.author?.id} name={post?.author?.full_name ?? ''} url={post?.author?.avatar_url ?? null} size={28} />
            <T v="bold" numberOfLines={1} style={{ flex: 1, fontSize: 13.5 }}>{post?.author?.full_name ?? ' '}</T>
          </Row>
          {first?.kind === 'image' ? (
            <View style={{ width: 240, height: 240, backgroundColor: C.soft }}>
              {thumb && <Image source={{ uri: thumb }} style={{ width: 240, height: 240 }} contentFit="cover" transition={150} />}
            </View>
          ) : first?.kind === 'video' ? (
            <View style={{ width: 240, height: 300, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
              {thumb && <Image source={{ uri: thumb }} style={{ position: 'absolute', width: 240, height: 300 }} contentFit="cover" transition={150} />}
              <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={26} color="#fff" fill="#fff" />
              </View>
            </View>
          ) : post?.media?.some((x) => x.kind === 'file') ? (
            <View style={{ paddingHorizontal: 12, paddingTop: 2 }}><FileText size={18} color={C.muted} /></View>
          ) : null}
          {(post?.title || post?.body) ? (
            <T v="small" numberOfLines={2} style={{ paddingHorizontal: 12, paddingVertical: 10, lineHeight: 19 }}>
              {post.title ? `${post.title} · ` : ''}{post.body}
            </T>
          ) : <View style={{ height: 10 }} />}
        </Tap>
      )}
      {note ? (
        <View style={[{ paddingHorizontal: 14, paddingVertical: 10 }, bubble(mine)]}>
          <T v="body" color={inkOn(mine)} style={{ lineHeight: 22 }}>{note}</T>
        </View>
      ) : null}
    </View>
  );
}
