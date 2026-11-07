-- UniMate · 0136 the owner builds an advertiser's banner from scratch
--
-- * An advertiser can sit in a building on campus (the café in the engineering building): picked from the campus
--   map, so «وديني» walks students there.
-- * The banner's button does one of three things, each with the owner's own words on it («اطلب الآن»,
--   «اذهب للموقع», «وديني»…): open the advertiser's site (https), walk to them on the campus map, or call them.
--   No button at all is fine too.
-- * A banner designed with its writing already on the picture shows just the picture (and «ممول», always).

alter table public.advertisers add column if not exists building_id uuid references public.buildings (id) on delete set null;
create index if not exists advertisers_building_id_fk_idx on public.advertisers (building_id);

alter table public.ad_campaigns add column if not exists cta_kind text;
alter table public.ad_campaigns add column if not exists show_text boolean not null default true;
update public.ad_campaigns set cta_kind = 'link' where cta_url is not null and cta_kind is null;
alter table public.ad_campaigns drop constraint if exists ad_campaigns_cta_kind_check;
alter table public.ad_campaigns add constraint ad_campaigns_cta_kind_check
  check (cta_kind in ('link', 'map', 'call') and (cta_kind <> 'link' or cta_url is not null));

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
  where c.is_active and c.placement = placement_filter
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

-- the advertiser's page brings its building too (its «وديني»)
drop function if exists public.advertiser_page(uuid);
create function public.advertiser_page(adv uuid)
returns table (id uuid, name text, category text, description text, phone text, hours text, menu jsonb, photos text[], logo_url text,
               lat double precision, lng double precision, building_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.category, a.description, a.phone, a.hours, a.menu, a.photos, a.logo_url, a.lat, a.lng, a.building_id
  from advertisers a
  where a.id = adv and a.is_active and (a.university_id is null or a.university_id = my_university() or is_admin());
$$;
revoke all on function public.advertiser_page(uuid) from public, anon;
grant execute on function public.advertiser_page(uuid) to authenticated, service_role;
