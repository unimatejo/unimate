-- UniMate · 0129 the inbox's two hottest calls read only what they show
--
-- inbox_last_messages and unread_counts run on every inbox open and every few seconds while it's open (the busiest
-- calls in pg_stat_statements). Both read every message of every chat and checked "may I see it" on each one, so their
-- cost grew with the whole history. Now: per chat, the newest message through the (conversation_id, created_at desc)
-- index (one row), and unread messages counted only up to 99 (what the badge shows). Same answers, same rules
-- (they still run as the student, so row-level security still decides what counts).

create or replace function public.inbox_last_messages(conv_ids uuid[])
returns table (conversation_id uuid, sender_id uuid, body text, kind text, created_at timestamptz)
language sql stable set search_path = public as $$
  select c.id, m.sender_id, m.body, m.kind::text, m.created_at
  from unnest(conv_ids[1:200]) as c(id)
  cross join lateral (
    select x.sender_id, x.body, x.kind, x.created_at from messages x
    where x.conversation_id = c.id and x.deleted_at is null and x.kind::text <> 'system'
    order by x.created_at desc limit 1
  ) m;
$$;

create or replace function public.unread_counts(conv_ids uuid[])
returns table (conversation_id uuid, n integer)
language sql stable set search_path = public as $$
  select cm.conversation_id, u.n
  from conversation_members cm
  cross join lateral (
    select count(*)::int as n from (
      select 1 from messages m
      where m.conversation_id = cm.conversation_id and m.deleted_at is null and m.kind::text <> 'system'
        and m.sender_id is distinct from (select auth.uid())
        and (cm.last_read_at is null or m.created_at > cm.last_read_at)
      order by m.created_at desc limit 99
    ) q
  ) u
  where cm.user_id = (select auth.uid()) and cm.conversation_id = any(conv_ids[1:200]) and u.n > 0;
$$;
