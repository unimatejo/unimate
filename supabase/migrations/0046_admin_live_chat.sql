-- UniMate · 0046 live view of an open chat in the admin panel: new messages since a time (the open itself is already logged).
create or replace function public.admin_conversation_since(conv uuid, after timestamptz)
returns setof messages language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query select * from messages where conversation_id = conv and created_at > after order by created_at;
end $$;
grant execute on function public.admin_conversation_since(uuid, timestamptz) to authenticated;
