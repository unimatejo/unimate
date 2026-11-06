-- UniMate · 0093 the owner's controls, and badges that stay true.
-- 1) Blue check: remembers whether the owner gave it by hand, so removing a wrong title also removes a check that
--    only came from that title (and never one the owner gave).
-- 2) A verified mark (blue check or official title) means "at the university NOW": an account that hasn't signed in
--    with its university email or Microsoft for 6 months (graduated, contract ended, account closed) loses it until it
--    signs in again — then it comes back by itself. The owner and team accounts are never touched.
-- 3) The owner can change anyone's @username, or replace it with a plain numbered one.

alter table profiles add column if not exists blue_manual boolean not null default false;
alter table profiles add column if not exists lapsed_blue boolean not null default false;
alter table profiles add column if not exists lapsed_title boolean not null default false;

-- checks given by hand so far: the owner's own accounts and anyone who has one without a VIP title
select set_config('unimate.system', 'on', true);
update profiles set blue_manual = true where is_verified and not (title_verified and private.is_vip_title(academic_title));

create or replace function public.admin_set_blue_check(p_user uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform owner_require();
  if not exists (select 1 from profiles where id = p_user) then raise exception 'not found'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set is_verified = p_on, blue_manual = p_on, lapsed_blue = false where id = p_user;
  if p_on then
    insert into notifications(user_id, kind, title, body)
    values (p_user, 'system', 'حسابك صار موثّق ✓', 'انضافت العلامة الزرقاء على حسابك بيونيميت.');
  end if;
  perform set_config('unimate.system', 'off', true);
  perform admin_log(case when p_on then 'blue_check_on' else 'blue_check_off' end, 'user', p_user::text, '{}'::jsonb);
end $$;

-- setting or REMOVING a title (null = back to a normal account); a check that came only from the title goes with it
create or replace function public.admin_set_title(p_user uuid, p_title text, p_type text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform owner_require();
  perform set_config('unimate.system', 'on', true);
  update profiles set
    academic_title = p_title,
    title_verified = p_title is not null,
    lapsed_title = false,
    is_verified = blue_manual or coalesce(private.is_vip_title(p_title), false),
    account_type = coalesce(p_type, case when p_title is null then account_type when p_title = 'staff' then 'staff' else 'faculty' end)
  where id = p_user;
  perform admin_log(case when p_title is null then 'remove_title' else 'set_title' end, 'user', p_user::text, jsonb_build_object('title', p_title, 'type', p_type));
  if p_title is not null then
    insert into notifications(user_id, kind, title, body) values (p_user, 'title_verified', 'تم توثيق حسابك كـ ' || title_label(p_title), 'صار اللقب ظاهر على حسابك للكل.');
  end if;
end $$;

-- 2) the daily upkeep and the way back
create or replace function private.lapse_old_verifications() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform set_config('unimate.system', 'on', true);
  with old as (
    select p.id from profiles p join auth.users u on u.id = p.id
    where (p.is_verified or p.title_verified)
      and coalesce(u.last_sign_in_at, u.created_at) < now() - interval '180 days'
      and not exists (select 1 from admins a where a.user_id = p.id and a.role = 'owner')
      and not public.is_team_account(p.id))
  update profiles p set
    lapsed_blue = p.lapsed_blue or p.is_verified, is_verified = false,
    lapsed_title = p.lapsed_title or p.title_verified, title_verified = false
  from old where p.id = old.id;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function private.restore_verifications() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.last_sign_in_at is distinct from old.last_sign_in_at then
    perform set_config('unimate.system', 'on', true);
    update profiles set
      is_verified = is_verified or lapsed_blue, lapsed_blue = false,
      title_verified = title_verified or (lapsed_title and academic_title is not null), lapsed_title = false
    where id = new.id and (lapsed_blue or lapsed_title);
  end if;
  return new;
exception when others then return new; -- signing in must never fail because of this
end $$;
drop trigger if exists on_auth_signin_restore on auth.users;
create trigger on_auth_signin_restore after update of last_sign_in_at on auth.users for each row execute function private.restore_verifications();

select cron.unschedule('lapse-verifications') where exists (select 1 from cron.job where jobname = 'lapse-verifications');
select cron.schedule('lapse-verifications', '33 3 * * *', $$select private.lapse_old_verifications()$$);

-- 3) usernames
create or replace function public.admin_set_username(p_user uuid, p_username text default null)
returns text language plpgsql security definer set search_path = public as $$
declare u text := lower(trim(coalesce(p_username, '')));
begin
  perform owner_require();
  if u = '' then
    -- a plain numbered one, never taken
    loop
      u := 'user' || lpad((floor(random() * 100000000))::bigint::text, 8, '0');
      exit when not exists (select 1 from profiles where lower(username) = u);
    end loop;
  end if;
  if u !~ '^[a-z0-9._]{3,24}$' then raise exception 'bad_username' using errcode = 'P0001'; end if;
  if exists (select 1 from profiles where lower(username) = u and id <> p_user) then raise exception 'username_taken' using errcode = 'P0001'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set username = u, username_changed_at = now() where id = p_user;
  perform admin_log('set_username', 'user', p_user::text, jsonb_build_object('username', u));
  return u;
end $$;
revoke all on function public.admin_set_username(uuid, text) from public, anon;
grant execute on function public.admin_set_username(uuid, text) to authenticated;
