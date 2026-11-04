-- UniMate · 0041 open the admin panel from the app without signing in again.
-- The app asks for a one-time code (admins only, valid 60 seconds, single use);
-- admin.unimate.my?h=<code> trades it with the `admin-handoff` edge function for a sign-in.
create schema if not exists private;
create table if not exists private.admin_handoff (
  code       text primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  expires_at timestamptz not null default now() + interval '60 seconds'
);

create or replace function public.admin_handoff_code()
returns text language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  delete from private.admin_handoff where expires_at < now();
  c := encode(gen_random_bytes(24), 'hex');
  insert into private.admin_handoff(code, user_id) values (c, auth.uid());
  return c;
end $$;
revoke all on function public.admin_handoff_code() from public, anon;
grant execute on function public.admin_handoff_code() to authenticated;

-- used only by the edge function (service role)
create or replace function public.admin_handoff_take(p_code text)
returns uuid language sql security definer set search_path = public as $$
  delete from private.admin_handoff where code = p_code and expires_at > now() returning user_id;
$$;
revoke all on function public.admin_handoff_take(text) from public, anon, authenticated;
