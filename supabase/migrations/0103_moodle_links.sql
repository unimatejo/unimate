-- UniMate · 0103 Moodle calendar import.
-- A student pastes their own Moodle "export calendar" link (Moodle › Calendar › Export › Get calendar URL).
-- The moodle-import edge function reads it as that student (RLS applies) and adds each upcoming deadline once
-- (ext_uid = the Moodle event's UID). Deadlines of a course they're enrolled in count as one classmate toward the
-- section's quorum (0102). Only the owner can read or remove their link; it can't be read by anyone else.

create table if not exists public.moodle_links (
  user_id    uuid primary key references profiles(id) on delete cascade default auth.uid(),
  url        text not null check (char_length(url) <= 600 and url ~ '^https://'),
  synced_at  timestamptz,
  last_count int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.moodle_links enable row level security;
revoke all on public.moodle_links from anon;
grant select, insert, update, delete on public.moodle_links to authenticated;
drop policy if exists "moodle own" on public.moodle_links;
create policy "moodle own" on public.moodle_links for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
