-- UniMate · 0006 hardening from the security advisor

-- advertiser page: a function instead of a security-definer view
drop view if exists advertiser_pages;
create or replace function advertiser_page(adv uuid)
returns table (id uuid, name text, category text, description text, phone text, hours text, menu jsonb,
               photos text[], logo_url text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.category, a.description, a.phone, a.hours, a.menu, a.photos, a.logo_url, a.lat, a.lng
  from advertisers a
  where a.id = adv and a.is_active and (a.university_id is null or a.university_id = my_university() or is_admin());
$$;

-- fixed search paths
alter function touch_updated_at() set search_path = public;
alter function vanish_interval(vanish_mode) set search_path = public;
alter function system_on() set search_path = public;
alter function system_off() set search_path = public;

-- nobody signed-out may call any of our functions
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
  end loop;
end $$;

-- internal functions: not callable by students either (triggers and the scheduler still run them)
revoke execute on function handle_new_user() from authenticated;
revoke execute on function guard_profile_update() from authenticated;
revoke execute on function bump_post_counts() from authenticated;
revoke execute on function bump_follow_counts() from authenticated;
revoke execute on function follow_default_status() from authenticated;
revoke execute on function block_cleanup() from authenticated;
revoke execute on function guard_highlight() from authenticated;
revoke execute on function award_points() from authenticated;
revoke execute on function points_for_post() from authenticated;
revoke execute on function on_message_insert() from authenticated;
revoke execute on function guard_message_update() from authenticated;
revoke execute on function purge_vanished_messages() from authenticated;
revoke execute on function promote_meeting_reports() from authenticated;
revoke execute on function ensure_section_community() from authenticated;
revoke execute on function leave_section_community() from authenticated;
revoke execute on function join_base_communities() from authenticated;
revoke execute on function find_swap_match() from authenticated;
revoke execute on function guard_moderation_fields() from authenticated;
revoke execute on function system_on() from authenticated;
revoke execute on function system_off() from authenticated;
revoke execute on function dm_entry_state(uuid, uuid) from authenticated;

-- explicitly callable by signed-in students (RPCs + helpers used inside policies)
grant execute on function
  is_admin(uuid), my_university(), is_active_user(uuid), is_blocked_between(uuid, uuid), follows_accepted(uuid, uuid),
  can_see_user(uuid), is_community_member(uuid), can_see_post(posts), can_see_story(stories), is_member(uuid, uuid),
  is_enrolled(uuid), is_my_swap_partner(uuid), vanish_interval(vanish_mode),
  start_direct(uuid, text), answer_request(uuid, boolean), mark_read(uuid), open_view_once(uuid), report_screenshot(uuid, text),
  admin_conversation_messages(uuid, text), nearby_friends(), campus_search(text, integer),
  live_ads(ad_placement), track_ad(uuid, text), advertiser_page(uuid), touch_updated_at()
to authenticated;
