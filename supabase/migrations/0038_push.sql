-- UniMate · 0038 push notifications (web push now, FCM for Android when Firebase is set up)
-- New rows in notifications, and new direct/group messages, call the `push` edge function,
-- which sends to every device the person turned notifications on for.

create extension if not exists pg_net with schema extensions;
create schema if not exists private;
revoke all on schema private from anon, authenticated;
create table if not exists private.push_cfg (k text primary key, v text not null);
-- the shared secret is inserted by hand (not in git): insert into private.push_cfg values ('secret', '...');

alter table push_tokens add column if not exists keys jsonb;          -- web push: {p256dh, auth}
alter table push_tokens add column if not exists created_at timestamptz not null default now();
create index if not exists push_tokens_user_idx on push_tokens(user_id);

-- a device signs up for pushes (a token can move to whoever signed in on it last)
create or replace function public.register_push(p_token text, p_platform text, p_keys jsonb default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_platform not in ('ios', 'android', 'web') then raise exception 'bad platform'; end if;
  insert into push_tokens(token, user_id, platform, keys, updated_at)
  values (p_token, auth.uid(), p_platform, p_keys, now())
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, keys = excluded.keys, updated_at = now();
end $$;

create or replace function public.unregister_push(p_token text)
returns void language sql security definer set search_path = public as $$
  delete from push_tokens where token = p_token and user_id = auth.uid();
$$;
grant execute on function public.register_push(text, text, jsonb), public.unregister_push(text) to authenticated;

create or replace function private.push_fire(body jsonb)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select v into s from private.push_cfg where k = 'secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://slkfyblvpewlxrifzrhg.supabase.co/functions/v1/push',
    body := body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
    timeout_milliseconds := 8000);
exception when others then null; -- a push must never stop the insert
end $$;

create or replace function private.on_notification_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from push_tokens where user_id = new.user_id) then
    perform private.push_fire(jsonb_build_object('type', 'notification', 'id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists notifications_push on notifications;
create trigger notifications_push after insert on notifications for each row execute function private.on_notification_push();

create or replace function private.on_message_push()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'system' then return null; end if;
  if exists (
    select 1 from conversations c
    join conversation_members m on m.conversation_id = c.id
    join push_tokens p on p.user_id = m.user_id
    where c.id = new.conversation_id and c.kind in ('direct', 'group')
      and m.user_id <> new.sender_id and m.state <> 'left' and not m.muted
  ) then
    perform private.push_fire(jsonb_build_object('type', 'message', 'id', new.id));
  end if;
  return null;
end $$;
drop trigger if exists messages_push on messages;
create trigger messages_push after insert on messages for each row execute function private.on_message_push();
