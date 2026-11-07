-- UniMate · 0133 "liked by …" under each post checks the post once, not once per like
--
-- Found by the load test: the three faces under each feed post (feed_likers) ran as the student, so Postgres
-- checked "may I see this like?" for every like row, and that check asks "may I see this post?" (can_see_post)
-- twice per like. A page of 20 posts with 5 likes each took 250 ms; a post with 1,000 likes would take seconds.
-- Now the post is checked once, and for each post only the newest likers are read (new index, newest first) until
-- three the student may see are found.
-- Who appears is exactly the same as before (tested against the old function for several students, a blocked
-- liker, a team account, a post with hidden likes and a like on a post the student can't see):
--   a like shows when: I'm an admin, or it's my own like, or I may see the post and its likes aren't hidden (or it's my post);
--   the liker shows when: it's me, or I'm an admin, or same university, not a team account, and they didn't block me.

create index if not exists post_likes_recent_idx on public.post_likes (post_id, created_at desc);

create or replace function public.feed_likers(p_ids uuid[])
returns table (post_id uuid, id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  with me as (select auth.uid() uid, is_admin() adm, my_university() uni),
  ps as materialized (
    select po.id, (po.author_id = me.uid or not po.hide_likes) and can_see_post(po) open
    from posts po, me where po.id = any(p_ids[1:60]))
  select ps.id, x.id, x.full_name, x.avatar_url
  from ps, me cross join lateral (
    select p.id, p.full_name, p.avatar_url
    from post_likes l join profiles p on p.id = l.user_id
    where l.post_id = ps.id
      and (me.adm or l.user_id = me.uid or ps.open)
      and (p.id = me.uid or me.adm or (p.university_id = me.uni and not is_team_account(p.id) and not blocked_me(p.id)))
    order by l.created_at desc
    limit 3) x;
$$;

revoke all on function public.feed_likers(uuid[]) from public, anon;
grant execute on function public.feed_likers(uuid[]) to authenticated;
