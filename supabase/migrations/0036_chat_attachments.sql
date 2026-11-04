-- WhatsApp-style chat attachments: stickers, documents, location, a contact (UniMate profile) and polls.
alter type message_kind add value if not exists 'sticker';
alter type message_kind add value if not exists 'location';
alter type message_kind add value if not exists 'contact';
alter type message_kind add value if not exists 'poll';

-- documents students actually send (lecture slides, assignments, sheets) up to 25MB
update storage.buckets set file_size_limit = 26214400, allowed_mime_types = array[
  'image/jpeg','image/png','image/webp','image/gif','audio/m4a','audio/mp4','audio/x-m4a','audio/aac','audio/webm','audio/ogg','audio/mpeg',
  'application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','application/zip','application/x-zip-compressed','application/octet-stream'] where id = 'chat';

-- each student's own sticker collection, kept in their account
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stickers', 'stickers', true, 1048576, array['image/png','image/webp','image/jpeg','image/gif'])
on conflict (id) do nothing;
drop policy if exists "stickers upload own" on storage.objects;
create policy "stickers upload own" on storage.objects for insert to authenticated with check (bucket_id = 'stickers' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "stickers read" on storage.objects;
create policy "stickers read" on storage.objects for select using (bucket_id = 'stickers');

create table if not exists public.my_stickers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null check (url ~ '^https://'),
  created_at timestamptz not null default now(),
  unique (user_id, url)
);
alter table public.my_stickers enable row level security;
drop policy if exists "own stickers" on public.my_stickers;
create policy "own stickers" on public.my_stickers for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.my_stickers to authenticated;
drop trigger if exists keep_deleted on public.my_stickers;
create trigger keep_deleted before delete on public.my_stickers for each row execute function archive.keep_row();

-- poll votes (one choice per person, can change it)
create table if not exists public.poll_answers (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  option smallint not null check (option between 0 and 11),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
alter table public.poll_answers enable row level security;
create or replace function public.poll_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select conversation_id into new.conversation_id from messages where id = new.message_id and kind = 'poll';
  if new.conversation_id is null or not is_member(new.conversation_id) then raise exception 'not_member'; end if;
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists poll_fill on public.poll_answers;
create trigger poll_fill before insert or update on public.poll_answers for each row execute function public.poll_fill();
drop policy if exists "poll read" on public.poll_answers;
create policy "poll read" on public.poll_answers for select using (is_member(conversation_id));
drop policy if exists "poll vote" on public.poll_answers;
create policy "poll vote" on public.poll_answers for insert with check (user_id = auth.uid());
drop policy if exists "poll change" on public.poll_answers;
create policy "poll change" on public.poll_answers for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "poll unvote" on public.poll_answers;
create policy "poll unvote" on public.poll_answers for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.poll_answers to authenticated;
alter table public.poll_answers replica identity full;
do $$ begin alter publication supabase_realtime add table public.poll_answers; exception when duplicate_object then null; end $$;
