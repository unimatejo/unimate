-- UniMate · 0139 reach the right students, advertisers on the map, and a word when the app breaks
--
-- * A notification from the owner can go to everyone, one university, one college, one major or one intake year
--   (a graduation, a college event, a notice for a major), in Arabic and English, and can open a page when tapped.
-- * An advertiser placed on the campus map shows there as a pin of its own for as long as it is active.
-- * A crash on a student's phone, or a sudden wave of errors, tells the owner at once (and nobody else).

-- ---------------------------------------------------------------- targeted notifications

drop function if exists public.admin_notify(text, text, uuid, uuid);
create function public.admin_notify(
  title text, body text, target uuid default null, uni uuid default null, college uuid default null, major uuid default null,
  entry_year integer default null, link text default null, title_en text default null, body_en text default null)
returns integer language plpgsql security definer set search_path = public as $$
declare n int; d jsonb;
begin
  perform owner_require();
  if char_length(btrim(coalesce(title, ''))) < 3 then raise exception 'title_required' using errcode = '22023'; end if;
  -- a page inside the app, or a secure site; never an admin screen
  if link is not null and not (link ~ '^/[A-Za-z0-9/_\-\[\]?=&.]*$' and link !~ '^/admin' or link ~ '^https://\S+$') then
    raise exception 'bad_link' using errcode = '22023';
  end if;
  d := jsonb_strip_nulls(jsonb_build_object('url', link, 'title_en', nullif(btrim(title_en), ''), 'body_en', nullif(btrim(body_en), '')));
  insert into notifications(user_id, kind, title, body, data)
  select p.id, 'system', left(btrim(title), 120), nullif(left(btrim(body), 400), ''), d from profiles p
  where p.status = 'active'
    and (target is null or p.id = target) and (uni is null or p.university_id = uni)
    and (college is null or p.college_id = college) and (major is null or p.major_id = major)
    and (admin_notify.entry_year is null or p.entry_year = admin_notify.entry_year);
  get diagnostics n = row_count;
  perform admin_log('notify',
    case when target is not null then 'user' when major is not null then 'major' when college is not null then 'college'
         when uni is not null then 'university' else 'all' end,
    coalesce(target, major, college, uni)::text,
    jsonb_build_object('title', title, 'count', n, 'entry_year', entry_year, 'link', link));
  return n;
end $$;
revoke all on function public.admin_notify(text, text, uuid, uuid, uuid, uuid, integer, text, text, text) from public, anon;
grant execute on function public.admin_notify(text, text, uuid, uuid, uuid, uuid, integer, text, text, text) to authenticated;

-- ---------------------------------------------------------------- advertisers on the campus map

/** the map kind that fits an advertiser's category */
create or replace function private.ad_place_kind(cat text)
returns place_kind language sql immutable as $$
  select (case cat when 'restaurant' then 'restaurant' when 'cafe' then 'cafeteria' when 'print' then 'print'
                   when 'bookshop' then 'shop' when 'shop' then 'shop' else 'service' end)::place_kind;
$$;

/** keeps the advertiser's own pin in step with it: shown while active and placed, hidden otherwise */
create or replace function private.sync_ad_place()
returns trigger language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  select id into pid from places where advertiser_id = new.id and created_by is null order by created_at limit 1;
  if new.is_active and new.university_id is not null and new.lat is not null and new.lng is not null then
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
create trigger advertisers_place after insert or update of is_active, university_id, lat, lng, name, category, hours, logo_url, building_id
  on public.advertisers for each row execute function private.sync_ad_place();

-- advertisers already placed get their pin now
update public.advertisers set is_active = is_active where lat is not null;

-- ---------------------------------------------------------------- the owner hears about crashes

create index if not exists client_errors_created_at_idx on public.client_errors (created_at desc);

/** a crash, or 20 errors in 10 minutes: one notification to the owners, at most once an hour for each */
create or replace function private.error_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_fp text; ttl text; msg text;
begin
  if new.fatal then
    v_fp := 'client-fatal'; ttl := 'توقف التطبيق عند أحد الطلاب';
    msg := 'أُغلق التطبيق فجأة' || coalesce(' في «' || new.screen || '»', '') || coalesce(' على ' || new.platform, '') || '. افتح «أخطاء التطبيق» للتفاصيل.';
  elsif (select count(*) from client_errors where created_at > now() - interval '10 minutes') >= 20 then
    v_fp := 'client-wave'; ttl := 'أخطاء كثيرة في التطبيق الآن';
    msg := 'وصل أكثر من 20 خطأ خلال آخر 10 دقائق. افتح «أخطاء التطبيق» لمعرفة السبب.';
  else
    return null;
  end if;
  if exists (select 1 from private.alert_log l where l.fp = v_fp and l.sent_at > now() - interval '1 hour') then return null; end if;
  insert into private.alert_log(fp) values (v_fp);
  insert into notifications(user_id, kind, title, body, data)
  select a.user_id, 'admin_alert', ttl, msg, jsonb_build_object('url', '/admin/errors', 'fp', v_fp) from admins a where a.role = 'owner';
  return null;
exception when others then return null; -- an alert must never stop the error being kept
end $$;

drop trigger if exists client_errors_alert on public.client_errors;
create trigger client_errors_alert after insert on public.client_errors for each row execute function private.error_alert();
