import { supabase } from './supabase';
import type { Post } from './types';

export const POST_SELECT = 'id, author_id, university_id, community_id, category, audience, title, body, price_jod, lost_found, poll, is_pinned, hide_likes, like_count, comment_count, created_at, author:profiles!posts_author_id_fkey(id, full_name, avatar_url, study_year, major:majors(name_ar)), media:post_media(id, kind, url, file_name, size_bytes, position)';

export async function withMine(posts: Post[], uid?: string): Promise<Post[]> {
  if (!uid || posts.length === 0) return posts;
  const ids = posts.map((p) => p.id);
  const [{ data: likes }, { data: saves }] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('user_id', uid).in('post_id', ids),
    supabase.from('post_saves').select('post_id').eq('user_id', uid).in('post_id', ids),
  ]);
  const L = new Set((likes ?? []).map((x) => x.post_id));
  const S = new Set((saves ?? []).map((x) => x.post_id));
  return posts.map((p) => ({ ...p, liked: L.has(p.id), saved: S.has(p.id) }));
}

export type FeedFilter = { tab: 'university' | 'college' | 'following'; category?: string | null; communityId?: string | null };

export async function loadFeed(uid: string, f: FeedFilter, before?: string): Promise<Post[]> {
  let q = supabase.from('posts').select(POST_SELECT).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20);
  if (before) q = q.lt('created_at', before);
  if (f.category) q = q.eq('category', f.category);
  if (f.communityId) q = q.eq('community_id', f.communityId);
  else q = q.is('community_id', null);
  if (f.tab === 'following') {
    const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', uid).eq('status', 'accepted');
    const ids = (data ?? []).map((x) => x.followee_id);
    if (ids.length === 0) return [];
    q = q.in('author_id', ids);
  }
  if (f.tab === 'college') {
    const { data: me } = await supabase.from('profiles').select('college_id').eq('id', uid).single();
    if (!me?.college_id) return [];
    const { data: mates } = await supabase.from('profiles').select('id').eq('college_id', me.college_id).limit(1000);
    q = q.in('author_id', (mates ?? []).map((m) => m.id));
  }
  const { data } = await q;
  return withMine((data ?? []) as unknown as Post[], uid);
}

export async function toggleLike(p: Post, uid: string) {
  if (p.liked) await supabase.from('post_likes').delete().eq('post_id', p.id).eq('user_id', uid);
  else await supabase.from('post_likes').insert({ post_id: p.id, user_id: uid });
}

export async function toggleSave(p: Post, uid: string) {
  if (p.saved) await supabase.from('post_saves').delete().eq('post_id', p.id).eq('user_id', uid);
  else await supabase.from('post_saves').insert({ post_id: p.id, user_id: uid });
}
