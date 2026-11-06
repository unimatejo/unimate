-- UniMate · 0096 the university directory shows the full official title ("عميد شؤون الطلبة"), never lists team accounts.
drop function if exists public.university_directory(uuid);
create function public.university_directory(p_university uuid default null)
returns table(id uuid, full_name text, username text, avatar_url text, account_type text, academic_title text, title_verified boolean,
  department text, major text, college text, is_verified boolean, rank integer, position_title text)
language sql stable security definer set search_path = public as $$
  with me as (select case when is_admin() then coalesce(p_university, my_university()) else my_university() end as uni)
  select p.id, p.full_name, p.username, p.avatar_url, p.account_type,
         case when p.title_verified then p.academic_title end, p.title_verified,
         p.department, m.name_ar, c.name_ar, p.is_verified,
         case
           when p.title_verified and p.academic_title is not null then array_position(array['president','vice_president','dean','vice_dean','head','prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','staff'], p.academic_title)
           when p.account_type = 'faculty' then 50
           when p.account_type = 'staff' then 60
           else 100 end as rank,
         case when p.title_verified then p.position_title end
  from profiles p
  left join majors m on m.id = p.major_id
  left join colleges c on c.id = coalesce(p.college_id, m.college_id)
  where auth.uid() is not null
    and p.university_id = (select uni from me)
    and p.status::text = 'active'
    and p.deletion_requested_at is null
    and not is_team_account(p.id)
    and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = p.id))
  order by rank, p.full_name;
$$;
revoke all on function public.university_directory(uuid) from public, anon;
grant execute on function public.university_directory(uuid) to authenticated;

-- the owner's own blue check is his, not the title's: removing a title never takes it away
select set_config('unimate.system', 'on', true);
update profiles p set blue_manual = true, is_verified = true from admins a where a.user_id = p.id and a.role = 'owner';
