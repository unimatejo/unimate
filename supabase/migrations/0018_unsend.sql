-- Unsend: a soft delete hides the row from the select policy, so do it in a function (sender only).
create or replace function unsend_message(msg uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update messages set deleted_at = now() where id = msg and sender_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'only the sender can unsend'; end if;
end $$;
grant execute on function unsend_message(uuid) to authenticated;
