-- UniMate · 0043 reading your own admin role failed with "infinite recursion" (the owner policy queried admins itself).
create or replace function public.is_owner()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_owner() to authenticated;
drop policy if exists "admins owner manage" on admins;
create policy "admins owner manage" on admins for all using (public.is_owner()) with check (public.is_owner());
