-- Reactions on chat messages, like Instagram/Messenger: one emoji per person per message.
create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  emoji text not null check (emoji in ('❤️','😂','😮','😢','😡','👍','🔥','👏')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_conv on public.message_reactions (conversation_id);
alter table public.message_reactions enable row level security;

-- the conversation is taken from the message, so nobody can react into a chat they're not in
create or replace function public.reaction_fill() returns trigger language plpgsql security definer set search_path = public as $$
begin
  select conversation_id into new.conversation_id from messages where id = new.message_id;
  if new.conversation_id is null or not is_member(new.conversation_id) then raise exception 'not_member'; end if;
  new.user_id := auth.uid();
  return new;
end $$;
drop trigger if exists reaction_fill on public.message_reactions;
create trigger reaction_fill before insert or update on public.message_reactions for each row execute function public.reaction_fill();

drop policy if exists "reactions read" on public.message_reactions;
create policy "reactions read" on public.message_reactions for select using (is_member(conversation_id));
drop policy if exists "reactions add" on public.message_reactions;
create policy "reactions add" on public.message_reactions for insert with check (user_id = auth.uid());
drop policy if exists "reactions change" on public.message_reactions;
create policy "reactions change" on public.message_reactions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "reactions remove" on public.message_reactions;
create policy "reactions remove" on public.message_reactions for delete using (user_id = auth.uid());
grant select, insert, update, delete on public.message_reactions to authenticated;

alter table public.message_reactions replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.message_reactions;
exception when duplicate_object then null; end $$;
