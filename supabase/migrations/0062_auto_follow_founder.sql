-- UniMate · 0062 new accounts follow the founder automatically (unfollow works as usual)
insert into private.push_cfg(k, v) values ('auto_follow', 'a7390ccc-d877-41bf-bb73-b368d590bade') on conflict (k) do update set v = excluded.v;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  dom   text := lower(split_part(coalesce(new.email, ''), '@', 2));
  uni   uuid;
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  local text := split_part(coalesce(new.email, ''), '@', 1);
  prov  text := coalesce(new.raw_app_meta_data->>'provider', '');
  staff private.staff_emails;
  base  boolean := false;
  founder uuid;
begin
  select id into uni from universities
  where exists (select 1 from unnest(email_domains) d where dom = d or dom like '%.' || d)
  limit 1;
  select exists (select 1 from universities u, unnest(u.email_domains) d where dom = d and d !~ '^(std|sta|ses|stu|student)\.') into base;
  select * into staff from private.staff_emails where email = lower(coalesce(new.email, ''));
  if uni is null and staff.email is not null then uni := staff.university_id; end if;

  insert into profiles (id, university_id, full_name, avatar_url, is_verified, account_type)
  values (new.id, uni, coalesce(meta->>'full_name', meta->>'name', local), meta->>'avatar_url', prov = 'azure' or staff.email is not null,
          case when base and local !~ '^[0-9]+$' and staff.email is null then 'faculty' else 'student' end);

  insert into profile_private (user_id, email, student_number, ms_object_id)
  values (new.id, new.email, case when local ~ '^[0-9]{5,12}$' then local end, case when prov = 'azure' then meta->>'sub' end);

  if staff.email is not null then
    insert into admins(user_id, role) values (new.id, staff.role::admin_role) on conflict (user_id) do nothing;
  end if;

  -- every new account starts out following the founder (they can unfollow any time, like any follow)
  begin
    select v::uuid into founder from private.push_cfg where k = 'auto_follow';
    if founder is not null and founder <> new.id and exists (select 1 from profiles where id = founder) then
      perform set_config('unimate.system', 'on', true);
      insert into follows(follower_id, followee_id, status) values (new.id, founder, 'accepted') on conflict do nothing;
      update follows set status = 'accepted' where follower_id = new.id and followee_id = founder and status <> 'accepted';
      perform set_config('unimate.system', 'off', true);
    end if;
  exception when others then
    perform set_config('unimate.system', 'off', true); -- never let this stop a sign-up
  end;
  return new;
end $function$

;
