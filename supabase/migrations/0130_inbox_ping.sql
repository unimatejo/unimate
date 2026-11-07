-- UniMate · 0130 one private "you have a new message" ping per member, instead of every app watching every message
--
-- Each signed-in app listened to ALL inserts on messages (postgres_changes with no filter) to refresh its unread
-- badge. Realtime then checks row-level security for every connected student on every message sent anywhere: with
-- 500 students online, one message = 500 checks, on a single thread. Now the database sends a tiny ping (just the
-- chat's id, no text) on each recipient's own private topic «inbox:<user id>», and only that student may listen to it.
-- Big community chats (over 300 members) don't ping: their badge refreshes on open and on the regular check.

-- only the owner of «inbox:<me>» may receive on it
drop policy if exists "own inbox ping" on realtime.messages;
create policy "own inbox ping" on realtime.messages for select to authenticated
  using (realtime.topic() = 'inbox:' || (select auth.uid())::text);

create or replace function private.ping_inbox() returns trigger
language plpgsql security definer set search_path = '' as $$
declare m uuid;
begin
  if new.kind::text = 'system' then return null; end if;
  if (select count(*) from public.conversation_members where conversation_id = new.conversation_id) > 300 then return null; end if;
  for m in select user_id from public.conversation_members
           where conversation_id = new.conversation_id and state in ('active', 'request') and user_id is distinct from new.sender_id
  loop
    perform realtime.send(jsonb_build_object('c', new.conversation_id), 'msg', 'inbox:' || m::text, true);
  end loop;
  return null;
exception when others then
  return null; -- a ping that can't go never stops a message
end $$;
revoke all on function private.ping_inbox() from public, anon, authenticated;

drop trigger if exists messages_ping_inbox on public.messages;
create trigger messages_ping_inbox after insert on public.messages for each row execute function private.ping_inbox();
