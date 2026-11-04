-- One-off lecture changes: the doctor moved or cancelled ONE lecture (posted on Teams, said in class...).
-- user_id null = for the whole section (everyone enrolled sees it); user_id = me = only my schedule.
create table if not exists public.meeting_changes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  meeting_id uuid references public.section_meetings(id) on delete cascade,
  on_date date not null,                 -- the lecture that changed (its original date)
  new_date date,                         -- where it moved to (null when cancelled)
  starts_at time, ends_at time, room_text text,
  cancelled boolean not null default false,
  note text check (char_length(note) <= 200),
  user_id uuid references public.profiles(id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (cancelled or (new_date is not null and starts_at is not null and ends_at is not null and ends_at > starts_at)),
  check (new_date is null or new_date between on_date - 60 and on_date + 60)
);
create index if not exists meeting_changes_sec on public.meeting_changes (section_id, on_date);
alter table public.meeting_changes enable row level security;
drop policy if exists "changes read" on public.meeting_changes;
create policy "changes read" on public.meeting_changes for select using ((user_id is null and is_enrolled(section_id)) or user_id = auth.uid() or is_admin());
drop policy if exists "changes add" on public.meeting_changes;
create policy "changes add" on public.meeting_changes for insert with check (created_by = auth.uid() and is_enrolled(section_id) and (user_id is null or user_id = auth.uid()));
drop policy if exists "changes remove" on public.meeting_changes;
create policy "changes remove" on public.meeting_changes for delete using (created_by = auth.uid() or user_id = auth.uid() or is_admin());
grant select, insert, delete on public.meeting_changes to authenticated;
