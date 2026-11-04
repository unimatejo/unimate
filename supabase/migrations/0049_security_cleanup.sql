-- UniMate · 0049 security audit fixes, merge of junk courses from messy Teams names, and daily storage cleanup.

-- ===== 1) update guards: a row's owner/identity columns can't be rewritten =====
-- follows: the person being followed may accept, but not swap who follows whom
create or replace function private.guard_follow_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or coalesce(current_setting('unimate.system', true), '') = 'on' then return new; end if;
  new.follower_id := old.follower_id; new.followee_id := old.followee_id; new.created_at := old.created_at;
  return new;
end $$;
drop trigger if exists follows_guard on follows;
create trigger follows_guard before update on follows for each row execute function private.guard_follow_update();

-- calls: members can answer / end a call, not move it to another chat or change who started it
create or replace function private.guard_call_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or coalesce(current_setting('unimate.system', true), '') = 'on' then return new; end if;
  new.conversation_id := old.conversation_id; new.caller_id := old.caller_id;
  return new;
end $$;
drop trigger if exists calls_guard on calls;
create trigger calls_guard before update on calls for each row execute function private.guard_call_update();

-- story views: a viewer can like, not re-point the view to another story
create or replace function private.guard_story_view_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_admin() or coalesce(current_setting('unimate.system', true), '') = 'on' then return new; end if;
  new.story_id := old.story_id; new.viewer_id := old.viewer_id;
  return new;
end $$;
drop trigger if exists story_views_guard on story_views;
create trigger story_views_guard before update on story_views for each row execute function private.guard_story_view_update();

-- notes: signed-in people only (they were readable without an account)
drop policy if exists "notes read" on notes;
create policy "notes read" on notes for select to authenticated using (expires_at > now());

-- ===== 2) nothing SECURITY DEFINER is callable without signing in, except the staff-email check on the login screen =====
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and p.prorettype <> 'trigger'::regtype and p.proname <> 'is_staff_email'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end $$;

-- ===== 3) merge the "AI applications — lab" Teams groups into one lab course, by theory section =====
-- names like "عملي تطبيقات ذكاء-شعبة2عملي-5 نظري…" were each a course of their own. The lab course
-- "تطبيقات الذكاء الاصطناعي عملي" already uses theory section numbers (3, 5), so each group joins that number.
create or replace function private.merge_section(src uuid, dst uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if src = dst then return; end if;
  perform set_config('unimate.system', 'on', true);
  insert into enrollments(user_id, section_id, source, created_at)
    select user_id, dst, source, created_at from enrollments where section_id = src on conflict do nothing;
  update section_meetings set section_id = dst where section_id = src;
  insert into meeting_reports(section_id, user_id, weekday, starts_at, ends_at, room_text, room_id, kind, created_at)
    select dst, user_id, weekday, starts_at, ends_at, room_text, room_id, kind, created_at from meeting_reports where section_id = src
    on conflict do nothing;
  update personal_meetings set section_id = dst where section_id = src;
  update meeting_changes set section_id = dst where section_id = src;
  update academic_events set section_id = dst where section_id = src;
  update swap_requests set from_section_id = dst where from_section_id = src;
  update swap_requests set to_section_id = dst where to_section_id = src;
  delete from meeting_reports where section_id = src;
  delete from enrollments where section_id = src;  -- archived by keep_row; everyone is already in dst
end $$;

do $$
declare lab uuid := 'a8218c9e-7ca1-4441-ab97-4af09e3b7147'; term uuid; m record; dst uuid; cname text;
begin
  select name_ar into cname from courses where id = lab;
  if cname is null then return; end if;  -- already done / not this database
  perform set_config('unimate.system', 'on', true);
  for m in select * from (values
      ('90b79cb6-1bd7-4b30-a29b-520ccb4d1b49'::uuid, '5'),   -- شعبة2عملي-5 نظري
      ('92255694-645f-4023-a386-63dc51171004'::uuid, '3'),   -- شعبة 3 نظري- 1 عملي
      ('f69ff1ea-e080-4699-baa5-44e22ca29d89'::uuid, '4'),   -- 4 نظري-2 عملي
      ('4b5265b2-2c9b-450b-9b06-0605f37d9db6'::uuid, '2')    -- نظري 2-عملي 2
    ) as v(course_id, theory) loop
    for term in select distinct s.term_id from sections s where s.course_id = m.course_id loop
      select id into dst from sections where course_id = lab and term_id = term and section_no = m.theory;
      if dst is null then
        -- no such section yet: move the whole section over (its group chat and members come with it)
        update sections set course_id = lab, section_no = m.theory where course_id = m.course_id and term_id = term;
        update communities c set name = cname || ' · شعبة ' || m.theory
          from sections s where s.course_id = lab and s.term_id = term and s.section_no = m.theory and c.section_id = s.id;
        update conversations v set title = cname || ' · شعبة ' || m.theory
          from communities c, sections s where v.community_id = c.id and c.section_id = s.id and s.course_id = lab and s.term_id = term and s.section_no = m.theory;
      else
        perform private.merge_section(s.id, dst) from sections s where s.course_id = m.course_id and s.term_id = term;
        delete from sections where course_id = m.course_id and term_id = term;  -- now empty (archived)
      end if;
    end loop;
    if not exists (select 1 from sections where course_id = m.course_id) then
      delete from courses where id = m.course_id;  -- the junk course name (archived)
    end if;
    insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
      values (null, 'merge_junk_course', 'course', m.course_id::text, jsonb_build_object('into', lab, 'section', m.theory));
  end loop;
end $$;

-- ===== 4) storage cleanup: files nothing points to any more (older than 30 days) =====
-- Only in stories / posts / chat. A file is kept while any row still names it (stories incl. highlights,
-- post media, messages incl. deleted ones admins can still review, highlight covers, moderation queue, title proofs).
create or replace function public.storage_orphans(min_age interval default interval '30 days')
returns table (bucket_id text, name text, size bigint)
language sql stable security definer set search_path = public, storage as $$
  select o.bucket_id, o.name, coalesce((o.metadata->>'size')::bigint, 0)
  from storage.objects o
  where o.bucket_id in ('stories', 'posts', 'chat')
    and o.created_at < now() - min_age
    and not exists (select 1 from stories s where (s.media_url = o.name or s.media_url like '%/' || o.name)
                      and (s.expires_at > now() - interval '30 days' or exists (select 1 from highlight_items h where h.story_id = s.id)))
    and not exists (select 1 from post_media pm where pm.url = o.name or pm.url like '%/' || o.name)
    and not exists (select 1 from messages m where m.media_url = o.name or m.media_url like '%/' || o.name)
    and not exists (select 1 from highlights h where h.cover_url = o.name or h.cover_url like '%/' || o.name)
    and not exists (select 1 from title_requests t where t.proof_url like '%' || o.name)
    and not exists (select 1 from moderation_queue q where q.media_url like '%' || o.name);
$$;
revoke all on function public.storage_orphans(interval) from public, anon, authenticated;
grant execute on function public.storage_orphans(interval) to service_role;

-- the storage-cleanup edge function deletes them through the Storage API (files really go away, not just the rows)
create or replace function private.storage_cleanup_fire()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select v into s from private.push_cfg where k = 'secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://slkfyblvpewlxrifzrhg.supabase.co/functions/v1/storage-cleanup',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', s),
    timeout_milliseconds := 30000);
end $$;
do $$ begin perform cron.unschedule('storage-cleanup'); exception when others then null; end $$;
select cron.schedule('storage-cleanup', '29 4 * * *', 'select private.storage_cleanup_fire()');
