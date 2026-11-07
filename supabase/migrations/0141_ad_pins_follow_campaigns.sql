-- UniMate · 0141 a shop's pin and page follow its ads
--
-- * The gold pin of a shop shows on the campus map only while one of its ads is switched on and inside its dates,
--   so a finished or stopped ad takes its pin with it. Students see less than before, never more.
-- * A student reached by an ad for a shop of another university can open that shop's page and its map.

/** a shop has an ad running today (switched on and inside its dates, in Amman time) */
create or replace function private.ad_live(adv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ad_campaigns c join advertisers a on a.id = c.advertiser_id and a.is_active
     where c.advertiser_id = adv and c.is_active
       and (now() at time zone 'Asia/Amman')::date between c.starts_on and c.ends_on);
$$;
revoke all on function private.ad_live(uuid) from public, anon;
grant execute on function private.ad_live(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- the pin, only while an ad runs

drop policy if exists "places read" on public.places;
create policy "places read" on public.places for select to authenticated using (
  (university_id = (select my_university()) and state = 'approved' and (advertiser_id is null or private.ad_live(advertiser_id)))
  or created_by = (select auth.uid()) or (select is_admin()));

create or replace function public.campus_pins(p_university uuid)
returns table (id uuid, kind text, name_ar text, name_en text, sub text, lat double precision, lng double precision, advertiser_id uuid)
language sql stable security definer set search_path = public as $$
  select b.id, 'building', b.name_ar, b.name_en, b.code, b.lat, b.lng, null::uuid
    from buildings b where auth.uid() is not null and b.university_id = p_university and b.lat is not null and b.state = 'approved'
  union all
  select p.id, p.kind::text, p.name_ar, p.name_en, p.description, p.lat, p.lng, p.advertiser_id
    from places p where auth.uid() is not null and p.university_id = p_university and p.state = 'approved'
     and (p.advertiser_id is null or private.ad_live(p.advertiser_id));
$$;

-- ---------------------------------------------------------------- the shop's page, for whoever its ad reaches

drop function if exists public.advertiser_page(uuid);
create function public.advertiser_page(adv uuid)
returns table (id uuid, name text, category text, description text, phone text, hours text, menu jsonb, photos text[], logo_url text,
               lat double precision, lng double precision, building_id uuid, university_id uuid)
language sql stable security definer set search_path = public as $$
  select a.id, a.name, a.category, a.description, a.phone, a.hours, a.menu, a.photos, a.logo_url, a.lat, a.lng, a.building_id, a.university_id
  from advertisers a
  where a.id = adv and a.is_active
    and (a.university_id is null or a.university_id = my_university() or is_admin()
         or exists (select 1 from ad_campaigns c where c.advertiser_id = a.id and c.is_active and my_university() = any(c.university_ids)
                     and (now() at time zone 'Asia/Amman')::date between c.starts_on and c.ends_on));
$$;
revoke all on function public.advertiser_page(uuid) from public, anon;
grant execute on function public.advertiser_page(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------- ads say which university their shop is in

drop function if exists public.live_ads(ad_placement);
create function public.live_ads(placement_filter ad_placement)
returns table (campaign_id uuid, advertiser_id uuid, advertiser_name text, title text, body text, image_url text, offer text,
               lat double precision, lng double precision, logo_url text, cta_url text, cta_label text, priority smallint,
               cta_kind text, show_text boolean, building_id uuid, phone text, university_id uuid)
language sql stable security definer set search_path = public as $$
  with now_jo as (select (now() at time zone 'Asia/Amman') t)
  select c.id, a.id, a.name, c.title, c.body, c.image_url, c.offer, a.lat, a.lng, a.logo_url, c.cta_url, c.cta_label, c.priority,
         c.cta_kind, c.show_text, a.building_id, case when c.cta_kind = 'call' then a.phone end, a.university_id
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
