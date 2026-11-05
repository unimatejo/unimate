-- Rides (توصيلات): students offer seats to / from campus; others ask for a seat; the driver accepts.
-- Only people at the same university see a ride; blocked people never see each other; no phone numbers —
-- the two talk inside UniMate. Every write goes through checks and limits.

create table if not exists public.rides (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  driver_id     uuid not null default auth.uid() references profiles(id) on delete cascade,
  direction     text not null check (direction in ('to_campus', 'from_campus')),
  area          text not null check (char_length(area) between 2 and 60),
  meet_point    text check (char_length(meet_point) <= 80),
  depart_at     timestamptz not null,
  seats_total   smallint not null check (seats_total between 1 and 6),
  seats_taken   smallint not null default 0 check (seats_taken >= 0),
  price_jod     numeric(4,2) not null default 0 check (price_jod between 0 and 10),
  notes         text check (char_length(notes) <= 200),
  status        text not null default 'open' check (status in ('open', 'cancelled')),
  created_at    timestamptz not null default now(),
  check (seats_taken <= seats_total)
);
create index if not exists rides_feed_idx on public.rides(university_id, depart_at);
create index if not exists rides_driver_idx on public.rides(driver_id, created_at desc);

create table if not exists public.ride_requests (
  id         uuid primary key default gen_random_uuid(),
  ride_id    uuid not null references public.rides(id) on delete cascade,
  rider_id   uuid not null default auth.uid() references profiles(id) on delete cascade,
  seats      smallint not null default 1 check (seats between 1 and 3),
  note       text check (char_length(note) <= 140),
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (ride_id, rider_id)
);
create index if not exists ride_requests_ride_idx on public.ride_requests(ride_id);
create index if not exists ride_requests_rider_idx on public.ride_requests(rider_id, created_at desc);

alter table public.rides enable row level security;
alter table public.ride_requests enable row level security;
revoke all on public.rides, public.ride_requests from anon;
-- the app reads directly; every write goes through the functions below
revoke insert, update, delete on public.rides, public.ride_requests from authenticated;
grant select on public.rides, public.ride_requests to authenticated;

drop policy if exists "rides read" on public.rides;
create policy "rides read" on public.rides for select to authenticated using (
  driver_id = auth.uid() or is_admin()
  or (university_id = my_university() and status = 'open' and depart_at > now() - interval '2 hours'
      and not is_blocked_between(auth.uid(), driver_id)));

drop policy if exists "ride requests read" on public.ride_requests;
create policy "ride requests read" on public.ride_requests for select to authenticated using (
  rider_id = auth.uid() or is_admin()
  or exists (select 1 from rides r where r.id = ride_id and r.driver_id = auth.uid()));

-- ---------- functions ----------
create or replace function public.offer_ride(p_direction text, p_area text, p_meet text, p_depart timestamptz,
                                             p_seats int, p_price numeric, p_notes text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uni uuid := my_university(); n int; rid uuid;
begin
  if auth.uid() is null or uni is null or not is_active_user() then raise exception 'not allowed'; end if;
  if p_depart < now() + interval '5 minutes' or p_depart > now() + interval '14 days' then raise exception 'bad_time'; end if;
  select count(*) into n from rides where driver_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 6 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  select count(*) into n from rides where driver_id = auth.uid() and status = 'open' and depart_at > now();
  if n >= 10 then raise exception 'too_many_open'; end if;
  insert into rides(university_id, driver_id, direction, area, meet_point, depart_at, seats_total, price_jod, notes)
  values (uni, auth.uid(), p_direction, trim(p_area), nullif(trim(p_meet), ''), p_depart, p_seats, coalesce(p_price, 0), nullif(trim(p_notes), ''))
  returning id into rid;
  return rid;
end $$;

create or replace function public.cancel_ride(p_ride uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r rides;
begin
  select * into r from rides where id = p_ride for update;
  if r.id is null or (r.driver_id <> auth.uid() and not is_admin()) then raise exception 'not allowed'; end if;
  update rides set status = 'cancelled' where id = p_ride;
  -- tell everyone who had a seat or was waiting
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  select q.rider_id, 'ride', r.driver_id, 'انلغت التوصيلة', r.area || ' · ' || to_char(r.depart_at at time zone 'Asia/Amman', 'HH24:MI'), jsonb_build_object('ride_id', r.id)
  from ride_requests q where q.ride_id = p_ride and q.status in ('pending', 'accepted');
  update ride_requests set status = 'cancelled', decided_at = now() where ride_id = p_ride and status in ('pending', 'accepted');
  perform set_config('unimate.system', 'off', true);
  if r.driver_id <> auth.uid() then perform admin_log('cancel_ride', 'ride', p_ride::text, '{}'::jsonb); end if;
end $$;

create or replace function public.request_ride(p_ride uuid, p_seats int default 1, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r rides; qid uuid; n int;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'not allowed'; end if;
  select * into r from rides where id = p_ride;
  if r.id is null or r.status <> 'open' or r.depart_at < now() or r.university_id is distinct from my_university()
     or is_blocked_between(auth.uid(), r.driver_id) then raise exception 'not_available'; end if;
  if r.driver_id = auth.uid() then raise exception 'own_ride'; end if;
  if p_seats < 1 or p_seats > least(3, r.seats_total - r.seats_taken) then raise exception 'no_seats'; end if;
  select count(*) into n from ride_requests where rider_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 15 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into ride_requests(ride_id, rider_id, seats, note) values (p_ride, auth.uid(), p_seats, nullif(trim(p_note), ''))
  on conflict (ride_id, rider_id) do update set seats = excluded.seats, note = excluded.note, status = 'pending', created_at = now(), decided_at = null
    where ride_requests.status = 'cancelled'
  returning id into qid;
  if qid is null then raise exception 'already_requested'; end if;
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  values (r.driver_id, 'ride', auth.uid(), 'طلب مقعد بتوصيلتك',
          (select full_name from profiles where id = auth.uid()) || ' بده ' || p_seats || ' مقعد · ' || r.area,
          jsonb_build_object('ride_id', r.id));
  perform set_config('unimate.system', 'off', true);
  return qid;
end $$;

create or replace function public.answer_ride_request(p_request uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare q ride_requests; r rides;
begin
  select * into q from ride_requests where id = p_request for update;
  if q.id is null then raise exception 'not found'; end if;
  select * into r from rides where id = q.ride_id for update;          -- locks the ride: seats can't be double-booked
  if r.driver_id <> auth.uid() then raise exception 'not allowed'; end if;
  if q.status <> 'pending' or r.status <> 'open' then raise exception 'not_pending'; end if;
  if p_accept then
    if r.seats_taken + q.seats > r.seats_total then raise exception 'no_seats'; end if;
    update rides set seats_taken = seats_taken + q.seats where id = r.id;
  end if;
  update ride_requests set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = p_request;
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  values (q.rider_id, 'ride', r.driver_id, case when p_accept then 'انقبل طلبك بالتوصيلة 🚗' else 'ما انقبل طلبك بالتوصيلة' end,
          r.area || ' · ' || to_char(r.depart_at at time zone 'Asia/Amman', 'Dy HH24:MI'), jsonb_build_object('ride_id', r.id));
  perform set_config('unimate.system', 'off', true);
end $$;

-- the rider leaves (frees the seat if it was accepted)
create or replace function public.leave_ride(p_ride uuid)
returns void language plpgsql security definer set search_path = public as $$
declare q ride_requests; r rides;
begin
  select * into q from ride_requests where ride_id = p_ride and rider_id = auth.uid() for update;
  if q.id is null or q.status not in ('pending', 'accepted') then raise exception 'not found'; end if;
  select * into r from rides where id = p_ride for update;
  if q.status = 'accepted' then update rides set seats_taken = greatest(0, seats_taken - q.seats) where id = p_ride; end if;
  update ride_requests set status = 'cancelled', decided_at = now() where id = q.id;
  if q.status = 'accepted' then
    perform set_config('unimate.system', 'on', true);
    insert into notifications(user_id, kind, actor_id, title, body, data)
    values (r.driver_id, 'ride', auth.uid(), 'حدا لغى مقعده بتوصيلتك', r.area, jsonb_build_object('ride_id', r.id));
    perform set_config('unimate.system', 'off', true);
  end if;
end $$;

-- the feed with the driver's public card and my own request state (one call, no extra reads)
create or replace function public.rides_feed(p_direction text default null)
returns table(id uuid, driver_id uuid, driver_name text, driver_username text, driver_avatar text, driver_verified boolean,
              driver_title text, driver_title_verified boolean, direction text, area text, meet_point text, depart_at timestamptz,
              seats_total int, seats_taken int, price_jod numeric, notes text, my_status text, pending_count int)
language sql stable security definer set search_path = public as $$
  select r.id, r.driver_id, p.full_name, p.username, p.avatar_url, p.is_verified,
         case when p.title_verified then p.academic_title end, p.title_verified,
         r.direction, r.area, r.meet_point, r.depart_at, r.seats_total, r.seats_taken, r.price_jod, r.notes,
         (select q.status from ride_requests q where q.ride_id = r.id and q.rider_id = auth.uid()),
         case when r.driver_id = auth.uid() then (select count(*)::int from ride_requests q where q.ride_id = r.id and q.status = 'pending') else 0 end
  from rides r join profiles p on p.id = r.driver_id
  where auth.uid() is not null and r.university_id = my_university() and r.status = 'open'
    and r.depart_at > now() - interval '30 minutes' and r.depart_at < now() + interval '14 days'
    and (p_direction is null or r.direction = p_direction)
    and p.status::text = 'active'
    and not is_blocked_between(auth.uid(), r.driver_id)
  order by r.depart_at
  limit 200;
$$;

-- the driver's view of who asked (names and photos only)
create or replace function public.ride_requests_for(p_ride uuid)
returns table(id uuid, rider_id uuid, name text, username text, avatar_url text, seats int, note text, status text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select q.id, q.rider_id, p.full_name, p.username, p.avatar_url, q.seats, q.note, q.status, q.created_at
  from ride_requests q join rides r on r.id = q.ride_id join profiles p on p.id = q.rider_id
  where q.ride_id = p_ride and r.driver_id = auth.uid() and q.status <> 'cancelled'
  order by q.created_at;
$$;

revoke all on function public.offer_ride(text, text, text, timestamptz, int, numeric, text), public.cancel_ride(uuid), public.request_ride(uuid, int, text),
  public.answer_ride_request(uuid, boolean), public.leave_ride(uuid), public.rides_feed(text), public.ride_requests_for(uuid) from public, anon;
grant execute on function public.offer_ride(text, text, text, timestamptz, int, numeric, text), public.cancel_ride(uuid), public.request_ride(uuid, int, text),
  public.answer_ride_request(uuid, boolean), public.leave_ride(uuid), public.rides_feed(text), public.ride_requests_for(uuid) to authenticated;
