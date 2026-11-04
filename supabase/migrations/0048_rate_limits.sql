-- UniMate · 0048 anti-spam: one account can't flood messages, posts, comments, stories, follows, reports or new chats.
-- Over the limit the insert fails with 'rate_limited' (the app shows "استنى شوي، بعتت كثير بوقت قصير.").
-- Admins and system work (unimate.system = on, triggers/cron) are never limited.

create index if not exists messages_sender_time_idx on messages(sender_id, created_at desc);
create index if not exists comments_author_time_idx on comments(author_id, created_at desc);
create index if not exists follows_follower_time_idx on follows(follower_id, created_at desc);
create index if not exists reports_reporter_time_idx on reports(reporter_id, created_at desc);
create index if not exists conversations_creator_time_idx on conversations(created_by, created_at desc);

create or replace function private.rate_exempt(actor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select actor is null
      or coalesce(current_setting('unimate.system', true), '') = 'on'
      or exists (select 1 from admins where user_id = actor);
$$;

create or replace function private.rate_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare actor uuid; n int;
begin
  if TG_TABLE_NAME = 'messages' then
    if new.kind = 'system' then return new; end if;
    actor := new.sender_id;
    if private.rate_exempt(actor) then return new; end if;
    select count(*) into n from messages where sender_id = actor and created_at > now() - interval '1 minute';
    if n >= 30 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'messages_per_minute'; end if;
    select count(*) into n from messages where sender_id = actor and created_at > now() - interval '1 hour';
    if n >= 600 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'messages_per_hour'; end if;
  elsif TG_TABLE_NAME = 'posts' then
    actor := new.author_id;
    if private.rate_exempt(actor) then return new; end if;
    select count(*) into n from posts where author_id = actor and created_at > now() - interval '1 hour';
    if n >= 10 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'posts_per_hour'; end if;
  elsif TG_TABLE_NAME = 'comments' then
    actor := new.author_id;
    if private.rate_exempt(actor) then return new; end if;
    select count(*) into n from comments where author_id = actor and created_at > now() - interval '10 minutes';
    if n >= 30 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'comments_per_10min'; end if;
  elsif TG_TABLE_NAME = 'stories' then
    actor := new.author_id;
    if private.rate_exempt(actor) then return new; end if;
    select count(*) into n from stories where author_id = actor and created_at > now() - interval '1 day';
    if n >= 30 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'stories_per_day'; end if;
  elsif TG_TABLE_NAME = 'follows' then
    actor := new.follower_id;
    if private.rate_exempt(actor) then return new; end if;
    select count(*) into n from follows where follower_id = actor and created_at > now() - interval '1 hour';
    if n >= 60 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'follows_per_hour'; end if;
  elsif TG_TABLE_NAME = 'reports' then
    actor := new.reporter_id;
    if private.rate_exempt(actor) then return new; end if;
    select count(*) into n from reports where reporter_id = actor and created_at > now() - interval '1 day';
    if n >= 20 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'reports_per_day'; end if;
  elsif TG_TABLE_NAME = 'conversations' then
    actor := new.created_by;
    if new.kind = 'community' or private.rate_exempt(actor) then return new; end if;
    select count(*) into n from conversations where created_by = actor and created_at > now() - interval '1 hour';
    if n >= 30 then raise exception 'rate_limited' using errcode = 'P0001', hint = 'chats_per_hour'; end if;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['messages', 'posts', 'comments', 'stories', 'follows', 'reports', 'conversations'] loop
    execute format('drop trigger if exists %I on %I', t || '_rate_limit', t);
    execute format('create trigger %I before insert on %I for each row execute function private.rate_limit()', t || '_rate_limit', t);
  end loop;
end $$;
