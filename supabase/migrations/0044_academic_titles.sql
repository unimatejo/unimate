-- UniMate · 0044 faculty & staff accounts with a verified academic title (د. / أ.د. / عميد …).
-- Only admins set or confirm a title; people can ask for one from Settings.
alter table profiles add column if not exists account_type text not null default 'student'
  check (account_type in ('student', 'faculty', 'staff'));
alter table profiles add column if not exists academic_title text
  check (academic_title in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','dean','vice_dean','head','president','vice_president','staff'));
alter table profiles add column if not exists title_verified boolean not null default false;
alter table profiles add column if not exists department text check (char_length(department) <= 80);

create or replace function guard_profile_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' or auth.uid() is null then return new; end if;
  new.university_id   := old.university_id;
  new.status          := old.status;
  new.points          := old.points;
  new.follower_count  := old.follower_count;
  new.following_count := old.following_count;
  new.post_count      := old.post_count;
  new.account_type    := old.account_type;
  new.academic_title  := old.academic_title;
  new.title_verified  := old.title_verified;
  return new;
end $$;

create table if not exists title_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null check (title in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','dean','vice_dean','head','president','vice_president','staff')),
  department  text check (char_length(department) <= 80),
  note        text check (char_length(note) <= 300),
  proof_url   text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_by uuid references profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists title_requests_one_pending on title_requests(user_id) where status = 'pending';
alter table title_requests enable row level security;
drop policy if exists "title req own read" on title_requests;
create policy "title req own read" on title_requests for select using (user_id = auth.uid() or is_admin());
drop policy if exists "title req admin write" on title_requests;
create policy "title req admin write" on title_requests for update using (is_admin()) with check (is_admin());

create or replace function public.title_label(p text)
returns text language sql immutable as $$
  select case p when 'prof' then 'أستاذ دكتور' when 'assoc_prof' then 'أستاذ مشارك' when 'asst_prof' then 'أستاذ مساعد'
    when 'doctor' then 'دكتور' when 'lecturer' then 'محاضر' when 'teacher_assistant' then 'مساعد تدريس'
    when 'dean' then 'عميد' when 'vice_dean' then 'نائب عميد' when 'head' then 'رئيس قسم'
    when 'president' then 'رئيس الجامعة' when 'vice_president' then 'نائب رئيس الجامعة' when 'staff' then 'موظف' else p end;
$$;

create or replace function public.request_title(p_title text, p_department text, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from title_requests where user_id = auth.uid() and status = 'pending') then raise exception 'already pending'; end if;
  insert into title_requests(user_id, title, department, note) values (auth.uid(), p_title, nullif(trim(p_department), ''), nullif(trim(p_note), '')) returning id into r;
  return r;
end $$;

create or replace function public.admin_set_title(p_user uuid, p_title text, p_type text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  perform set_config('unimate.system', 'on', true);
  update profiles set
    academic_title = p_title,
    title_verified = p_title is not null,
    account_type = coalesce(p_type, case when p_title is null then account_type when p_title = 'staff' then 'staff' else 'faculty' end)
  where id = p_user;
  perform admin_log('set_title', 'user', p_user::text, jsonb_build_object('title', p_title, 'type', p_type));
  if p_title is not null then
    insert into notifications(user_id, kind, title, body) values (p_user, 'title_verified', 'تم توثيق حسابك كـ ' || title_label(p_title), 'صار اللقب ظاهر على حسابك للكل.');
  end if;
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
      account_type = case when r.title = 'staff' then 'staff' else 'faculty' end,
      department = coalesce(r.department, department)
    where id = r.user_id;
    insert into notifications(user_id, kind, title, body) values (r.user_id, 'title_verified', 'تم توثيق حسابك كـ ' || title_label(r.title), 'صار اللقب ظاهر على حسابك للكل.');
  else
    insert into notifications(user_id, kind, title, body) values (r.user_id, 'title_rejected', 'ما قدرنا نوثّق اللقب', 'تواصل مع الدعم إذا بدك تبعتلنا إثبات.');
  end if;
  perform admin_log(case when p_approve then 'approve_title' else 'reject_title' end, 'user', r.user_id::text, jsonb_build_object('title', r.title));
end $$;
revoke all on function public.admin_set_title(uuid, text, text), public.admin_review_title(uuid, boolean) from public, anon;
grant execute on function public.request_title(text, text, text), public.admin_set_title(uuid, text, text), public.admin_review_title(uuid, boolean) to authenticated;

-- new sign-ups on a university's base domain (hu.edu.jo, not std./sta.) with a name-like address are probably staff
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dom   text := lower(split_part(coalesce(new.email, ''), '@', 2));
  uni   uuid;
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  local text := split_part(coalesce(new.email, ''), '@', 1);
  prov  text := coalesce(new.raw_app_meta_data->>'provider', '');
  staff private.staff_emails;
  base  boolean := false;
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
  return new;
end $$;
