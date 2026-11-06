-- 0088 · Security hardening for an official university app (FOR REVIEW — not applied yet)
-- Every block says what it closes. Apply with: bash supabase/apply.sh supabase/review/0088_security_hardening.sql

-- 1) [CRITICAL] A student can mark their own account "verified by Microsoft" (profiles.ms_verified is not guarded),
--    and moderators (not only the owner) can set someone's blue check or official title by editing the row directly.
--    Official fields now change only through the server (system flag) or the owner.
create or replace function public.profiles_guard_identity() returns trigger
language plpgsql security definer set search_path = public as $$
declare days int;
begin
  if current_setting('unimate.system', true) = 'on' or auth.uid() is null then
    if new.username is distinct from old.username then new.username_changed_at := now(); end if;
    return new;
  end if;
  -- official marks: only the owner may touch them by hand; everyone else gets them from the server
  if not is_owner() then
    new.is_verified    := old.is_verified;
    new.ms_verified    := old.ms_verified;
    new.academic_title := old.academic_title;
    new.title_verified := old.title_verified;
    new.account_type   := old.account_type;
    -- a verified staff member's department is part of the official title
    if old.title_verified then new.department := old.department; end if;
  end if;
  if is_admin() then
    if new.username is distinct from old.username then new.username_changed_at := now(); end if;
    return new;
  end if;
  new.username_changed_at := old.username_changed_at;
  if new.username is distinct from old.username then
    if new.username is null then raise exception 'username_required' using errcode = 'P0001'; end if;
    days := username_cooldown_days();
    if old.username is not null and days > 0 and old.username_changed_at is not null and old.username_changed_at > now() - make_interval(days => days) then
      raise exception 'username_cooldown:%', ceil(extract(epoch from (old.username_changed_at + make_interval(days => days) - now())) / 86400)::int using errcode = 'P0001';
    end if;
    new.username_changed_at := now();
  end if;
  return new;
end $$;

-- 2) [HIGH] Official grades: only a team account signed in with its authenticator code (aal2) may import them.
create or replace function private.team_require() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not (public.is_team_account(auth.uid()) and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2' and public.is_owner()) then
    raise exception 'team_only' using errcode = '42501';
  end if;
end $$;
revoke all on function private.team_require() from public, anon, authenticated;

do $$
declare src text;
begin
  select pg_get_functiondef('public.admin_import_grades'::regproc) into src;
  if position('perform owner_require();' in src) > 0 then
    execute replace(src, 'perform owner_require();', 'perform owner_require(); perform private.team_require();');
  end if;
end $$;

-- 3) [MEDIUM] Anyone could ask the server for any user's role in any chat (conv_role / can_manage_conv with a user id):
--    only the database itself uses those two-argument versions.
revoke execute on function public.conv_role(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.can_manage_conv(uuid, uuid) from public, anon, authenticated;

-- 4) [LOW] Trigger functions and private helpers are not an API: nobody calls them directly.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prorettype = 'trigger'::regtype loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
  for f in select p.oid::regprocedure sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' loop
    -- the admin chat viewer is used inside a read rule, so signed-in users must keep it
    if f.proname <> 'admin_visible_messages' then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    end if;
  end loop;
end $$;

-- 5) [LOW] A fixed, empty search path for the blue-check rule.
create or replace function private.is_vip_title(t text) returns boolean language sql immutable set search_path = '' as $$
  select t in ('president', 'vice_president', 'dean', 'vice_dean', 'head', 'prof', 'assoc_prof', 'asst_prof', 'doctor', 'lecturer')
$$;

-- 6) [LOW] pg_trgm out of the public schema (the search indexes keep working).
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- 7) [LOW] The map import staging table is internal.
revoke all on table public.osm_stage from anon, authenticated;

-- 8) [LOW] Students and visitors never read the profiles table without signing in.
revoke select on table public.profiles from anon;

-- 9) App errors stay in the admin panel (أخطاء التطبيق) and no longer appear as notifications.
create or replace function private.on_client_error() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  return null;
end $$;
update notifications set read_at = coalesce(read_at, now()) where kind = 'admin_alert' and title like 'عطل بالتطبيق:%';

-- 10) Videos recorded by the browser camera are WebM: allow it (the app converts to MP4 when it can).
update storage.buckets set allowed_mime_types = array(select distinct unnest(allowed_mime_types || array['video/webm'])) where id in ('stories', 'posts');
