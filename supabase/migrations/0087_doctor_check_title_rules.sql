-- 1) The blue check also goes to verified doctors and academic leaders (not teaching assistants or staff).
-- 2) Only university staff email accounts can ask for a title, and nobody can ask to be president, vice president or dean:
--    those come only from the official staff list, Microsoft, or the owner.

create or replace function private.is_vip_title(t text) returns boolean language sql immutable set search_path = public as $$
  select t in ('president', 'vice_president', 'dean', 'vice_dean', 'head', 'prof', 'assoc_prof', 'asst_prof', 'doctor', 'lecturer')
$$;

-- staff address: one of the university's domains, not a student sub-domain, not a student number
create or replace function private.is_staff_email(p_email text) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    split_part(lower(p_email), '@', 1) !~ '^[0-9]+$'
    and split_part(lower(p_email), '@', 2) !~ '^(std|sta|st|ses|stu|student|students)\.'
    and exists (select 1 from universities u where split_part(lower(p_email), '@', 2) = any(u.email_domains)), false)
$$;

create or replace function public.can_request_title() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select private.is_staff_email(email) from profile_private where user_id = auth.uid()), false)
$$;
revoke all on function public.can_request_title() from public, anon;
grant execute on function public.can_request_title() to authenticated;

create or replace function public.request_title(p_title text, p_department text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.can_request_title() then raise exception 'staff_email_only'; end if;
  if p_title is null or p_title not in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','vice_dean','head','staff') then
    raise exception 'title_not_allowed';
  end if;
  if exists (select 1 from title_requests where user_id = auth.uid() and status = 'pending') then raise exception 'already pending'; end if;
  insert into title_requests(user_id, title, department, note) values (auth.uid(), p_title, nullif(trim(p_department), ''), nullif(trim(p_note), '')) returning id into r;
  return r;
end $$;

create or replace function public.admin_review_title(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
declare r title_requests;
begin
  perform admin_require();
  select * into r from title_requests where id = p_request and status = 'pending';
  if r.id is null then raise exception 'not pending'; end if;
  update title_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
  if p_approve then
    perform set_config('unimate.system', 'on', true);
    update profiles set academic_title = r.title, title_verified = true,
      is_verified = is_verified or private.is_vip_title(r.title),
      account_type = case when r.title = 'staff' then 'staff' else 'faculty' end,
      department = coalesce(r.department, department)
    where id = r.user_id;
    insert into notifications(user_id, kind, title, body) values (r.user_id, 'title_verified', 'تم توثيق حسابك كـ ' || title_label(r.title), 'صار اللقب ظاهر على حسابك للكل.');
  else
    insert into notifications(user_id, kind, title, body) values (r.user_id, 'title_rejected', 'ما قدرنا نوثّق اللقب', 'تواصل مع الدعم إذا بدك تبعتلنا إثبات.');
  end if;
  perform admin_log(case when p_approve then 'approve_title' else 'reject_title' end, 'user', r.user_id::text, jsonb_build_object('title', r.title));
end $$;

create or replace function public.admin_set_title(p_user uuid, p_title text, p_type text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform owner_require();
  perform set_config('unimate.system', 'on', true);
  update profiles set
    academic_title = p_title,
    title_verified = p_title is not null,
    is_verified = is_verified or private.is_vip_title(p_title),
    account_type = coalesce(p_type, case when p_title is null then account_type when p_title = 'staff' then 'staff' else 'faculty' end)
  where id = p_user;
  perform admin_log('set_title', 'user', p_user::text, jsonb_build_object('title', p_title, 'type', p_type));
  if p_title is not null then
    insert into notifications(user_id, kind, title, body) values (p_user, 'title_verified', 'تم توثيق حسابك كـ ' || title_label(p_title), 'صار اللقب ظاهر على حسابك للكل.');
  end if;
end $$;

-- anyone already holding a verified academic title gets the check now
select set_config('unimate.system', 'on', true);
update profiles set is_verified = true where title_verified and private.is_vip_title(academic_title) and not is_verified;

-- admin search: "@mohammad" finds the username too
create or replace function public.admin_find_users(q text default '', lim integer default 50)
returns table(id uuid, full_name text, username text, avatar_url text, status account_status, university text, major text, email text, student_number text, created_at timestamptz, post_count integer, follower_count integer, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
declare k text := ltrim(trim(coalesce(q, '')), '@');
begin
  perform admin_require();
  return query
  select p.id, p.full_name, p.username, p.avatar_url, p.status, u.name_ar, m.name_ar, pp.email, pp.student_number, p.created_at,
         p.post_count, p.follower_count, exists (select 1 from admins a where a.user_id = p.id)
  from profiles p
  left join profile_private pp on pp.user_id = p.id
  left join universities u on u.id = p.university_id
  left join majors m on m.id = p.major_id
  where k = '' or p.full_name ilike '%' || k || '%' or p.username ilike '%' || k || '%' or pp.email ilike '%' || k || '%' or pp.student_number = k or p.id::text = k
  order by (p.username = k) desc, p.created_at desc
  limit lim;
end $$;
