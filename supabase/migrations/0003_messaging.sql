-- UniMate · 0003 messaging: DMs, requests, groups, vanishing, streaks, calls, admin review

create type conversation_kind as enum ('direct', 'group', 'community');
create type member_state as enum ('active', 'request', 'left');
create type message_kind as enum ('text', 'image', 'view_once', 'voice', 'file', 'system', 'post_share', 'story_reply', 'social_share');
create type call_kind as enum ('voice', 'video');
create type call_status as enum ('ringing', 'active', 'ended', 'missed', 'declined');

create table conversations (
  id                uuid primary key default gen_random_uuid(),
  kind              conversation_kind not null default 'direct',
  university_id     uuid references universities(id) on delete cascade,
  community_id      uuid references communities(id) on delete cascade,
  title             text,
  context_label     text,  -- e.g. "من جروب: رسم هندسي · شعبة 3"
  vanish            vanish_mode not null default 'h24',
  block_screenshots boolean not null default true,
  streak_days       integer not null default 0,
  streak_last_day   date,
  last_message_at   timestamptz not null default now(),
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);
create unique index conversations_one_per_community on conversations(community_id) where kind = 'community';

create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  state           member_state not null default 'active',
  last_read_at    timestamptz,
  last_sent_day   date,
  muted           boolean not null default false,
  joined_at       timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on conversation_members(user_id, state);

create table messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id       uuid references profiles(id) on delete set null,
  kind            message_kind not null default 'text',
  body            text check (char_length(body) <= 4000),
  media_url       text,
  ref_id          uuid,
  is_saved        boolean not null default false,
  viewed_once_at  timestamptz,
  vanishes_at     timestamptz,          -- hidden from members after this, kept 30 days for safety review
  deleted_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index messages_conv_idx on messages(conversation_id, created_at desc);
create index messages_purge_idx on messages(vanishes_at) where not is_saved;

create table screenshot_events (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id         uuid not null references profiles(id) on delete cascade,
  platform        text,
  created_at      timestamptz not null default now()
);

create table calls (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  caller_id       uuid not null references profiles(id) on delete cascade,
  kind            call_kind not null,
  status          call_status not null default 'ringing',
  room_name       text not null default encode(gen_random_bytes(12), 'hex'),
  started_at      timestamptz,
  ended_at        timestamptz,
  created_at      timestamptz not null default now()
);
create index calls_conv_idx on calls(conversation_id, created_at desc);

-- ---------- helpers ----------
create or replace function is_member(conv uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from conversation_members where conversation_id = conv and user_id = uid and state <> 'left');
$$;

create or replace function vanish_interval(m vanish_mode)
returns interval language sql immutable as $$
  select case m when 'h24' then interval '24 hours' when 'd7' then interval '7 days' else null end;
$$;

-- can `sender` start a conversation with `target`? returns 'active', 'request' or raises
create or replace function dm_entry_state(sender uuid, target uuid)
returns member_state language plpgsql stable security definer set search_path = public as $$
declare t profiles; s profiles;
begin
  select * into t from profiles where id = target;
  select * into s from profiles where id = sender;
  if t.id is null or t.status <> 'active' then raise exception 'user unavailable'; end if;
  if t.university_id is distinct from s.university_id then raise exception 'different university'; end if;
  if is_blocked_between(sender, target) then raise exception 'blocked'; end if;
  -- people who already know each other skip the request box
  if follows_accepted(target, sender) or follows_accepted(sender, target) then
    return 'active';
  end if;
  if t.who_can_message = 'nobody' then raise exception 'not accepting messages'; end if;
  if t.who_can_message = 'college' and t.college_id is distinct from s.college_id then raise exception 'not accepting messages'; end if;
  if t.who_can_message = 'major' and t.major_id is distinct from s.major_id then raise exception 'not accepting messages'; end if;
  return 'request';
end $$;

-- open or reuse a direct conversation
create or replace function start_direct(target uuid, context text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare conv uuid; entry member_state; me uuid := auth.uid(); today_requests int;
begin
  if not is_active_user(me) then raise exception 'account not active'; end if;
  select c.id into conv from conversations c
  join conversation_members a on a.conversation_id = c.id and a.user_id = me
  join conversation_members b on b.conversation_id = c.id and b.user_id = target
  where c.kind = 'direct' limit 1;
  if conv is not null then
    update conversation_members set state = 'active' where conversation_id = conv and user_id = me and state = 'left';
    return conv;
  end if;

  entry := dm_entry_state(me, target);
  if entry = 'request' then
    select count(*) into today_requests from conversations c
    join conversation_members m on m.conversation_id = c.id and m.state = 'request'
    where c.created_by = me and c.created_at > now() - interval '1 day';
    if today_requests >= 10 then raise exception 'daily request limit reached'; end if;
  end if;

  insert into conversations (kind, university_id, context_label, vanish, block_screenshots, created_by)
  select 'direct', p.university_id, context, p.default_vanish, p.block_screenshots, me from profiles p where p.id = me
  returning id into conv;
  insert into conversation_members (conversation_id, user_id, state) values (conv, me, 'active'), (conv, target, entry);
  return conv;
end $$;

create or replace function answer_request(conv uuid, accept boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('unimate.system', 'on', true);
  if accept then
    update conversation_members set state = 'active' where conversation_id = conv and user_id = auth.uid() and state = 'request';
  else
    -- ignoring is silent: the sender is never told
    update conversation_members set state = 'left' where conversation_id = conv and user_id = auth.uid() and state = 'request';
  end if;
  perform set_config('unimate.system', 'off', true);
end $$;

-- stamp vanish time, bump streak and last_message_at
create or replace function on_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare c conversations; today date := (now() at time zone 'Asia/Amman')::date; others_today int;
begin
  perform set_config('unimate.system', 'on', true);
  select * into c from conversations where id = new.conversation_id;
  if new.kind <> 'system' and new.vanishes_at is null and c.vanish in ('h24', 'd7') then
    new.vanishes_at := now() + vanish_interval(c.vanish);
  end if;
  update conversations set last_message_at = now() where id = new.conversation_id;

  if c.kind = 'direct' and new.sender_id is not null then
    update conversation_members set last_sent_day = today where conversation_id = c.id and user_id = new.sender_id;
    select count(*) into others_today from conversation_members
      where conversation_id = c.id and user_id <> new.sender_id and last_sent_day = today;
    if others_today > 0 and c.streak_last_day is distinct from today then
      update conversations set
        streak_days = case when c.streak_last_day = today - 1 then c.streak_days + 1 else 1 end,
        streak_last_day = today
      where id = c.id;
    end if;
  end if;
  perform set_config('unimate.system', 'off', true);
  return new;
end $$;
create trigger messages_before_insert before insert on messages for each row execute function on_message_insert();

-- members may only toggle is_saved; only the sender may unsend (deleted_at)
create or replace function guard_message_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' then return new; end if;
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
create trigger messages_guard before update on messages for each row execute function guard_message_update();

-- 'after_view' mode: a message vanishes once the other side has read it
create or replace function mark_read(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('unimate.system', 'on', true);
  update conversation_members set last_read_at = now() where conversation_id = conv and user_id = auth.uid();
  update messages m set vanishes_at = now()
  from conversations c
  where m.conversation_id = conv and c.id = conv and c.vanish = 'after_view'
    and m.sender_id <> auth.uid() and m.vanishes_at is null and not m.is_saved and m.kind <> 'system';
  perform set_config('unimate.system', 'off', true);
end $$;

create or replace function open_view_once(msg uuid)
returns text language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = msg;
  if not is_member(m.conversation_id) or m.sender_id = auth.uid() then raise exception 'not allowed'; end if;
  if m.kind <> 'view_once' or m.viewed_once_at is not null then return null; end if;
  perform set_config('unimate.system', 'on', true);
  update messages set viewed_once_at = now(), vanishes_at = now() + interval '10 seconds' where id = msg;
  perform set_config('unimate.system', 'off', true);
  return m.media_url;
end $$;

create or replace function report_screenshot(conv uuid, plat text)
returns void language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if not is_member(conv) then raise exception 'not a member'; end if;
  insert into screenshot_events(conversation_id, user_id, platform) values (conv, auth.uid(), plat);
  select full_name into who from profiles where id = auth.uid();
  insert into messages(conversation_id, sender_id, kind, body) values (conv, null, 'system', who || ' أخذ لقطة شاشة');
end $$;

-- ---------- admin review (every open is logged) ----------
create or replace function admin_conversation_messages(conv uuid, reason text default null)
returns setof messages language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins only'; end if;
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'open_conversation', 'conversation', conv::text, jsonb_build_object('reason', reason));
  return query select * from messages where conversation_id = conv order by created_at;
end $$;

-- purge vanished, unsaved messages after the 30-day safety window, unless under report
create or replace function purge_vanished_messages()
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from messages m
  where not m.is_saved and m.vanishes_at < now() - interval '30 days'
    and not exists (
      select 1 from reports r where r.status in ('open', 'reviewing')
        and ((r.target_type = 'conversation' and r.target_id = m.conversation_id) or (r.target_type = 'message' and r.target_id = m.id))
    );
  get diagnostics n = row_count;
  delete from stories where expires_at < now() - interval '30 days' and not is_highlighted;
  return n;
end $$;

-- ---------- RLS ----------
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
alter table screenshot_events enable row level security;
alter table calls enable row level security;

create policy "conversations members" on conversations for select using (is_member(id) or is_admin());
create policy "conversations settings" on conversations for update using (is_member(id)) with check (is_member(id));
create policy "conversations admin" on conversations for delete using (is_admin());

create policy "members see members" on conversation_members for select using (is_member(conversation_id) or user_id = auth.uid() or is_admin());
create policy "members self" on conversation_members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- members see live messages; requesters see only the first message preview
create policy "messages read" on messages for select using (
  is_member(conversation_id)
  and deleted_at is null
  and (is_saved or vanishes_at is null or vanishes_at > now())
);
create policy "messages send" on messages for insert with check (
  sender_id = auth.uid() and is_active_user()
  and kind <> 'system'
  and exists (
    select 1 from conversation_members m
    where m.conversation_id = messages.conversation_id and m.user_id = auth.uid() and m.state = 'active'
  )
  and not exists (
    select 1 from conversation_members o join conversations c on c.id = o.conversation_id
    where o.conversation_id = messages.conversation_id and c.kind = 'direct' and o.user_id <> auth.uid()
      and is_blocked_between(auth.uid(), o.user_id)
  )
);
-- members can save / unsave; senders can unsend
create policy "messages update" on messages for update using (is_member(conversation_id)) with check (is_member(conversation_id));

create policy "screens read" on screenshot_events for select using (is_member(conversation_id) or is_admin());

create policy "calls read" on calls for select using (is_member(conversation_id) or is_admin());
create policy "calls start" on calls for insert with check (caller_id = auth.uid() and is_member(conversation_id));
create policy "calls update" on calls for update using (is_member(conversation_id)) with check (is_member(conversation_id));
