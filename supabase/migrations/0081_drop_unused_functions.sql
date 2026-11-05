-- Server functions nothing calls any more (old points triggers, an unused "friends nearby" query,
-- one-off helpers, and functions only the retired web admin panel used). Data is not touched.
drop function if exists public.system_on();
drop function if exists public.system_off();
drop function if exists public.award_points();
drop function if exists public.points_for_post();
drop function if exists public.nearby_friends();
drop function if exists public.admin_user_overview(uuid);
drop function if exists public.admin_update_profile(uuid, jsonb);
drop function if exists public.admin_staff_titles_count();
drop function if exists public.admin_unblock_socials(uuid);
drop function if exists private.merge_section(uuid, uuid);
