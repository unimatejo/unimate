-- Admin panel helpers. Every function checks is_admin() and sensitive reads are written to the audit log.

create or replace function admin_require() returns void language plpgsql stable security definer set search_path = public as $$
begin if not is_admin() then raise exception 'admins only'; end if; end $$;

create or replace function admin_log(action text, target_type text, target_id text, meta jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  select auth.uid(), action, target_type, target_id, meta where is_admin();
$$;

create or replace function admin_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return jsonb_build_object(
    'users', (select count(*) from profiles),
    'users_7d', (select count(*) from profiles where created_at > now() - interval '7 days'),
    'active_today', (select count(distinct author_id) from posts where created_at > now() - interval '1 day'),
    'posts', (select count(*) from posts),
    'posts_7d', (select count(*) from posts where created_at > now() - interval '7 days'),
    'messages_7d', (select count(*) from messages where created_at > now() - interval '7 days'),
    'reports_open', (select count(*) from reports where status in ('open', 'reviewing')),
    'tickets_open', (select count(*) from support_tickets where status = 'open'),
    'aliases_pending', (select count(*) from place_aliases where state = 'pending'),
    'places_pending', (select count(*) from places where state = 'pending'),
    'ads_live', (select count(*) from ad_campaigns where is_active and (now() at time zone 'Asia/Amman')::date between starts_on and ends_on),
    'per_university', (select coalesce(jsonb_agg(x order by x.users desc), '[]') from (
      select u.id, u.slug, u.name_ar, u.data_status,
        (select count(*) from profiles p where p.university_id = u.id) users,
        (select count(*) from posts p where p.university_id = u.id and p.created_at > now() - interval '7 days') posts_7d
      from universities u) x)
  );
end $$;

-- user search across name, username, email and student number (private fields: admins only)
create or replace function admin_find_users(q text default '', lim int default 50)
returns table (id uuid, full_name text, username text, avatar_url text, status account_status, university text, major text,
               email text, student_number text, created_at timestamptz, post_count int, follower_count int, is_admin boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select p.id, p.full_name, p.username, p.avatar_url, p.status, u.name_ar, m.name_ar, pp.email, pp.student_number, p.created_at,
         p.post_count, p.follower_count, exists (select 1 from admins a where a.user_id = p.id)
  from profiles p
  left join profile_private pp on pp.user_id = p.id
  left join universities u on u.id = p.university_id
  left join majors m on m.id = p.major_id
  where q = '' or p.full_name ilike '%' || q || '%' or p.username ilike '%' || q || '%' or pp.email ilike '%' || q || '%' or pp.student_number = q or p.id::text = q
  order by p.created_at desc
  limit lim;
end $$;

create or replace function admin_set_status(target uuid, new_status account_status, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  update profiles set status = new_status where id = target;
  perform admin_log('set_status', 'user', target::text, jsonb_build_object('status', new_status, 'reason', reason));
end $$;

-- every conversation a user is in (metadata only; opening messages is logged separately)
create or replace function admin_user_conversations(target uuid)
returns table (id uuid, kind conversation_kind, title text, context_label text, last_message_at timestamptz, members jsonb, message_count bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select c.id, c.kind, c.title, c.context_label, c.last_message_at,
    (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'state', cm.state)) from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = c.id),
    (select count(*) from messages mm where mm.conversation_id = c.id)
  from conversations c
  where exists (select 1 from conversation_members cm where cm.conversation_id = c.id and cm.user_id = target)
  order by c.last_message_at desc;
end $$;

create or replace function admin_delete_message(msg uuid, reason text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  perform set_config('unimate.system', 'on', true);
  update messages set deleted_at = now() where id = msg;
  perform set_config('unimate.system', 'off', true);
  perform admin_log('delete_message', 'message', msg::text, jsonb_build_object('reason', reason));
end $$;

-- send an in-app notice from the UniMate team to one user, a university, or everyone
create or replace function admin_notify(title text, body text, target uuid default null, uni uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform admin_require();
  insert into notifications(user_id, kind, title, body)
  select p.id, 'system', title, body from profiles p
  where (target is null or p.id = target) and (uni is null or p.university_id = uni) and p.status = 'active';
  get diagnostics n = row_count;
  perform admin_log('notify', coalesce(case when target is not null then 'user' end, case when uni is not null then 'university' end, 'all'),
    coalesce(target, uni)::text, jsonb_build_object('title', title, 'count', n));
  return n;
end $$;

create or replace function admin_ad_stats()
returns table (campaign_id uuid, impressions bigint, clicks bigint, calls bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query select e.campaign_id, count(*) filter (where e.kind = 'impression'), count(*) filter (where e.kind = 'click'), count(*) filter (where e.kind = 'call')
  from ad_events e group by e.campaign_id;
end $$;

revoke execute on function admin_require(), admin_log(text, text, text, jsonb), admin_stats(), admin_find_users(text, int), admin_set_status(uuid, account_status, text),
  admin_user_conversations(uuid), admin_delete_message(uuid, text), admin_notify(text, text, uuid, uuid), admin_ad_stats() from public, anon;
grant execute on function admin_log(text, text, text, jsonb), admin_stats(), admin_find_users(text, int), admin_set_status(uuid, account_status, text),
  admin_user_conversations(uuid), admin_delete_message(uuid, text), admin_notify(text, text, uuid, uuid), admin_ad_stats() to authenticated;

-- the advertiser page logs phone calls too
alter table ad_events drop constraint if exists ad_events_kind_check;
alter table ad_events add constraint ad_events_kind_check check (kind in ('impression', 'click', 'directions', 'call'));

-- which conversation a reported message belongs to (no message content)
create or replace function admin_message_conversation(msg uuid)
returns uuid language plpgsql stable security definer set search_path = public as $$
declare c uuid;
begin
  perform admin_require();
  select conversation_id into c from messages where id = msg;
  return c;
end $$;
revoke execute on function admin_message_conversation(uuid) from public, anon;
grant execute on function admin_message_conversation(uuid) to authenticated;
