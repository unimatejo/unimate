-- "Is X an admin?" can only be asked about yourself (or by an admin). Policies call is_admin() with no argument,
-- which is the signed-in user, so nothing else changes. System work (no signed-in user) still gets the real answer.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = uid)
     and (auth.uid() is null or uid = auth.uid() or exists (select 1 from admins where user_id = auth.uid()));
$$;
