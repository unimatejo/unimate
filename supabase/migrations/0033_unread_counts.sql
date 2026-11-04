-- How many messages are waiting in each chat (for the number on the inbox row).
create or replace function public.unread_counts(conv_ids uuid[])
returns table (conversation_id uuid, n int)
language sql stable security invoker set search_path = public as $$
  select m.conversation_id, least(count(*), 99)::int
  from messages m join conversation_members cm on cm.conversation_id = m.conversation_id and cm.user_id = auth.uid()
  where m.conversation_id = any(conv_ids) and m.deleted_at is null and m.kind::text <> 'system'
    and m.sender_id is distinct from auth.uid() and (cm.last_read_at is null or m.created_at > cm.last_read_at)
  group by m.conversation_id;
$$;
grant execute on function public.unread_counts(uuid[]) to authenticated;
