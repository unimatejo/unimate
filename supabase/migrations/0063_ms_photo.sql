-- UniMate · 0063 bring the Microsoft (university) profile photo in once; if the student removes it, it never comes back
alter table profile_private add column if not exists ms_photo_done boolean not null default false;
create or replace function public.ms_photo_claim()
returns boolean language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  update profile_private set ms_photo_done = true
  where user_id = auth.uid() and not ms_photo_done
    and exists (select 1 from profiles where id = auth.uid() and avatar_url is null)
  returning true into ok;
  return coalesce(ok, false);
end $$;
grant execute on function public.ms_photo_claim() to authenticated;
