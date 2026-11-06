-- UniMate · 0112 the points system is gone for good (switched off in 0108; nothing calls it, every balance is 0
-- and point_events is empty). Dropping its functions, its table and the two profile columns.
-- the profile guard stops looking after the points column first
CREATE OR REPLACE FUNCTION public.guard_profile_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' or auth.uid() is null then return new; end if;
  new.university_id   := old.university_id;
  new.status          := old.status;
  new.follower_count  := old.follower_count;
  new.following_count := old.following_count;
  new.post_count      := old.post_count;
  new.account_type    := old.account_type;
  new.academic_title  := old.academic_title;
  new.title_verified  := old.title_verified;
  return new;
end $function$;

drop function if exists public.leaderboard(text, text);
drop function if exists public.my_points_history();
drop function if exists public.set_hide_rank(boolean);
drop function if exists public.points_rides();
drop function if exists private.points_rides();
drop function if exists private.points_posts();
drop function if exists private.points_likes();
drop function if exists private.award(uuid, text, int, text, uuid);
drop function if exists private.unaward(uuid, text, uuid);
do $$ declare f record; begin
  -- whatever signature award/unaward ended up with
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname in ('award', 'unaward') loop
    execute 'drop function ' || f.sig;
  end loop;
end $$;
drop table if exists public.point_events;
alter table public.profiles drop column if exists points, drop column if exists hide_rank;
