-- Phase 4 hardening: no duplicate reports/swap requests, ad events that can't be inflated,
-- and one fast call for the inbox's last messages.

-- one open report per person per thing (a resolved one can be reported again)
create unique index if not exists reports_one_open on reports(reporter_id, target_type, target_id) where status in ('open', 'reviewing');

-- one live swap request per section pair
create unique index if not exists swap_requests_one_live on swap_requests(user_id, from_section_id, to_section_id) where status <> 'closed';

-- ad events remember who, so an impression counts once per person per day and clicks are capped
alter table ad_events add column if not exists user_id uuid references profiles(id) on delete set null;
create index if not exists ad_events_user_idx on ad_events(campaign_id, user_id, kind, day);

create or replace function track_ad(campaign uuid, what text)
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Amman')::date;
  n int;
begin
  if auth.uid() is null or what not in ('impression', 'click', 'directions') then return; end if;
  if not exists (select 1 from ad_campaigns c where c.id = campaign and my_university() = any(c.university_ids)) then return; end if;
  select count(*) into n from ad_events where campaign_id = campaign and user_id = auth.uid() and kind = what and day = today;
  if (what = 'impression' and n >= 1) or (what <> 'impression' and n >= 5) then return; end if;
  insert into ad_events(campaign_id, kind, user_id) values (campaign, what, auth.uid());
end $$;

-- latest visible message per conversation, for the inbox list (runs with the caller's RLS)
create or replace function inbox_last_messages(conv_ids uuid[])
returns table (conversation_id uuid, sender_id uuid, body text, kind text, created_at timestamptz)
language sql stable security invoker set search_path = public as $$
  select distinct on (m.conversation_id) m.conversation_id, m.sender_id, m.body, m.kind::text, m.created_at
  from messages m
  where m.conversation_id = any(conv_ids) and m.deleted_at is null and m.kind::text <> 'system'
  order by m.conversation_id, m.created_at desc;
$$;
grant execute on function inbox_last_messages(uuid[]) to authenticated;
