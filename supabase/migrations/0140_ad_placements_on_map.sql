-- UniMate · 0140 one ad, as many places as the owner picks
--
-- * An ad can show in any of the banner places at once (Home, between posts, the market), picked together, or in none
--   of them when it is only for the map.
-- * Whether a shop is on the campus map is the owner's choice too: placed and switched on, its gold pin shows;
--   switched off, the pin leaves the map and the shop's ads stay.

alter table public.ad_campaigns add column if not exists placements ad_placement[];
update public.ad_campaigns set placements = array[placement] where placements is null;
alter table public.ad_campaigns alter column placements set default '{home_banner}', alter column placements set not null;
alter table public.ad_campaigns drop constraint if exists ad_campaigns_placements_check;
alter table public.ad_campaigns add constraint ad_campaigns_placements_check check (cardinality(placements) <= 3 and not 'map_pin' = any(placements));
drop index if exists public.ad_campaigns_live_idx;
alter table public.ad_campaigns drop column placement;
create index if not exists ad_campaigns_live_idx on public.ad_campaigns (starts_on, ends_on) where is_active;

drop function if exists public.live_ads(ad_placement);
create function public.live_ads(placement_filter ad_placement)
returns table (campaign_id uuid, advertiser_id uuid, advertiser_name text, title text, body text, image_url text, offer text,
               lat double precision, lng double precision, logo_url text, cta_url text, cta_label text, priority smallint,
               cta_kind text, show_text boolean, building_id uuid, phone text)
language sql stable security definer set search_path = public as $$
  with now_jo as (select (now() at time zone 'Asia/Amman') t)
  select c.id, a.id, a.name, c.title, c.body, c.image_url, c.offer, a.lat, a.lng, a.logo_url, c.cta_url, c.cta_label, c.priority,
         c.cta_kind, c.show_text, a.building_id, case when c.cta_kind = 'call' then a.phone end
  from ad_campaigns c join advertisers a on a.id = c.advertiser_id and a.is_active, now_jo
  where c.is_active and placement_filter = any(c.placements)
    and my_university() = any(c.university_ids)
    and (cardinality(c.college_ids) = 0 or (select college_id from profiles where id = auth.uid()) = any(c.college_ids))
    and now_jo.t::date between c.starts_on and c.ends_on
    and (c.daily_from is null or c.daily_to is null
         or (c.daily_from <= c.daily_to and now_jo.t::time between c.daily_from and c.daily_to)
         or (c.daily_from > c.daily_to and (now_jo.t::time >= c.daily_from or now_jo.t::time <= c.daily_to)))
  order by c.priority desc, random()
  limit 5;
$$;
revoke all on function public.live_ads(ad_placement) from public, anon;
grant execute on function public.live_ads(ad_placement) to authenticated, service_role;

-- ---------------------------------------------------------------- the shop on the map, by choice

alter table public.advertisers add column if not exists on_map boolean not null default true;

create or replace function private.sync_ad_place()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from places where advertiser_id = new.id and created_by is null order by created_at limit 1;
  if new.is_active and new.on_map and new.university_id is not null and new.lat is not null and new.lng is not null then
    if pid is null then
      insert into places(university_id, kind, name_ar, description, lat, lng, photo_url, advertiser_id, state, building_id)
      values (new.university_id, private.ad_place_kind(new.category), new.name, new.hours, new.lat, new.lng, new.logo_url, new.id, 'approved', new.building_id);
    else
      update places set university_id = new.university_id, kind = private.ad_place_kind(new.category), name_ar = new.name, description = new.hours,
             lat = new.lat, lng = new.lng, photo_url = new.logo_url, building_id = new.building_id, state = 'approved'
       where id = pid;
    end if;
  elsif pid is not null then
    update places set state = 'rejected' where id = pid;
  end if;
  return new;
end $$;

drop trigger if exists advertisers_place on public.advertisers;
create trigger advertisers_place after insert or update of is_active, on_map, university_id, lat, lng, name, category, hours, logo_url, building_id
  on public.advertisers for each row execute function private.sync_ad_place();
