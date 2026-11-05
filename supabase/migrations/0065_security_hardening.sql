-- Security audit fixes (Nov 2026). No data is deleted or changed; only who can read what.

-- 1) Post & story files: only people who can see the post / story (or the owner / an admin) can open the file.
--    Before: any signed-in user of any university could list and download every file, incl. private accounts and close-friends stories.
drop policy if exists "posts read" on storage.objects;
drop policy if exists "stories read" on storage.objects;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT'
             and (qual like '%''posts''::text%' or qual like '%''stories''::text%') loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "posts read" on storage.objects for select using (
  bucket_id = 'posts' and (
    (storage.foldername(name))[1] = auth.uid()::text or is_admin()
    or exists (select 1 from post_media pm join posts p on p.id = pm.post_id where pm.url = name and can_see_post(p))
  ));
create policy "stories read" on storage.objects for select using (
  bucket_id = 'stories' and (
    (storage.foldername(name))[1] = auth.uid()::text or is_admin()
    or exists (select 1 from stories s where s.author_id::text = (storage.foldername(name))[1]
                 and (s.media_url = name or s.overlays::text like '%' || name || '%' or s.meta::text like '%' || name || '%')
                 and can_see_story(s))
  ));

-- 2) Private chats: admins see only what was reported (the reported message and a few around it, or the
--    last 30 messages before a whole-conversation report). Public community chats stay open to moderators.
create or replace function private.admin_visible_messages(conv uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  with ordered as (select m.id, m.created_at, row_number() over (order by m.created_at, m.id) rn from messages m where m.conversation_id = conv and is_admin()),
  anchors as (
    select o.rn, 5 as before, 5 as after from ordered o join reports r on r.target_type = 'message' and r.target_id = o.id
    union all
    select coalesce((select max(o.rn) from ordered o where o.created_at <= r.created_at), 0), 30, 0
      from reports r where r.target_type = 'conversation' and r.target_id = conv and is_admin()
  )
  select distinct o.id from ordered o join anchors a on o.rn between a.rn - a.before and a.rn + a.after;
$$;
revoke all on function private.admin_visible_messages(uuid) from public, anon;
grant execute on function private.admin_visible_messages(uuid) to authenticated;

create or replace function public.admin_conversation_messages(conv uuid, reason text default null)
returns setof messages language plpgsql security definer set search_path = public as $$
declare k conversation_kind;
begin
  if not is_admin() then raise exception 'admins only'; end if;
  select kind into k from conversations where id = conv;
  if k is distinct from 'community' and not exists (select 1 from private.admin_visible_messages(conv)) then
    raise exception 'private_chat';
  end if;
  insert into admin_audit_log(admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'open_conversation', 'conversation', conv::text, jsonb_build_object('reason', reason, 'scope', case when k = 'community' then 'community' else 'reported_only' end));
  if k = 'community' then
    return query select * from messages where conversation_id = conv order by created_at;
  else
    return query select * from messages where id in (select private.admin_visible_messages(conv)) order by created_at;
  end if;
end $$;

create or replace function public.admin_conversation_since(conv uuid, after timestamptz)
returns setof messages language plpgsql security definer set search_path = public as $$
declare k conversation_kind;
begin
  perform admin_require();
  select kind into k from conversations where id = conv;
  if k = 'community' then
    return query select * from messages where conversation_id = conv and created_at > after order by created_at;
  else
    return query select * from messages where created_at > after and id in (select private.admin_visible_messages(conv)) order by created_at;
  end if;
end $$;

-- the list shows who and how many, never the text of a private chat
create or replace function public.admin_list_conversations(q text default '', lim integer default 50, off integer default 0)
returns table(id uuid, kind conversation_kind, title text, context_label text, last_message_at timestamptz, members jsonb, message_count bigint, last_body text)
language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select c.id, c.kind, c.title, c.context_label, c.last_message_at,
    (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'username', p.username, 'avatar_url', p.avatar_url, 'state', cm.state))
       from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = c.id),
    (select count(*) from messages mm where mm.conversation_id = c.id),
    case when c.kind = 'community'
      then (select left(coalesce(mm.body, mm.kind::text), 80) from messages mm where mm.conversation_id = c.id order by mm.created_at desc limit 1)
      when exists (select 1 from private.admin_visible_messages(c.id)) then '⚑ عليها بلاغ'
      else '🔒 محادثة خاصة' end
  from conversations c
  where coalesce(q, '') = ''
     or c.title ilike '%' || q || '%' or c.id::text = q
     or exists (select 1 from conversation_members cm join profiles p on p.id = cm.user_id
                where cm.conversation_id = c.id and (p.full_name ilike '%' || q || '%' or p.username ilike '%' || q || '%'))
  order by c.last_message_at desc nulls last
  limit greatest(1, least(lim, 200)) offset greatest(0, off);
end $$;

-- chat files: members, or an admin looking at a reported message / a community chat
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and cmd = 'SELECT' and qual like '%''chat''::text%' loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end $$;
create policy "chat read" on storage.objects for select using (
  bucket_id = 'chat' and (
    is_member(((storage.foldername(name))[1])::uuid)
    or (is_admin() and exists (
      select 1 from messages m join conversations c on c.id = m.conversation_id
      where m.media_url = name and (c.kind = 'community' or m.id in (select private.admin_visible_messages(m.conversation_id)))))
  ));

-- 3) Instagram / Snapchat handles: only who the owner allowed (everyone / friends / close friends).
--    Before: anyone at the university could read them straight from the API.
--    They move to a private table (nothing is lost); profiles.instagram / snapchat stay as columns but are kept empty,
--    so older app versions keep working (they just don't show the handles until they update).
create table if not exists private.profile_socials (
  user_id   uuid primary key references public.profiles(id) on delete cascade,
  instagram text check (instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  snapchat  text check (snapchat ~ '^[A-Za-z0-9._-]{1,30}$'),
  updated_at timestamptz not null default now()
);
insert into private.profile_socials(user_id, instagram, snapchat)
  select id, instagram, snapchat from public.profiles where instagram is not null or snapchat is not null
  on conflict (user_id) do update set instagram = coalesce(excluded.instagram, private.profile_socials.instagram), snapchat = coalesce(excluded.snapchat, private.profile_socials.snapchat);

-- an older app saving a handle the old way: keep it privately, never on the public row
create or replace function private.profiles_socials_capture()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.instagram is not null or new.snapchat is not null then
    insert into private.profile_socials(user_id, instagram, snapchat) values (new.id, new.instagram, new.snapchat)
    on conflict (user_id) do update set
      instagram = coalesce(excluded.instagram, private.profile_socials.instagram),
      snapchat = coalesce(excluded.snapchat, private.profile_socials.snapchat), updated_at = now();
    new.instagram := null; new.snapchat := null;
  end if;
  return new;
end $$;
drop trigger if exists profiles_socials_capture on public.profiles;
create trigger profiles_socials_capture before insert or update of instagram, snapchat on public.profiles
  for each row execute function private.profiles_socials_capture();
do $$ begin
  perform set_config('unimate.system', 'on', true);
  update public.profiles set instagram = null, snapchat = null where instagram is not null or snapchat is not null;
  perform set_config('unimate.system', 'off', true);
end $$;
create or replace function public.profile_socials(p_user uuid)
returns table(instagram text, snapchat text) language sql stable security definer set search_path = public as $$
  select s.instagram, s.snapchat from private.profile_socials s join profiles p on p.id = s.user_id
  where s.user_id = p_user and (
    p.id = auth.uid() or is_admin()
    or (can_see_user(p.id) and case p.socials_visible_to::text
          when 'everyone' then true
          when 'friends' then follows_accepted(auth.uid(), p.id) and follows_accepted(p.id, auth.uid())
          when 'close_friends' then exists (select 1 from close_friends cf where cf.owner_id = p.id and cf.friend_id = auth.uid())
          else false end));
$$;
create or replace function public.set_my_socials(p_instagram text, p_snapchat text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into private.profile_socials(user_id, instagram, snapchat) values (auth.uid(), nullif(trim(p_instagram), ''), nullif(trim(p_snapchat), ''))
  on conflict (user_id) do update set instagram = excluded.instagram, snapchat = excluded.snapchat, updated_at = now();
end $$;
revoke all on function public.profile_socials(uuid), public.set_my_socials(text, text) from public, anon;
grant execute on function public.profile_socials(uuid), public.set_my_socials(text, text) to authenticated;

-- 4) Notes (the little status above the inbox): only the people you follow, like Instagram. Before: everyone everywhere.
drop policy if exists "notes read" on notes;
do $$ declare p record; begin
  for p in select policyname from pg_policies where schemaname = 'public' and tablename = 'notes' and cmd = 'SELECT' loop
    execute format('drop policy %I on notes', p.policyname);
  end loop;
end $$;
create policy "notes read" on notes for select to authenticated using (
  expires_at > now() and (user_id = auth.uid() or (follows_accepted(auth.uid(), user_id) and not is_blocked_between(auth.uid(), user_id))));

-- 5) Directory: your own university only (admins can look at any).
create or replace function public.university_directory(p_university uuid default null)
returns table (id uuid, full_name text, username text, avatar_url text, account_type text, academic_title text, title_verified boolean,
               department text, major text, college text, is_verified boolean, rank int)
language sql stable security definer set search_path = public as $$
  with me as (select case when is_admin() then coalesce(p_university, my_university()) else my_university() end as uni)
  select p.id, p.full_name, p.username, p.avatar_url, p.account_type,
         case when p.title_verified then p.academic_title end, p.title_verified,
         p.department, m.name_ar, c.name_ar, p.is_verified,
         case
           when p.title_verified and p.academic_title is not null then array_position(array['president','vice_president','dean','vice_dean','head','prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','staff'], p.academic_title)
           when p.account_type = 'faculty' then 50
           when p.account_type = 'staff' then 60
           else 100 end as rank
  from profiles p
  left join majors m on m.id = p.major_id
  left join colleges c on c.id = coalesce(p.college_id, m.college_id)
  where auth.uid() is not null
    and p.university_id = (select uni from me)
    and p.status::text = 'active'
    and p.deletion_requested_at is null
    and not exists (select 1 from blocks b where (b.blocker_id = p.id and b.blocked_id = auth.uid()) or (b.blocker_id = auth.uid() and b.blocked_id = p.id))
  order by rank, p.full_name;
$$;

-- 6) A one-to-one chat has no name: members can't rename it (groups were already protected).
create or replace function private.guard_group_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('unimate.system', true) = 'on' or auth.uid() is null or is_admin() then return new; end if;
  if old.kind = 'direct' then
    new.title := old.title; new.photo_url := old.photo_url; new.kind := old.kind;
  end if;
  if old.kind in ('group', 'community') and not public.can_manage_conv(old.id) then
    new.title := old.title; new.photo_url := old.photo_url; new.vanish := old.vanish;
    new.block_screenshots := old.block_screenshots; new.invite_code := old.invite_code;
    new.members_can_add := old.members_can_add; new.approve_joins := old.approve_joins;
    new.context_label := old.context_label;
  end if;
  return new;
end $$;

-- 7) "Does X follow / block Y?" can't be asked about two other people from the API
--    (system jobs with no signed-in user still get the real answer; anon can't call these at all, see 8).
create or replace function public.follows_accepted(viewer uuid, target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (viewer, target) or is_admin())
     and exists (select 1 from follows where follower_id = viewer and followee_id = target and status = 'accepted');
$$;
create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select (auth.uid() is null or auth.uid() in (a, b) or is_admin())
     and exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

-- 8) Functions signed-out visitors never need
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'execute')
             and p.proname not in ('is_staff_email') loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;

-- 9) Small hardening
alter function public.clean_course_name set search_path = public;
alter function public.title_label set search_path = public;
alter function private.mod_norm set search_path = public;
alter function private.mute_for set search_path = public;
do $$ declare d text; begin
  select pg_get_functiondef('public.campus_search'::regproc) into d;
  if position('limit lim;' in d) > 0 then execute replace(d, 'limit lim;', 'limit least(greatest(coalesce(lim, 20), 1), 50);'); end if;
end $$;
