-- Usernames: unique (case-insensitive), searchable, fixed once chosen.
-- Verified badge: only accounts that signed in with their university Microsoft account.
alter table profiles add column if not exists is_verified boolean not null default false;
alter table profiles add column if not exists entry_year smallint check (entry_year between 1990 and 2100);
alter table profiles add column if not exists onboarded boolean not null default false;
alter table profile_private add column if not exists birth_date date;

update profiles set username = lower(username) where username is not null and username <> lower(username);
create unique index if not exists profiles_username_lower on profiles (lower(username));
create index if not exists profiles_username_trgm on profiles using gin (username gin_trgm_ops);
do $$ begin
  alter table profiles add constraint profiles_username_format check (username ~ '^[a-z0-9._]{3,24}$');
exception when duplicate_object then null; end $$;

create or replace function profiles_guard_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or auth.uid() is null then return new; end if; -- admins and server-side jobs
  -- the badge comes only from the Microsoft identity, never from the app
  new.is_verified := old.is_verified;
  if old.username is not null and new.username is distinct from old.username then
    raise exception 'username_locked' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists profiles_guard_identity on profiles;
create trigger profiles_guard_identity before update on profiles for each row execute function profiles_guard_identity();

create or replace function username_available(u text)
returns boolean language sql stable security definer set search_path = public as $$
  select lower(u) ~ '^[a-z0-9._]{3,24}$' and not exists (select 1 from profiles where lower(username) = lower(u) and id <> auth.uid());
$$;
grant execute on function username_available(text) to authenticated;

-- Microsoft (azure) identity => verified
create or replace function sync_verified()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.provider = 'azure' then
    update profiles set is_verified = true where id = new.user_id;
    update profile_private set ms_object_id = coalesce(ms_object_id, new.provider_id) where user_id = new.user_id;
  end if;
  return new;
end $$;
drop trigger if exists on_identity_verified on auth.identities;
create trigger on_identity_verified after insert on auth.identities for each row execute function sync_verified();

-- the profile trigger runs before the identity row exists in some flows; set it from the user's provider too
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  dom   text := lower(split_part(coalesce(new.email, ''), '@', 2));
  uni   uuid;
  meta  jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  local text := split_part(coalesce(new.email, ''), '@', 1);
  prov  text := coalesce(new.raw_app_meta_data->>'provider', '');
begin
  select id into uni from universities
  where exists (select 1 from unnest(email_domains) d where dom = d or dom like '%.' || d)
  limit 1;

  insert into profiles (id, university_id, full_name, avatar_url, is_verified)
  values (new.id, uni, coalesce(meta->>'full_name', meta->>'name', local), meta->>'avatar_url', prov = 'azure');

  insert into profile_private (user_id, email, student_number, ms_object_id)
  values (new.id, new.email, case when local ~ '^[0-9]{5,12}$' then local end, case when prov = 'azure' then meta->>'sub' end);
  return new;
end $$;

update profiles p set is_verified = true where exists (select 1 from auth.identities i where i.user_id = p.id and i.provider = 'azure');
-- people who already filled their name and major don't need onboarding again
update profiles set onboarded = true where major_id is not null and full_name !~ '^[0-9]+$';
