-- UniMate · 0098 the owner can take the blue check from anyone — a president or dean too — and it stays off:
-- a title, the staff list or Microsoft never put it back. Only the owner giving it again does.
alter table profiles add column if not exists blue_off boolean not null default false;

create or replace function private.keep_blue_off() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.blue_off then new.is_verified := false; end if;
  return new;
end $$;
drop trigger if exists profiles_keep_blue_off on profiles;
create trigger profiles_keep_blue_off before insert or update on profiles for each row execute function private.keep_blue_off();

create or replace function public.admin_set_blue_check(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform owner_require();
  if not exists (select 1 from profiles where id = p_user) then raise exception 'not found'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set blue_off = not p_on, is_verified = p_on, blue_manual = p_on, lapsed_blue = false where id = p_user;
  if p_on then
    insert into notifications(user_id, kind, title, body)
    values (p_user, 'system', 'حسابك صار موثّق ✓', 'انضافت العلامة الزرقاء على حسابك بيونيميت.');
  end if;
  perform set_config('unimate.system', 'off', true);
  perform admin_log(case when p_on then 'blue_check_on' else 'blue_check_off' end, 'user', p_user::text, '{}'::jsonb);
end $$;
