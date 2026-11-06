-- UniMate · 0095 blocking works all the way.
-- Someone I blocked could still open my profile (name, photo, bio); now my account is invisible to them, like Instagram.
-- (I still see them in my blocked list so I can unblock.)

create or replace function public.blocked_me(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (select 1 from blocks where blocker_id = target and blocked_id = auth.uid());
$$;
revoke all on function public.blocked_me(uuid) from public, anon;
grant execute on function public.blocked_me(uuid) to authenticated;

drop policy if exists "profiles same university" on profiles;
create policy "profiles same university" on profiles for select using (
  id = auth.uid() or is_admin()
  or (university_id = my_university() and not is_team_account(id) and not blocked_me(id))
);

-- is this person blocked by me? (for the profile menu and the chat screen)
create or replace function public.i_blocked(target uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where blocker_id = auth.uid() and blocked_id = target);
$$;
revoke all on function public.i_blocked(uuid) from public, anon;
grant execute on function public.i_blocked(uuid) to authenticated;
