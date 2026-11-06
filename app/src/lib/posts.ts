import { primeMedia, supabase } from './supabase';
import type { Post } from './types';

export const POST_SELECT = 'id, author_id, university_id, community_id, category, audience, title, body, price_jod, lost_found, poll, is_pinned, hide_likes, like_count, comment_count, created_at, author:profiles!posts_author_id_fkey(id, full_name, username, is_verified, academic_title, title_verified, avatar_url, study_year, major:majors!profiles_major_id_fkey(name_ar, name_en)), media:post_media(id, kind, url, file_name, size_bytes, position, meta)';

export async function withMine(posts: Post[], uid?: string): Promise<Post[]> {
  if (!uid || posts.length === 0) return posts;
  const ids = posts.map((p) => p.id);
  // everything a page of posts needs, together: my likes and saves, a few likers, and the photos' links
  const [{ data: likes }, { data: saves }, { data: likers }] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('user_id', uid).in('post_id', ids),
    supabase.from('post_saves').select('post_id').eq('user_id', uid).in('post_id', ids),
    supabase.rpc('feed_likers', { p_ids: ids }),
    // videos signed together; photos are signed one by one, resized for the screen
    primeMedia('posts', posts.flatMap((p) => (p.media ?? []).filter((m) => m.kind === 'video').map((m) => m.url))),
  ]);
  const L = new Set((likes ?? []).map((x) => x.post_id));
  const S = new Set((saves ?? []).map((x) => x.post_id));
  const F = new Map<string, NonNullable<Post['likers']>>();
  for (const r of (likers ?? []) as { post_id: string; id: string; full_name: string; avatar_url: string | null }[]) {
    F.set(r.post_id, [...(F.get(r.post_id) ?? []), { id: r.id, full_name: r.full_name, avatar_url: r.avatar_url }]);
  }
  return posts.map((p) => ({ ...p, liked: L.has(p.id), saved: S.has(p.id), likers: likers ? F.get(p.id) ?? [] : undefined }));
}

export type FeedFilter = { tab: 'university' | 'college' | 'following'; category?: string | null; communityId?: string | null };

export async function loadFeed(uid: string, f: FeedFilter, before?: string, scope?: { universityId?: string | null; collegeId?: string | null }): Promise<Post[]> {
  let q = supabase.from('posts').select(POST_SELECT).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20);
  // pinned posts only come on the first page, so paging by date never repeats them
  if (before) q = q.lt('created_at', before).eq('is_pinned', false);
  if (f.category) q = q.eq('category', f.category);
  if (f.communityId) q = q.eq('community_id', f.communityId);
  else q = q.is('community_id', null);
  if (f.tab === 'university' && scope?.universityId) q = q.eq('university_id', scope.universityId);
  if (f.tab === 'following') {
    const { data } = await supabase.from('follows').select('followee_id').eq('follower_id', uid).eq('status', 'accepted');
    const ids = (data ?? []).map((x) => x.followee_id);
    if (ids.length === 0) return [];
    q = q.in('author_id', ids);
  }
  if (f.tab === 'college') {
    let college = scope?.collegeId;
    if (college === undefined) college = (await supabase.from('profiles').select('college_id').eq('id', uid).maybeSingle()).data?.college_id ?? null;
    if (!college) return [];
    q = q.eq('college_id', college);
  }
  const { data, error } = await q;
  if (error) throw error;
  return withMine((data ?? []) as unknown as Post[], uid);
}

/** Returns the request so callers can roll back on failure. A duplicate like/save counts as success. */
export function toggleLike(p: Post, uid: string) {
  const q = p.liked ? supabase.from('post_likes').delete().eq('post_id', p.id).eq('user_id', uid) : supabase.from('post_likes').insert({ post_id: p.id, user_id: uid });
  return q.then((r) => (r.error?.code === '23505' ? { ...r, error: null } : r));
}

export function toggleSave(p: Post, uid: string) {
  const q = p.saved ? supabase.from('post_saves').delete().eq('post_id', p.id).eq('user_id', uid) : supabase.from('post_saves').insert({ post_id: p.id, user_id: uid });
  return q.then((r) => (r.error?.code === '23505' ? { ...r, error: null } : r));
}
