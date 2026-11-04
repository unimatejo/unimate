-- UniMate · 0050 the owner and moderators get a push when the app breaks.
-- A new kind of error, or ≥5 of the same error within 10 minutes → one notification per admin
-- (kind 'admin_alert'), at most once an hour per error and 10 alerts an hour overall.
-- A cron every 10 minutes also alerts when server calls (push, moderation…) keep failing.
create schema if not exists private;
create table if not exists private.alert_log (
  fp      text not null,
  sent_at timestamptz not null default now()
);
create index if not exists alert_log_fp_idx on private.alert_log(fp, sent_at desc);

-- send one alert to every admin (throttled); returns true if it went out
create or replace function private.admin_alert(p_fp text, p_title text, p_body text default null, p_url text default '/admin/errors')
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from private.alert_log where fp = p_fp and sent_at > now() - interval '1 hour') then return false; end if;
  if (select count(*) from private.alert_log where sent_at > now() - interval '1 hour') >= 10 then return false; end if;
  insert into private.alert_log(fp) values (p_fp);
  insert into notifications(user_id, kind, title, body, data)
  select a.user_id, 'admin_alert', left(p_title, 120), left(p_body, 200), jsonb_build_object('url', p_url, 'fp', p_fp)
  from admins a;
  delete from private.alert_log where sent_at < now() - interval '7 days';
  return true;
end $$;

create or replace function private.on_client_error()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  fp text := md5(left(coalesce(new.message, ''), 200));
  recent int;
  seen boolean;
begin
  select count(*) into recent from client_errors
   where md5(left(coalesce(message, ''), 200)) = fp and created_at > now() - interval '10 minutes';
  select exists (select 1 from client_errors
   where md5(left(coalesce(message, ''), 200)) = fp and id <> new.id and created_at > now() - interval '30 days') into seen;
  if not seen or recent >= 5 then
    perform private.admin_alert(
      'err-' || fp,
      'عطل بالتطبيق: ' || left(coalesce(new.message, '؟'), 70),
      concat_ws(' · ', case when recent >= 5 then recent || ' مرات بآخر 10 دقايق' else 'نوع خطأ جديد' end, new.screen, new.platform, new.app_version));
  end if;
  return null;
exception when others then return null; -- an alert must never block error reporting
end $$;
drop trigger if exists client_errors_alert on client_errors;
create trigger client_errors_alert after insert on client_errors for each row execute function private.on_client_error();

-- server-side health: calls from the database to edge functions (push, moderation) that failed in the last 10 minutes
create or replace function private.health_check()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare bad int;
begin
  select count(*) into bad from net._http_response
   where created > now() - interval '10 minutes'
     and (timed_out or error_msg is not null or status_code is null or status_code >= 400);
  if bad >= 3 then
    perform private.admin_alert('health-functions', 'عطل بالسيرفر: ' || bad || ' طلبات فشلت بآخر 10 دقايق',
      'الإشعارات أو فحص المحتوى ممكن ما يشتغلوا. شوف سجل الأخطاء.');
  end if;
exception when others then null;
end $$;
do $$ begin perform cron.unschedule('health-check'); exception when others then null; end $$;
select cron.schedule('health-check', '*/10 * * * *', 'select private.health_check()');
