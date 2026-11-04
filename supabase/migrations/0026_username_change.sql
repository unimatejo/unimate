-- Usernames can change. During testing: any time. After launch: set the cooldown (e.g. 14 days) with
--   update app_config set value = '14' where key = 'username_cooldown_days';
create table if not exists app_config (key text primary key, value text not null, updated_at timestamptz not null default now());
alter table app_config enable row level security;
drop policy if exists "config read" on app_config;
create policy "config read" on app_config for select using (true);
drop policy if exists "config admin" on app_config;
create policy "config admin" on app_config for all using (is_admin()) with check (is_admin());
insert into app_config(key, value) values ('username_cooldown_days', '0') on conflict (key) do nothing;

alter table profiles add column if not exists username_changed_at timestamptz;

create or replace function username_cooldown_days() returns int language sql stable security definer set search_path = public as $$
  select coalesce((select value::int from app_config where key = 'username_cooldown_days'), 0);
$$;
grant execute on function username_cooldown_days() to authenticated, anon;

create or replace function profiles_guard_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare days int;
begin
  if is_admin() or auth.uid() is null then
    if new.username is distinct from old.username then new.username_changed_at := now(); end if;
    return new;
  end if;
  -- the badge comes only from the Microsoft identity, never from the app
  new.is_verified := old.is_verified;
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
