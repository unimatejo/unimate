-- Two admin levels, enforced by the database (the app only hides what a level can't use):
--   owner     – everything.
--   moderator – day-to-day safety: reports, content checks, users (suspend / unmute / clear socials),
--               professor title requests, support tickets. Reported chats only, never the full chat view.
-- Owner only: managing admins, the full chat view, broadcasts and offers, ads, universities / campus data,
-- study rules, grade and staff imports, editing someone's profile, the error log and the admin log.
-- Also removes the old web-panel sign-in hand-off (the admin panel lives inside the app now).

create or replace function public.owner_require()
returns void language plpgsql stable security definer set search_path = public as $$
begin if not is_owner() then raise exception 'owner only'; end if; end $$;
revoke all on function public.owner_require() from public, anon;
grant execute on function public.owner_require() to authenticated;

-- 1) owner-only functions
do $$ declare f record; def text; begin
  for f in select p.oid from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = any (array[
      'admin_list_conversations', 'admin_user_conversations', 'admin_import_grades', 'admin_import_staff_titles',
      'admin_notify', 'admin_send_offer', 'admin_set_study_rules', 'admin_set_title',
      'admin_ad_stats', 'admin_perf_summary']) loop
    def := pg_get_functiondef(f.oid);
    if position('perform admin_require();' in def) = 0 then raise exception 'no admin_require in %', f.oid::regprocedure; end if;
    execute replace(def, 'perform admin_require();', 'perform owner_require();');
  end loop;
end $$;


-- 2) the full chat view (when switched on) is for the owner only; moderators keep seeing reported parts
create or replace function private.admin_visible_messages(conv uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with ordered as (select m.id, m.created_at, row_number() over (order by m.created_at, m.id) rn from messages m where m.conversation_id = conv and is_admin()),
  anchors as (
    select o.rn, 5 as before, 5 as after from ordered o join reports r on r.target_type = 'message' and r.target_id = o.id
    union all
    select coalesce((select max(o.rn) from ordered o where o.created_at <= r.created_at), 0), 30, 0
      from reports r where r.target_type = 'conversation' and r.target_id = conv and is_admin()
  )
  select o.id from ordered o where private.admin_chat_full() and is_owner()
  union
  select o.id from ordered o join anchors a on o.rn between a.rn - a.before and a.rn + a.after;
$$;

-- 3) owner-only tables: swap is_admin() for is_owner() in their admin rules
do $$ declare p record; q text; c text; begin
  for p in select * from pg_policies where (schemaname, tablename, policyname) in (
      ('public','ad_campaigns','campaigns admin'), ('public','ad_events','ad events admin'), ('public','advertisers','advertisers admin'),
      ('public','app_config','config admin'), ('public','buildings','buildings admin'), ('public','colleges','colleges admin'),
      ('public','communities','communities admin'), ('public','community_members','members admin'), ('public','courses','courses admin'),
      ('public','enrollments','enrollments admin'), ('public','majors','majors admin'), ('public','rooms','rooms admin'),
      ('public','section_meetings','meetings admin'), ('public','sections','sections admin'), ('public','terms','terms admin'),
      ('public','universities','universities admin'), ('public','university_links','links admin'), ('public','places','places admin'),
      ('public','place_aliases','aliases admin'), ('public','moderation_words','mod words admins'),
      ('public','profile_private','private admin write'), ('public','profiles','profiles admin delete'),
      ('public','offer_sends','offers admin'), ('public','perf_samples','perf admins read'), ('public','client_errors','errors admin'),
      ('public','admin_audit_log','audit admin read'), ('public','notifications','notifications admin'),
      ('public','point_events','points admin'), ('public','conversations','conversations admin'),
      ('storage','objects','campus files admin'), ('storage','objects','ads files admin')) loop
    if coalesce(p.qual, '') || coalesce(p.with_check, '') !~ 'is_admin\(' then raise exception 'policy % has no is_admin', p.policyname; end if;
    q := replace(replace(p.qual, 'is_admin(auth.uid())', 'is_owner()'), 'is_admin()', 'is_owner()');
    c := replace(replace(p.with_check, 'is_admin(auth.uid())', 'is_owner()'), 'is_admin()', 'is_owner()');
    execute format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename)
      || case when q is not null then format(' using (%s)', q) else '' end
      || case when c is not null then format(' with check (%s)', c) else '' end;
  end loop;
end $$;

-- 4) the old web panel's one-time sign-in codes
drop function if exists public.admin_handoff_code();
drop function if exists public.admin_handoff_take(text);
drop table if exists private.admin_handoff;
