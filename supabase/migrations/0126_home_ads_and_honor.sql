-- UniMate · 0126 home ad banners with an «اطلب الآن» link, and the honor board on Home
--
-- 1. A campaign can carry a button that opens the advertiser's own site (ordering, menu, booking): https only.
-- 2. Banners come in packages (priority 30 gold / 20 silver / 10 standard): the higher package shows first, ads in the
--    same package take turns. A daily window can now run past midnight (20:00 → 02:00).
-- 3. Taps on «اطلب الآن» are counted («order»), and calls are counted again (track_ad had dropped them).
-- 4. «المتفوقين» joins the Home quick links (the saved list had left it out).

alter table public.ad_campaigns
  add column if not exists cta_url text check (cta_url is null or (cta_url ~ '^https://[^[:space:]]+$' and char_length(cta_url) <= 500)),
  add column if not exists cta_label text check (cta_label is null or char_length(cta_label) between 1 and 20);

alter table public.ad_events drop constraint if exists ad_events_kind_check;
alter table public.ad_events add constraint ad_events_kind_check check (kind in ('impression', 'click', 'directions', 'call', 'order'));

drop function if exists public.live_ads(ad_placement);
create function public.live_ads(placement_filter ad_placement)
returns table (campaign_id uuid, advertiser_id uuid, advertiser_name text, title text, body text, image_url text, offer text,
               lat double precision, lng double precision, logo_url text, cta_url text, cta_label text, priority smallint)
language sql stable security definer set search_path = public as $$
  with now_jo as (select (now() at time zone 'Asia/Amman') t)
  select c.id, a.id, a.name, c.title, c.body, c.image_url, c.offer, a.lat, a.lng, a.logo_url, c.cta_url, c.cta_label, c.priority
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

create or replace function public.track_ad(campaign uuid, what text)
returns void language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Amman')::date;
  n int;
begin
  if auth.uid() is null or what not in ('impression', 'click', 'directions', 'call', 'order') then return; end if;
  if not exists (select 1 from ad_campaigns c where c.id = campaign and my_university() = any(c.university_ids)) then return; end if;
  -- one view a day per student, and at most five taps of each kind: the numbers advertisers pay on stay honest
  select count(*) into n from ad_events where campaign_id = campaign and user_id = auth.uid() and kind = what and day = today;
  if (what = 'impression' and n >= 1) or (what <> 'impression' and n >= 5) then return; end if;
  insert into ad_events(campaign_id, kind, user_id) values (campaign, what, auth.uid());
end $$;

drop function if exists public.admin_ad_stats();
create function public.admin_ad_stats()
returns table (campaign_id uuid, impressions bigint, clicks bigint, calls bigint, orders bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  perform owner_require();
  return query select e.campaign_id, count(*) filter (where e.kind = 'impression'), count(*) filter (where e.kind = 'click'),
    count(*) filter (where e.kind = 'call'), count(*) filter (where e.kind = 'order')
  from ad_events e group by e.campaign_id;
end $$;

revoke all on function public.live_ads(ad_placement), public.track_ad(uuid, text), public.admin_ad_stats() from public, anon;
grant execute on function public.live_ads(ad_placement), public.track_ad(uuid, text), public.admin_ad_stats() to authenticated;

update public.app_config
set value = jsonb_set(value::jsonb, '{home,quick}', '["map", "ranks"]'::jsonb || coalesce(
      (select jsonb_agg(x order by i) from jsonb_array_elements_text(value::jsonb #> '{home,quick}') with ordinality e(x, i)
       where x not in ('map', 'ranks')), '[]'::jsonb))::text,
    updated_at = now()
where key = 'app_content' and jsonb_typeof(value::jsonb #> '{home,quick}') = 'array'
  and not (value::jsonb #> '{home,quick}') ? 'ranks';
