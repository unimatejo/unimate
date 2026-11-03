-- UniMate · 0001 core: universities, academic structure, profiles, admins, settings

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------- enums ----------
create type university_type as enum ('public', 'private');
create type account_status as enum ('active', 'suspended', 'banned');
create type message_permission as enum ('everyone', 'college', 'major', 'nobody');
create type socials_visibility as enum ('everyone', 'friends', 'close_friends', 'nobody');
create type vanish_mode as enum ('after_view', 'h24', 'd7', 'never');
create type admin_role as enum ('owner', 'moderator');

-- ---------- universities ----------
create table universities (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name_ar       text not null,
  name_en       text not null,
  city          text,
  type          university_type not null default 'public',
  email_domains text[] not null default '{}',
  brand_color   text not null default '#2E5BFF',
  logo_url      text,               -- only after the university grants permission
  center_lat    double precision,
  center_lng    double precision,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index universities_domains_idx on universities using gin (email_domains);

create table colleges (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  name_ar       text not null,
  name_en       text,
  unique (university_id, name_ar)
);

create table majors (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  college_id    uuid references colleges(id) on delete set null,
  name_ar       text not null,
  name_en       text,
  degree        text not null default 'bachelor',
  unique (university_id, name_ar, degree)
);
create index majors_college_idx on majors(college_id);

-- ---------- profiles ----------
create table profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  university_id      uuid references universities(id),
  college_id         uuid references colleges(id),
  major_id           uuid references majors(id),
  username           text unique,
  full_name          text not null default '',
  avatar_url         text,
  bio                text not null default '' check (char_length(bio) <= 300),
  study_year         smallint check (study_year between 1 and 8),
  status             account_status not null default 'active',
  -- privacy
  is_private         boolean not null default true,
  hide_followers     boolean not null default false,
  hide_following     boolean not null default false,
  hide_like_counts   boolean not null default false,
  who_can_message    message_permission not null default 'major',
  socials_visible_to socials_visibility not null default 'friends',
  instagram          text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  snapchat           text check (snapchat ~ '^[A-Za-z0-9._-]{1,30}$'),
  block_screenshots  boolean not null default true,
  default_vanish     vanish_mode not null default 'h24',
  nearby_enabled     boolean not null default false,
  -- engagement
  points             integer not null default 0,
  follower_count     integer not null default 0,
  following_count    integer not null default 0,
  post_count         integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index profiles_university_idx on profiles(university_id);
create index profiles_name_trgm on profiles using gin (full_name gin_trgm_ops);

-- private data: never readable by other students
create table profile_private (
  user_id        uuid primary key references profiles(id) on delete cascade,
  email          text,
  student_number text,
  ms_object_id   text,
  last_seen_at   timestamptz
);

-- ---------- admins ----------
create table admins (
  user_id    uuid primary key references profiles(id) on delete cascade,
  role       admin_role not null default 'moderator',
  created_at timestamptz not null default now()
);

create table admin_audit_log (
  id          bigint generated always as identity primary key,
  admin_id    uuid references profiles(id),
  action      text not null,
  target_type text,
  target_id   text,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index admin_audit_created_idx on admin_audit_log(created_at desc);

-- ---------- helper functions ----------
create or replace function is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = uid);
$$;

create or replace function my_university()
returns uuid language sql stable security definer set search_path = public as $$
  select university_id from profiles where id = auth.uid();
$$;

create or replace function is_active_user(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = uid and status = 'active');
$$;

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger profiles_touch before update on profiles
for each row execute function touch_updated_at();

-- students may not change their own university, status, counters or points
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
  return new;
end $$;

create trigger profiles_guard before update on profiles
for each row execute function guard_profile_update();

-- map a new auth user to their university from the email domain
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dom   text := lower(split_part(coalesce(new.email, ''), '@', 2));
  uni   uuid;
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  local text := split_part(coalesce(new.email, ''), '@', 1);
begin
  select id into uni from universities
  where exists (
    select 1 from unnest(email_domains) d
    where dom = d or dom like '%.' || d
  )
  limit 1;

  insert into profiles (id, university_id, full_name, avatar_url)
  values (
    new.id, uni,
    coalesce(meta->>'full_name', meta->>'name', local),
    meta->>'avatar_url'
  );

  insert into profile_private (user_id, email, student_number, ms_object_id)
  values (
    new.id, new.email,
    case when local ~ '^[0-9]{5,12}$' then local end,
    meta->>'sub'
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- ---------- RLS ----------
alter table universities     enable row level security;
alter table colleges         enable row level security;
alter table majors           enable row level security;
alter table profiles         enable row level security;
alter table profile_private  enable row level security;
alter table admins           enable row level security;
alter table admin_audit_log  enable row level security;

create policy "universities readable" on universities for select using (true);
create policy "universities admin" on universities for all using (is_admin()) with check (is_admin());
create policy "colleges readable" on colleges for select using (true);
create policy "colleges admin" on colleges for all using (is_admin()) with check (is_admin());
create policy "majors readable" on majors for select using (true);
create policy "majors admin" on majors for all using (is_admin()) with check (is_admin());

create policy "profiles same university" on profiles for select
  using (id = auth.uid() or is_admin() or university_id = my_university());
create policy "profiles self update" on profiles for update
  using (id = auth.uid() or is_admin()) with check (id = auth.uid() or is_admin());
create policy "profiles admin delete" on profiles for delete using (is_admin());

create policy "private self or admin" on profile_private for select
  using (user_id = auth.uid() or is_admin());
create policy "private admin write" on profile_private for all
  using (is_admin()) with check (is_admin());

create policy "admins visible to admins" on admins for select using (is_admin() or user_id = auth.uid());
create policy "admins owner manage" on admins for all
  using (exists (select 1 from admins a where a.user_id = auth.uid() and a.role = 'owner'))
  with check (exists (select 1 from admins a where a.user_id = auth.uid() and a.role = 'owner'));

create policy "audit admin read" on admin_audit_log for select using (is_admin());
create policy "audit admin insert" on admin_audit_log for insert with check (is_admin() and admin_id = auth.uid());
