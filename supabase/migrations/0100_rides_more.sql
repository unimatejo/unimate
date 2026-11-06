-- UniMate · 0100 rides that fit real trips.
-- 1) A ride can pass through more than one area (up to 4 in all), and say where on campus it stops (a gate, the dorms…).
-- 2) "بدي توصيلة": a student can post that they NEED a ride; a classmate with a car answers "بوصلك" and the poster accepts.
-- 3) A phone number is optional, and only the two sides of an accepted seat ever see it (never the feed, never strangers).

alter table public.rides add column if not exists kind text not null default 'offer';
alter table public.rides drop constraint if exists rides_kind_check;
alter table public.rides add constraint rides_kind_check check (kind in ('offer', 'need'));
alter table public.rides add column if not exists stops text[] not null default '{}';
alter table public.rides drop constraint if exists rides_stops_check;
alter table public.rides add constraint rides_stops_check check (cardinality(stops) <= 3);
alter table public.rides add column if not exists campus_spot text;
alter table public.rides drop constraint if exists rides_campus_spot_check;
alter table public.rides add constraint rides_campus_spot_check check (char_length(campus_spot) <= 40);

-- phones live apart from the rides so a select on rides can never leak one
create table if not exists public.ride_phones (
  ride_id uuid not null references public.rides(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  phone   text not null check (phone ~ '^07[789][0-9]{7}$'),
  primary key (ride_id, user_id)
);
alter table public.ride_phones enable row level security;
revoke all on public.ride_phones from anon, authenticated;

-- "0791234567", "+962 79 123 4567", "00962791234567" → "0791234567"; anything else → null (bad_phone)
create or replace function private.jo_mobile(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p is null or btrim(p) = '' then null
    when regexp_replace(p, '[^0-9]', '', 'g') ~ '^(00962|962)?0?7[789][0-9]{7}$'
      then '0' || right(regexp_replace(p, '[^0-9]', '', 'g'), 9)
  end;
$$;

create or replace function private.save_ride_phone(p_ride uuid, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
declare ph text := private.jo_mobile(p_phone);
begin
  if coalesce(btrim(p_phone), '') = '' then
    delete from ride_phones where ride_id = p_ride and user_id = auth.uid();
    return;
  end if;
  if ph is null then raise exception 'bad_phone' using errcode = 'P0001'; end if;
  insert into ride_phones(ride_id, user_id, phone) values (p_ride, auth.uid(), ph)
  on conflict (ride_id, user_id) do update set phone = excluded.phone;
end $$;

-- clean area names: trimmed, 2–40 letters, no repeats, never the main area again
create or replace function private.ride_stops(p_area text, p_stops text[]) returns text[]
language sql immutable set search_path = '' as $$
  select coalesce(array_agg(s order by o), '{}') from (
    select distinct on (lower(s)) s, o
    from unnest(coalesce(p_stops, '{}')) with ordinality u(raw, o), lateral (select regexp_replace(btrim(raw), '\s+', ' ', 'g') s) x
    where char_length(s) between 2 and 40 and lower(s) <> lower(btrim(p_area))
    order by lower(s), o) d;
$$;

drop function if exists public.offer_ride(text, text, text, timestamptz, int, numeric, text);
create or replace function public.offer_ride(p_direction text, p_area text, p_meet text, p_depart timestamptz,
                                             p_seats int, p_price numeric, p_notes text,
                                             p_kind text default 'offer', p_stops text[] default '{}', p_campus_spot text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare uni uuid := my_university(); n int; rid uuid; st text[] := private.ride_stops(p_area, p_stops);
begin
  if auth.uid() is null or uni is null or not is_active_user() then raise exception 'not allowed'; end if;
  if p_kind not in ('offer', 'need') then raise exception 'bad_kind'; end if;
  if p_depart < now() + interval '5 minutes' or p_depart > now() + interval '14 days' then raise exception 'bad_time'; end if;
  if cardinality(st) > 3 then raise exception 'too_many_stops' using errcode = 'P0001'; end if;
  if p_kind = 'need' and (p_seats < 1 or p_seats > 3) then raise exception 'no_seats'; end if;
  select count(*) into n from rides where driver_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 6 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  select count(*) into n from rides where driver_id = auth.uid() and status = 'open' and depart_at > now();
  if n >= 10 then raise exception 'too_many_open'; end if;
  insert into rides(university_id, driver_id, kind, direction, area, stops, meet_point, campus_spot, depart_at, seats_total, price_jod, notes)
  values (uni, auth.uid(), p_kind, p_direction, regexp_replace(btrim(p_area), '\s+', ' ', 'g'), st, nullif(btrim(p_meet), ''),
          nullif(btrim(p_campus_spot), ''), p_depart, p_seats, coalesce(p_price, 0), nullif(btrim(p_notes), ''))
  returning id into rid;
  perform private.save_ride_phone(rid, p_phone);
  return rid;
end $$;

-- asking for a seat (an offer) or answering "بوصلك" (a need); a phone is optional
drop function if exists public.request_ride(uuid, int, text);
create or replace function public.request_ride(p_ride uuid, p_seats int default 1, p_note text default null, p_phone text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r rides; qid uuid; n int; seats int;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'not allowed'; end if;
  select * into r from rides where id = p_ride;
  if r.id is null or r.status <> 'open' or r.depart_at < now() or r.university_id is distinct from my_university()
     or is_blocked_between(auth.uid(), r.driver_id) then raise exception 'not_available'; end if;
  if r.driver_id = auth.uid() then raise exception 'own_ride'; end if;
  -- a need is answered by one driver who takes everyone on it
  seats := case when r.kind = 'need' then r.seats_total else p_seats end;
  if r.kind = 'need' then
    if r.seats_taken > 0 then raise exception 'no_seats'; end if;
  elsif p_seats < 1 or p_seats > least(3, r.seats_total - r.seats_taken) then raise exception 'no_seats'; end if;
  select count(*) into n from ride_requests where rider_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 15 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into ride_requests(ride_id, rider_id, seats, note) values (p_ride, auth.uid(), seats, nullif(btrim(p_note), ''))
  on conflict (ride_id, rider_id) do update set seats = excluded.seats, note = excluded.note, status = 'pending', created_at = now(), decided_at = null
    where ride_requests.status = 'cancelled'
  returning id into qid;
  if qid is null then raise exception 'already_requested'; end if;
  perform private.save_ride_phone(p_ride, p_phone);
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  values (r.driver_id, 'ride', auth.uid(),
          case when r.kind = 'need' then 'حدا بده يوصلك 🚗' else 'طلب مقعد بتوصيلتك' end,
          (select full_name from profiles where id = auth.uid()) || case when r.kind = 'need' then ' · ' else ' بده ' || seats || ' مقعد · ' end || r.area,
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
  values (q.rider_id, 'ride', r.driver_id,
          case when p_accept and r.kind = 'need' then 'انقبل عرضك، رح توصله 🚗' when p_accept then 'انقبل طلبك بالتوصيلة 🚗'
               when r.kind = 'need' then 'لقى حدا ثاني يوصله' else 'ما انقبل طلبك بالتوصيلة' end,
          r.area || ' · ' || to_char(r.depart_at at time zone 'Asia/Amman', 'Dy HH24:MI'), jsonb_build_object('ride_id', r.id));
  -- a need is settled once someone is accepted: tell the others politely
  if p_accept and r.kind = 'need' then
    insert into notifications(user_id, kind, actor_id, title, body, data)
    select o.rider_id, 'ride', r.driver_id, 'لقى حدا ثاني يوصله', r.area, jsonb_build_object('ride_id', r.id)
    from ride_requests o where o.ride_id = r.id and o.status = 'pending' and o.id <> q.id;
    update ride_requests set status = 'declined', decided_at = now() where ride_id = r.id and status = 'pending' and id <> q.id;
  end if;
  perform set_config('unimate.system', 'off', true);
end $$;

-- the phones I may see on a ride: the other side of every accepted seat, nobody else
create or replace function public.ride_phones_for(p_ride uuid)
returns table(user_id uuid, phone text)
language sql stable security definer set search_path = public as $$
  select ph.user_id, ph.phone from ride_phones ph join rides r on r.id = ph.ride_id
  where ph.ride_id = p_ride and ph.user_id <> auth.uid() and r.status = 'open'
    and (
      -- I'm the poster: phones of the people I accepted
      (r.driver_id = auth.uid() and exists (select 1 from ride_requests q where q.ride_id = r.id and q.rider_id = ph.user_id and q.status = 'accepted'))
      -- I was accepted: the poster's phone
      or (ph.user_id = r.driver_id and exists (select 1 from ride_requests q where q.ride_id = r.id and q.rider_id = auth.uid() and q.status = 'accepted')));
$$;

-- points: the one driving earns them (the poster on an offer, the one who answered on a need)
create or replace function private.points_rides()
returns trigger language plpgsql security definer set search_path = public as $$
declare drv uuid; k text;
begin
  select driver_id, kind into drv, k from rides where id = new.ride_id;
  if k = 'need' then drv := new.rider_id; end if;
  if new.status = 'accepted' and old.status is distinct from 'accepted' then
    perform private.award(drv, 'ride_seat', 3 * new.seats, new.id::text);
  elsif old.status = 'accepted' and new.status <> 'accepted' then
    perform private.unaward(drv, 'ride_seat', new.id::text);
  end if;
  return new;
end $$;

drop function if exists public.rides_feed(text);
create or replace function public.rides_feed(p_direction text default null)
returns table(id uuid, driver_id uuid, driver_name text, driver_username text, driver_avatar text, driver_verified boolean,
              driver_title text, driver_title_verified boolean, kind text, direction text, area text, stops text[], meet_point text,
              campus_spot text, depart_at timestamptz, seats_total int, seats_taken int, price_jod numeric, notes text, my_status text, pending_count int)
language sql stable security definer set search_path = public as $$
  select r.id, r.driver_id, p.full_name, p.username, p.avatar_url, p.is_verified,
         case when p.title_verified then p.academic_title end, p.title_verified,
         r.kind, r.direction, r.area, r.stops, r.meet_point, r.campus_spot, r.depart_at, r.seats_total, r.seats_taken, r.price_jod, r.notes,
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

revoke all on function private.jo_mobile(text), private.save_ride_phone(uuid, text), private.ride_stops(text, text[]) from public, anon, authenticated;
revoke all on function public.offer_ride(text, text, text, timestamptz, int, numeric, text, text, text[], text, text),
  public.request_ride(uuid, int, text, text), public.ride_phones_for(uuid), public.rides_feed(text) from public, anon;
grant execute on function public.offer_ride(text, text, text, timestamptz, int, numeric, text, text, text[], text, text),
  public.request_ride(uuid, int, text, text), public.ride_phones_for(uuid), public.rides_feed(text) to authenticated;
