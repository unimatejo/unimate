-- UniMate · 0039 notes (like Instagram notes): one short line above your avatar in the inbox, gone after 24 hours.

create table if not exists public.notes (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  body       text not null check (char_length(btrim(body)) between 1 and 60),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists notes_expires_idx on public.notes(expires_at);

alter table public.notes enable row level security;
drop policy if exists "notes read" on public.notes;
create policy "notes read" on public.notes for select to authenticated using (expires_at > now());
drop policy if exists "notes own insert" on public.notes;
create policy "notes own insert" on public.notes for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "notes own update" on public.notes;
create policy "notes own update" on public.notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "notes own delete" on public.notes;
create policy "notes own delete" on public.notes for delete to authenticated using (user_id = auth.uid());

create or replace function public.set_note(p_body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into notes(user_id, body, created_at, expires_at) values (auth.uid(), btrim(p_body), now(), now() + interval '24 hours')
  on conflict (user_id) do update set body = excluded.body, created_at = now(), expires_at = now() + interval '24 hours';
end $$;

create or replace function public.clear_note()
returns void language sql security definer set search_path = public as $$
  delete from notes where user_id = auth.uid();
$$;
grant execute on function public.set_note(text), public.clear_note() to authenticated;
