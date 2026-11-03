-- Deleting an account sets messages.sender_id to null (on delete set null); the edit guard must allow that.
create or replace function guard_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' or auth.uid() is null then return new; end if;
  if new.sender_id is null and old.sender_id is not null
     and new.body is not distinct from old.body and new.media_url is not distinct from old.media_url and new.kind = old.kind then
    return new; -- the sender's account was deleted
  end if;
  if new.body is distinct from old.body or new.media_url is distinct from old.media_url
     or new.kind is distinct from old.kind or new.sender_id is distinct from old.sender_id
     or new.vanishes_at is distinct from old.vanishes_at or new.viewed_once_at is distinct from old.viewed_once_at then
    raise exception 'messages cannot be edited';
  end if;
  if new.deleted_at is distinct from old.deleted_at and old.sender_id <> auth.uid() then
    raise exception 'only the sender can unsend';
  end if;
  return new;
end $$;
