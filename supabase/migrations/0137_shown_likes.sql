-- UniMate · 0137 the like number an admin may show on a post
--
-- Like the follower numbers (0135): an admin can set the number of likes shown on a post. The list of who liked it
-- always stays the real people. Only admins (or the server) can set it; anyone else's change is ignored.

alter table public.posts add column if not exists shown_likes integer check (shown_likes between 0 and 100000000);

create or replace function private.guard_shown_likes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' then return new; end if;
  new.shown_likes := case when tg_op = 'INSERT' then null else old.shown_likes end;
  return new;
end $$;

drop trigger if exists posts_shown_likes_guard on public.posts;
create trigger posts_shown_likes_guard before insert or update on public.posts
  for each row execute function private.guard_shown_likes();

/** an admin sets (or clears with null) the like number shown on one post; logged */
create or replace function public.admin_set_shown_likes(p_post uuid, p_count integer)
returns void language plpgsql security definer set search_path = public as $$
declare before integer;
begin
  perform admin_require();
  if p_count is not null and p_count not between 0 and 100000000 then raise exception 'bad_count' using errcode = '22023'; end if;
  select shown_likes into before from posts where id = p_post;
  if not found then raise exception 'not_found' using errcode = 'P0002'; end if;
  update posts set shown_likes = p_count where id = p_post;
  perform admin_log('set_shown_likes', 'post', p_post::text, jsonb_build_object('before', before, 'after', p_count));
end $$;
revoke all on function public.admin_set_shown_likes(uuid, integer) from public, anon;
grant execute on function public.admin_set_shown_likes(uuid, integer) to authenticated;
