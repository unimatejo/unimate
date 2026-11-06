-- Staff recognised from their university Microsoft account: the server reads the job title from Microsoft
-- (never from the app) and sets the academic title. The official staff list, when imported, still wins.
-- Called only by the ms-role server function (service role).

create or replace function public.ms_apply_title(p_user uuid, p_title text, p_department text)
returns boolean language plpgsql security definer set search_path = public as $$
declare cur profiles;
begin
  if p_title is null or p_title not in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','dean','vice_dean','head','president','vice_president','staff') then
    return false;
  end if;
  select * into cur from profiles where id = p_user;
  if cur.id is null then return false; end if;
  -- a title from the official list or set by an admin stays
  if cur.title_verified and exists (select 1 from profile_private pp join private.staff_titles s on s.email = lower(pp.email) where pp.user_id = p_user) then
    return false;
  end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set academic_title = p_title, title_verified = true,
    is_verified = is_verified or private.is_vip_title(p_title),
    account_type = case when p_title = 'staff' then 'staff' else 'faculty' end,
    department = coalesce(nullif(trim(p_department), ''), department)
  where id = p_user and (academic_title is distinct from p_title or not title_verified);
  perform set_config('unimate.system', 'off', true);
  return true;
end $$;
revoke all on function public.ms_apply_title(uuid, text, text) from public, anon, authenticated;
grant execute on function public.ms_apply_title(uuid, text, text) to service_role;
