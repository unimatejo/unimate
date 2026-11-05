-- UniMate · 0061 bad words in group / course / community chats: the message is hidden, the sender gets a
-- strike and a mute that grows with every 3 strikes (the owner's ladder):
--   10 min ×3 → 1 h ×3 → 3 h ×3 → 5 h ×3 → 10 h ×3 → 1 day ×3 → 3 days ×3 → 1 week ×3
-- after that every strike is a 1-week mute plus an alert to the admins and a review item.
-- A muted person can't send to any group / community chat until the mute ends. Private chats are unaffected.

create table if not exists public.chat_strikes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete set null,
  word            text,
  created_at      timestamptz not null default now()
);
create index if not exists chat_strikes_user on public.chat_strikes(user_id, created_at desc);

create table if not exists public.chat_mutes (
  user_id    uuid primary key references profiles(id) on delete cascade,
  until      timestamptz not null,
  level      int not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.chat_strikes enable row level security;
alter table public.chat_mutes enable row level security;
drop policy if exists "strikes own or admin" on public.chat_strikes;
create policy "strikes own or admin" on public.chat_strikes for select using (user_id = auth.uid() or is_admin());
drop policy if exists "mutes own or admin" on public.chat_mutes;
create policy "mutes own or admin" on public.chat_mutes for select using (user_id = auth.uid() or is_admin());

create or replace function private.mute_for(n int)
returns interval language sql immutable as $$
  select (array['10 minutes', '1 hour', '3 hours', '5 hours', '10 hours', '1 day', '3 days', '7 days']::interval[])[least((n - 1) / 3, 7) + 1];
$$;

-- muted people can't post in group chats
create or replace function private.chat_mute_check()
returns trigger language plpgsql security definer set search_path = public as $$
declare u timestamptz;
begin
  if new.kind = 'system' or current_setting('unimate.system', true) = 'on' then return new; end if;
  if not exists (select 1 from conversations c where c.id = new.conversation_id and c.kind in ('group', 'community')) then return new; end if;
  select until into u from chat_mutes where user_id = new.sender_id and until > now();
  if u is not null then raise exception 'chat_muted:%', to_char(u at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'); end if;
  return new;
end $$;
drop trigger if exists messages_a_muted on messages;
create trigger messages_a_muted before insert on messages for each row execute function private.chat_mute_check();

-- the word check for group messages: hide + strike + mute (replaces the 0051 version)
create or replace function private.mod_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text; n int; dur interval;
begin
  if new.kind <> 'text' or new.body is null then return new; end if;
  if not exists (select 1 from conversations c where c.id = new.conversation_id and c.kind in ('group', 'community')) then return new; end if;
  h := private.mod_hits(new.body);
  if h is null then return new; end if;
  new.deleted_at := now();
  -- platform admins are never muted, but their message is still hidden
  if exists (select 1 from admins a where a.user_id = new.sender_id) then return new; end if;
  insert into chat_strikes(user_id, conversation_id, word) values (new.sender_id, new.conversation_id, left(h, 200));
  select count(*) into n from chat_strikes where user_id = new.sender_id;
  dur := private.mute_for(n);
  insert into chat_mutes(user_id, until, level, updated_at) values (new.sender_id, now() + dur, least((n - 1) / 3, 8), now())
  on conflict (user_id) do update set until = greatest(chat_mutes.until, excluded.until), level = excluded.level, updated_at = now();
  if n > 24 then
    insert into moderation_queue(target_type, target_id, author_id, reason, matched, excerpt)
    values ('message', new.id::text, new.sender_id, 'words', 'مستخدم بيتكرر منه السب (' || n || ' مرة)', left(new.body, 500));
    perform private.admin_alert('chat-repeat-' || new.sender_id, 'مستخدم بيتكرر منه السب', 'وصل ' || n || ' مخالفة بالجروبات. افتح «فحص المحتوى».', '/admin/moderation');
  end if;
  return new;
end $$;

-- the app: my current mute (null = free)
create or replace function public.my_chat_mute()
returns timestamptz language sql stable security definer set search_path = public as $$
  select until from chat_mutes where user_id = auth.uid() and until > now();
$$;
grant execute on function public.my_chat_mute() to authenticated;

-- admin panel: strikes + mute of one person, and lifting it
create or replace function public.admin_chat_strikes(target uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return jsonb_build_object(
    'count', (select count(*) from chat_strikes where user_id = target),
    'last', (select max(created_at) from chat_strikes where user_id = target),
    'until', (select until from chat_mutes where user_id = target and until > now()),
    'level', (select level from chat_mutes where user_id = target),
    'recent', (select coalesce(jsonb_agg(jsonb_build_object('word', word, 'at', created_at) order by created_at desc), '[]')
               from (select word, created_at from chat_strikes where user_id = target order by created_at desc limit 5) x));
end $$;
grant execute on function public.admin_chat_strikes(uuid) to authenticated;

create or replace function public.admin_unmute(target uuid, p_reset boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  update chat_mutes set until = now(), updated_at = now() where user_id = target;
  if p_reset then delete from chat_strikes where user_id = target; delete from chat_mutes where user_id = target; end if;
  perform admin_log('unmute_chat', 'user', target::text, jsonb_build_object('reset', p_reset));
end $$;
grant execute on function public.admin_unmute(uuid, boolean) to authenticated;
