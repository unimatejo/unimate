-- Show "born in 2005" (or the full birthday) on the profile, as the student chooses. The full date stays private.
alter table public.profiles add column if not exists birth_year smallint;
alter table public.profiles add column if not exists birth_day text check (birth_day ~ '^\d{2}-\d{2}$');  -- MM-DD, only filled when shown
alter table public.profiles add column if not exists show_birth text not null default 'year' check (show_birth in ('none','year','full'));

create or replace function public.sync_birth() returns void language plpgsql security definer set search_path = public as $$
declare d date; s text;
begin
  select birth_date into d from profile_private where user_id = auth.uid();
  select show_birth into s from profiles where id = auth.uid();
  perform set_config('unimate.system', 'on', true);
  update profiles set
    birth_year = case when d is null or s = 'none' then null else extract(year from d)::smallint end,
    birth_day = case when d is not null and s = 'full' then to_char(d, 'MM-DD') else null end
  where id = auth.uid();
end $$;

create or replace function public.set_birth_date(d date)
returns void language plpgsql security definer set search_path = public as $$
begin
  update profile_private set birth_date = d where user_id = auth.uid() and d between date '1950-01-01' and current_date - interval '14 years';
  perform sync_birth();
end $$;
grant execute on function public.set_birth_date(date) to authenticated;

create or replace function public.set_birth_visibility(v text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if v not in ('none','year','full') then raise exception 'bad'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set show_birth = v where id = auth.uid();
  perform sync_birth();
end $$;
grant execute on function public.set_birth_visibility(text) to authenticated;
revoke execute on function public.sync_birth() from public, anon, authenticated;

-- fill in for everyone who already gave a birth date (year shown by default)
update profiles p set birth_year = extract(year from pp.birth_date)::smallint from profile_private pp where pp.user_id = p.id and pp.birth_date is not null and p.show_birth = 'year';
