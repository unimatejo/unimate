-- Offers: in-app to everyone who keeps "offers" on; by email only to people who opted in.
alter table notification_prefs add column if not exists email_offers boolean not null default false;

create table if not exists offer_sends (
  id          uuid primary key default gen_random_uuid(),
  admin_id    uuid references profiles(id) on delete set null,
  university_id uuid references universities(id) on delete set null,
  title       text not null,
  body        text,
  link        text,
  in_app      integer not null default 0,
  emailed     integer not null default 0,
  created_at  timestamptz not null default now()
);
alter table offer_sends enable row level security;
drop policy if exists "offers admin" on offer_sends;
create policy "offers admin" on offer_sends for select using (is_admin());

-- in-app offer, respecting each student's "عروض المطاعم والمحلات" switch
create or replace function admin_send_offer(title text, body text, uni uuid default null, link text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare n int; sid uuid; reach int;
begin
  perform admin_require();
  insert into notifications(user_id, kind, title, body)
  select p.id, 'system', title, body from profiles p
  left join notification_prefs np on np.user_id = p.id
  where p.status = 'active' and (uni is null or p.university_id = uni) and coalesce(np.ads, true);
  get diagnostics n = row_count;
  select count(*) into reach from profiles p join notification_prefs np on np.user_id = p.id
   where p.status = 'active' and (uni is null or p.university_id = uni) and np.email_offers;
  insert into offer_sends(admin_id, university_id, title, body, link, in_app) values (auth.uid(), uni, title, body, link, n) returning id into sid;
  perform admin_log('offer', case when uni is null then 'all' else 'university' end, coalesce(uni::text, ''), jsonb_build_object('title', title, 'in_app', n));
  return jsonb_build_object('id', sid, 'in_app', n, 'email_reach', reach);
end $$;
revoke execute on function admin_send_offer(text, text, uuid, text) from public, anon;
grant execute on function admin_send_offer(text, text, uuid, text) to authenticated;

-- recipients for an email send; only the server (service role) may call it
create or replace function offer_email_targets(sid uuid)
returns table (user_id uuid, email text, full_name text)
language sql stable security definer set search_path = public, auth as $$
  select p.id, u.email::text, p.full_name
  from offer_sends s
  join profiles p on (s.university_id is null or p.university_id = s.university_id) and p.status = 'active'
  join notification_prefs np on np.user_id = p.id and np.email_offers
  join auth.users u on u.id = p.id and u.email is not null
  where s.id = sid;
$$;
revoke execute on function offer_email_targets(uuid) from public, anon, authenticated;
grant execute on function offer_email_targets(uuid) to service_role;
