-- UniMate · 0052 activity status (online / last seen), notification text preview, search indexes.
alter table profiles add column if not exists show_activity boolean not null default true;
alter table notification_prefs add column if not exists preview boolean not null default true;

-- the app calls this while open; writes at most every 2 minutes
create or replace function public.touch_seen()
returns void language sql security definer set search_path = public as $$
  update profile_private set last_seen_at = now()
  where user_id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '2 minutes');
$$;
grant execute on function public.touch_seen() to authenticated;

-- last seen of some people; empty unless both of you share your activity status (like Instagram)
create or replace function public.last_seen_of(ids uuid[])
returns table (id uuid, last_seen_at timestamptz) language sql stable security definer set search_path = public as $$
  select pp.user_id, pp.last_seen_at
  from profile_private pp join profiles p on p.id = pp.user_id
  where pp.user_id = any(ids) and p.show_activity
    and exists (select 1 from profiles me where me.id = auth.uid() and me.show_activity)
    and not exists (select 1 from blocks b where (b.blocker_id = pp.user_id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = pp.user_id));
$$;
grant execute on function public.last_seen_of(uuid[]) to authenticated;

-- search: courses by code, posts by category + time
create index if not exists courses_code_trgm on courses using gin (code gin_trgm_ops);
create index if not exists posts_category_created_idx on posts (category, created_at desc);
