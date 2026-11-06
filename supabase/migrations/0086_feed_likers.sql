-- A few faces of who liked each post, for a whole page of the feed in one request
-- (runs as the caller, so the usual rules about who can be seen still apply).
create or replace function public.feed_likers(p_ids uuid[])
returns table (post_id uuid, id uuid, full_name text, avatar_url text)
language sql stable security invoker set search_path = public as $$
  select x.post_id, x.id, x.full_name, x.avatar_url from (
    select l.post_id, p.id, p.full_name, p.avatar_url,
           row_number() over (partition by l.post_id order by l.created_at desc) n
    from post_likes l join profiles p on p.id = l.user_id
    where l.post_id = any(p_ids[1:60])
  ) x where x.n <= 3;
$$;
revoke all on function public.feed_likers(uuid[]) from public, anon;
grant execute on function public.feed_likers(uuid[]) to authenticated;
