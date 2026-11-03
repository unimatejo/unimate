-- UniMate · 0005 in-house ads, field guards, storage buckets, realtime, scheduled cleanup

create type ad_placement as enum ('home_banner', 'feed_card', 'map_pin', 'market_banner');

-- ---------- advertisers & campaigns (first-party ads, no tracking, labelled "ممول") ----------
create table advertisers (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid references universities(id) on delete set null,
  name          text not null,
  category      text not null default 'restaurant' check (category in ('restaurant', 'cafe', 'bookshop', 'print', 'housing', 'courses', 'shop', 'other')),
  description   text,
  phone         text,
  hours         text,
  menu          jsonb not null default '[]',   -- [{name, price_jod, photo_url}]
  photos        text[] not null default '{}',
  logo_url      text,
  lat           double precision,
  lng           double precision,
  contact_name  text,                          -- admin-only billing contact
  notes         text,                          -- admin-only
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table places add constraint places_advertiser_fk foreign key (advertiser_id) references advertisers(id) on delete set null;

create table ad_campaigns (
  id             uuid primary key default gen_random_uuid(),
  advertiser_id  uuid not null references advertisers(id) on delete cascade,
  university_ids uuid[] not null,
  college_ids    uuid[] not null default '{}',
  placement      ad_placement not null,
  title          text not null check (char_length(title) <= 60),
  body           text check (char_length(body) <= 140),
  image_url      text,
  offer          text,                       -- "خصم 20% للطلاب"
  starts_on      date not null,
  ends_on        date not null,
  daily_from     time,                       -- e.g. lunch 12:00–14:00
  daily_to       time,
  priority       smallint not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index ad_campaigns_live_idx on ad_campaigns(placement, starts_on, ends_on) where is_active;

create table ad_events (
  id          bigint generated always as identity primary key,
  campaign_id uuid not null references ad_campaigns(id) on delete cascade,
  kind        text not null check (kind in ('impression', 'click', 'directions')),
  day         date not null default (now() at time zone 'Asia/Amman')::date,
  created_at  timestamptz not null default now()
);
create index ad_events_campaign_idx on ad_events(campaign_id, day);

-- the app asks for ads through this; it only ever sees what a student should see
create or replace function live_ads(placement_filter ad_placement)
returns table (campaign_id uuid, advertiser_id uuid, advertiser_name text, title text, body text, image_url text, offer text,
               lat double precision, lng double precision, logo_url text)
language sql stable security definer set search_path = public as $$
  select c.id, a.id, a.name, c.title, c.body, c.image_url, c.offer, a.lat, a.lng, a.logo_url
  from ad_campaigns c join advertisers a on a.id = c.advertiser_id and a.is_active
  where c.is_active and c.placement = placement_filter
    and my_university() = any(c.university_ids)
    and (cardinality(c.college_ids) = 0 or (select college_id from profiles where id = auth.uid()) = any(c.college_ids))
    and (now() at time zone 'Asia/Amman')::date between c.starts_on and c.ends_on
    and (c.daily_from is null or (now() at time zone 'Asia/Amman')::time between c.daily_from and c.daily_to)
  order by c.priority desc, random()
  limit 5;
$$;

create or replace function track_ad(campaign uuid, what text)
returns void language sql security definer set search_path = public as $$
  insert into ad_events(campaign_id, kind)
  select campaign, what where exists (select 1 from ad_campaigns c where c.id = campaign and my_university() = any(c.university_ids));
$$;

-- public advertiser page (no admin-only fields)
create or replace view advertiser_pages with (security_invoker = false) as
  select id, university_id, name, category, description, phone, hours, menu, photos, logo_url, lat, lng
  from advertisers where is_active;

alter table advertisers enable row level security;
alter table ad_campaigns enable row level security;
alter table ad_events enable row level security;
create policy "advertisers admin" on advertisers for all using (is_admin()) with check (is_admin());
create policy "campaigns admin" on ad_campaigns for all using (is_admin()) with check (is_admin());
create policy "ad events admin" on ad_events for select using (is_admin());
grant select on advertiser_pages to authenticated;

-- ---------- guards on fields students must not change ----------
create or replace function guard_moderation_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or current_setting('unimate.system', true) = 'on' then return new; end if;
  if tg_table_name = 'posts' then
    new.is_pinned := old.is_pinned; new.is_hidden := old.is_hidden;
    new.like_count := old.like_count; new.comment_count := old.comment_count;
    new.author_id := old.author_id; new.university_id := old.university_id; new.community_id := old.community_id;
  elsif tg_table_name = 'comments' then
    new.is_hidden := old.is_hidden; new.author_id := old.author_id; new.post_id := old.post_id;
  elsif tg_table_name = 'stories' then
    new.is_hidden := old.is_hidden; new.author_id := old.author_id; new.university_id := old.university_id;
    new.expires_at := old.expires_at; new.media_url := old.media_url;
  elsif tg_table_name = 'conversations' then
    new.streak_days := old.streak_days; new.streak_last_day := old.streak_last_day;
    new.kind := old.kind; new.community_id := old.community_id; new.university_id := old.university_id;
    new.created_by := old.created_by;
  elsif tg_table_name = 'conversation_members' then
    new.state := case when old.state = 'request' and new.state = 'active' then old.state else new.state end;
    new.last_sent_day := old.last_sent_day;
  end if;
  return new;
end $$;
create trigger posts_guard before update on posts for each row execute function guard_moderation_fields();
create trigger comments_guard before update on comments for each row execute function guard_moderation_fields();
create trigger stories_guard before update on stories for each row execute function guard_moderation_fields();
create trigger conversations_guard before update on conversations for each row execute function guard_moderation_fields();
create trigger conversation_members_guard before update on conversation_members for each row execute function guard_moderation_fields();

-- counters and streak updates come from system triggers
create or replace function system_on() returns void language sql as $$ select set_config('unimate.system', 'on', true); $$;
create or replace function system_off() returns void language sql as $$ select set_config('unimate.system', 'off', true); $$;

-- ---------- storage ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('posts', 'posts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
  ('stories', 'stories', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime']),
  ('chat', 'chat', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'audio/m4a', 'audio/mp4', 'audio/aac', 'application/pdf']),
  ('ads', 'ads', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('campus', 'campus', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- files live under <bucket>/<user_id>/... (chat: <bucket>/<conversation_id>/...)
create policy "avatars read" on storage.objects for select using (bucket_id = 'avatars');
create policy "avatars write own" on storage.objects for insert with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars update own" on storage.objects for update using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars delete own" on storage.objects for delete using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "posts files read" on storage.objects for select using (bucket_id = 'posts' and (my_university() is not null or is_admin()));
create policy "posts files write own" on storage.objects for insert with check (bucket_id = 'posts' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "posts files delete own" on storage.objects for delete using (bucket_id = 'posts' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

create policy "stories files read" on storage.objects for select using (bucket_id = 'stories' and (my_university() is not null or is_admin()));
create policy "stories files write own" on storage.objects for insert with check (bucket_id = 'stories' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "stories files delete own" on storage.objects for delete using (bucket_id = 'stories' and ((storage.foldername(name))[1] = auth.uid()::text or is_admin()));

create policy "chat files members" on storage.objects for select using (bucket_id = 'chat' and (is_member(((storage.foldername(name))[1])::uuid) or is_admin()));
create policy "chat files send" on storage.objects for insert with check (bucket_id = 'chat' and is_member(((storage.foldername(name))[1])::uuid));

create policy "ads files read" on storage.objects for select using (bucket_id = 'ads');
create policy "ads files admin" on storage.objects for all using (bucket_id = 'ads' and is_admin()) with check (bucket_id = 'ads' and is_admin());
create policy "campus files read" on storage.objects for select using (bucket_id = 'campus');
create policy "campus files admin" on storage.objects for all using (bucket_id = 'campus' and is_admin()) with check (bucket_id = 'campus' and is_admin());

-- ---------- realtime ----------
alter publication supabase_realtime add table messages, conversation_members, conversations, notifications, calls, screenshot_events;

-- ---------- scheduled cleanup (pg_cron) ----------
create extension if not exists pg_cron;
select cron.schedule('unimate-purge-vanished', '17 3 * * *', $$ select public.purge_vanished_messages(); $$);
