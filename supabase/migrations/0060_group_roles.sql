-- UniMate · 0060 group roles (Instagram-like group details).
-- owner / admin / member per group. Only the owner, group admins and platform admins can rename, change
-- the photo, add/remove members or change settings. In course / community chats (Teams, sections) the
-- admins are the verified faculty members plus platform admins. Members can only leave or mute.

alter table conversation_members add column if not exists role text not null default 'member'
  check (role in ('owner', 'admin', 'member'));
alter table conversations add column if not exists photo_url text;
alter table conversations add column if not exists invite_code text unique;
alter table conversations add column if not exists members_can_add boolean not null default false;
alter table conversations add column if not exists approve_joins boolean not null default false;

-- whoever made a group owns it
update conversation_members m set role = 'owner'
from conversations c
where c.id = m.conversation_id and c.kind = 'group' and c.created_by = m.user_id and m.role <> 'owner';

-- effective role of a person in a chat
create or replace function public.conv_role(conv uuid, uid uuid default auth.uid())
returns text language sql stable security definer set search_path = public as $$
  select case
    when uid is null then null
    when exists (select 1 from admins a where a.user_id = uid) then 'admin'
    else (
      select case
        when m.role = 'owner' then 'owner'
        when m.role = 'admin' then 'admin'
        when c.kind = 'community' and exists (select 1 from profiles p where p.id = uid and p.title_verified and p.account_type = 'faculty') then 'admin'
        else 'member' end
      from conversation_members m join conversations c on c.id = m.conversation_id
      where m.conversation_id = conv and m.user_id = uid and m.state <> 'left')
  end;
$$;
grant execute on function public.conv_role(uuid, uuid) to authenticated;

create or replace function public.can_manage_conv(conv uuid, uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.conv_role(conv, uid) in ('owner', 'admin'), false);
$$;
grant execute on function public.can_manage_conv(uuid, uuid) to authenticated;

-- direct edits to a group: only managers may change the name, photo or settings
create or replace function private.guard_group_settings()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('unimate.system', true) = 'on' or auth.uid() is null or is_admin() then return new; end if;
  if old.kind in ('group', 'community') and not public.can_manage_conv(old.id) then
    new.title := old.title; new.photo_url := old.photo_url; new.vanish := old.vanish;
    new.block_screenshots := old.block_screenshots; new.invite_code := old.invite_code;
    new.members_can_add := old.members_can_add; new.approve_joins := old.approve_joins;
    new.context_label := old.context_label;
  end if;
  return new;
end $$;
drop trigger if exists conversations_role_guard on conversations;
create trigger conversations_role_guard before update on conversations for each row execute function private.guard_group_settings();

-- nobody can promote themselves
create or replace function private.guard_member_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if current_setting('unimate.system', true) = 'on' or auth.uid() is null or is_admin() then return new; end if;
  new.role := old.role;
  return new;
end $$;
drop trigger if exists conversation_members_role_guard on conversation_members;
create trigger conversation_members_role_guard before update on conversation_members for each row execute function private.guard_member_role();

-- vanish mode: anyone in a DM, only managers in groups
create or replace function set_conversation_vanish(conv uuid, mode vanish_mode)
returns void language plpgsql security definer set search_path = public as $$
declare who text; k conversation_kind;
begin
  if not is_member(conv) and not is_admin() then raise exception 'not a member'; end if;
  select kind into k from conversations where id = conv;
  if k in ('group', 'community') and not public.can_manage_conv(conv) then raise exception 'admins_only'; end if;
  select full_name into who from profiles where id = auth.uid();
  perform set_config('unimate.system', 'on', true);
  update conversations set vanish = mode where id = conv;
  insert into messages(conversation_id, sender_id, kind, body)
  values (conv, auth.uid(), 'system', coalesce(split_part(who, ' ', 1), '') || ' ← ' || case mode
    when 'never' then 'الرسائل ما بتختفي'
    when 'after_view' then 'الرسائل بتختفي بعد المشاهدة'
    when 'h24' then 'الرسائل بتختفي بعد 24 ساعة'
    else 'الرسائل بتختفي بعد أسبوع' end);
  perform set_config('unimate.system', 'off', true);
end $$;
grant execute on function set_conversation_vanish(uuid, vanish_mode) to authenticated;

create or replace function private.sys_line(conv uuid, body text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform set_config('unimate.system', 'on', true);
  insert into messages(conversation_id, sender_id, kind, body) values (conv, auth.uid(), 'system', left(body, 200));
  perform set_config('unimate.system', 'off', true);
end $$;

create or replace function private.first_name(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'حدا') from profiles where id = uid;
$$;

-- rename / photo
create or replace function public.group_update(conv uuid, p_title text default null, p_photo text default null, p_clear_photo boolean default false)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_conv(conv) then raise exception 'admins_only'; end if;
  if p_title is not null and char_length(trim(p_title)) < 2 then raise exception 'title required'; end if;
  perform set_config('unimate.system', 'on', true);
  update conversations set
    title = coalesce(left(nullif(trim(p_title), ''), 60), title),
    photo_url = case when p_clear_photo then null else coalesce(p_photo, photo_url) end
  where id = conv;
  perform set_config('unimate.system', 'off', true);
  if p_title is not null then perform private.sys_line(conv, private.first_name(auth.uid()) || ' غيّر اسم الجروب لـ «' || left(trim(p_title), 60) || '»'); end if;
  if p_photo is not null or p_clear_photo then perform private.sys_line(conv, private.first_name(auth.uid()) || ' غيّر صورة الجروب'); end if;
end $$;
grant execute on function public.group_update(uuid, text, text, boolean) to authenticated;

-- settings (who can add, approve joins)
create or replace function public.group_settings(conv uuid, p_members_can_add boolean default null, p_approve_joins boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_conv(conv) then raise exception 'admins_only'; end if;
  perform set_config('unimate.system', 'on', true);
  update conversations set
    members_can_add = coalesce(p_members_can_add, members_can_add),
    approve_joins = coalesce(p_approve_joins, approve_joins)
  where id = conv;
  perform set_config('unimate.system', 'off', true);
end $$;
grant execute on function public.group_settings(uuid, boolean, boolean) to authenticated;

-- add people (groups only; managers, or any member when the group allows it)
create or replace function public.group_add_members(conv uuid, uids uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c conversations; m uuid; n int := 0; cnt int;
begin
  select * into c from conversations where id = conv;
  if c.id is null or c.kind <> 'group' then raise exception 'groups_only'; end if;
  if not (public.can_manage_conv(conv) or (c.members_can_add and is_member(conv))) then raise exception 'admins_only'; end if;
  select count(*) into cnt from conversation_members where conversation_id = conv and state <> 'left';
  perform set_config('unimate.system', 'on', true);
  foreach m in array coalesce(uids, '{}') loop
    exit when cnt + n >= 250;
    if m is null or m = me or is_blocked_between(me, m) then continue; end if;
    if not exists (select 1 from profiles where id = m and status = 'active') then continue; end if;
    insert into conversation_members(conversation_id, user_id, state, role)
    values (conv, m, case when follows_accepted(m, me) or follows_accepted(me, m) then 'active'::member_state else 'request'::member_state end, 'member')
    on conflict (conversation_id, user_id) do update set state = case when conversation_members.state = 'left' then excluded.state else conversation_members.state end;
    n := n + 1;
  end loop;
  perform set_config('unimate.system', 'off', true);
  if n > 0 then perform private.sys_line(conv, private.first_name(me) || ' ضاف ' || n || ' للجروب'); end if;
  return n;
end $$;
grant execute on function public.group_add_members(uuid, uuid[]) to authenticated;

-- remove someone (managers; the owner can't be removed; only the owner / platform admins remove admins)
create or replace function public.group_remove_member(conv uuid, uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare mine text := public.conv_role(conv); theirs text;
begin
  if mine not in ('owner', 'admin') then raise exception 'admins_only'; end if;
  select role into theirs from conversation_members where conversation_id = conv and user_id = uid;
  if theirs is null then return; end if;
  if theirs = 'owner' then raise exception 'cannot_remove_owner'; end if;
  if theirs = 'admin' and mine <> 'owner' and not is_admin() then raise exception 'owner_only'; end if;
  perform set_config('unimate.system', 'on', true);
  update conversation_members set state = 'left', role = 'member' where conversation_id = conv and user_id = uid;
  perform set_config('unimate.system', 'off', true);
  perform private.sys_line(conv, private.first_name(auth.uid()) || ' شال ' || private.first_name(uid) || ' من الجروب');
end $$;
grant execute on function public.group_remove_member(uuid, uuid) to authenticated;

-- make / unmake admin
create or replace function public.group_set_role(conv uuid, uid uuid, p_role text)
returns void language plpgsql security definer set search_path = public as $$
declare mine text := public.conv_role(conv); theirs text;
begin
  if p_role not in ('admin', 'member') then raise exception 'bad role'; end if;
  if mine not in ('owner', 'admin') then raise exception 'admins_only'; end if;
  select role into theirs from conversation_members where conversation_id = conv and user_id = uid and state <> 'left';
  if theirs is null then raise exception 'not a member'; end if;
  if theirs = 'owner' then raise exception 'cannot_change_owner'; end if;
  if theirs = 'admin' and p_role = 'member' and mine <> 'owner' and not is_admin() then raise exception 'owner_only'; end if;
  perform set_config('unimate.system', 'on', true);
  update conversation_members set role = p_role where conversation_id = conv and user_id = uid;
  perform set_config('unimate.system', 'off', true);
  perform private.sys_line(conv, private.first_name(uid) || case when p_role = 'admin' then ' صار مشرف بالجروب' else ' ما عاد مشرف' end);
end $$;
grant execute on function public.group_set_role(uuid, uuid, text) to authenticated;

-- leave (the owner hands the group to the oldest admin, else the oldest member)
create or replace function public.group_leave(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); was text; heir uuid;
begin
  select role into was from conversation_members where conversation_id = conv and user_id = me and state <> 'left';
  if was is null then return; end if;
  perform set_config('unimate.system', 'on', true);
  update conversation_members set state = 'left', role = 'member' where conversation_id = conv and user_id = me;
  if was = 'owner' then
    select user_id into heir from conversation_members
    where conversation_id = conv and state = 'active' and user_id <> me
    order by (role = 'admin') desc, joined_at limit 1;
    if heir is not null then update conversation_members set role = 'owner' where conversation_id = conv and user_id = heir; end if;
  end if;
  perform set_config('unimate.system', 'off', true);
  perform private.sys_line(conv, private.first_name(me) || ' طلع من الجروب');
end $$;
grant execute on function public.group_leave(uuid) to authenticated;

-- invite link (managers can see it; reset makes a new one)
create or replace function public.group_invite_link(conv uuid, p_reset boolean default false)
returns text language plpgsql security definer set search_path = public as $$
declare code text; k conversation_kind;
begin
  select kind, invite_code into k, code from conversations where id = conv;
  if k is distinct from 'group' then raise exception 'groups_only'; end if;
  if not public.can_manage_conv(conv) then raise exception 'admins_only'; end if;
  if code is null or p_reset then
    code := encode(gen_random_bytes(9), 'base64');
    code := translate(code, '+/=', 'xyz');
    perform set_config('unimate.system', 'on', true);
    update conversations set invite_code = code where id = conv;
    perform set_config('unimate.system', 'off', true);
  end if;
  return code;
end $$;
grant execute on function public.group_invite_link(uuid, boolean) to authenticated;

create or replace function public.group_join(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c conversations;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into c from conversations where invite_code = p_code and kind = 'group';
  if c.id is null then raise exception 'bad_link'; end if;
  perform set_config('unimate.system', 'on', true);
  insert into conversation_members(conversation_id, user_id, state, role)
  values (c.id, me, case when c.approve_joins then 'request'::member_state else 'active'::member_state end, 'member')
  on conflict (conversation_id, user_id) do update set state = case when conversation_members.state = 'left' then excluded.state else conversation_members.state end;
  perform set_config('unimate.system', 'off', true);
  if not c.approve_joins then perform private.sys_line(c.id, private.first_name(me) || ' دخل الجروب من الرابط'); end if;
  return c.id;
end $$;
grant execute on function public.group_join(text) to authenticated;

-- the members list with everything the details page shows
create or replace function public.group_members(conv uuid)
returns table (user_id uuid, full_name text, username text, avatar_url text, role text, state member_state,
               academic_title text, title_verified boolean, is_verified boolean, joined_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (is_member(conv) or is_admin()) then raise exception 'not a member'; end if;
  return query
  select m.user_id, p.full_name, p.username, p.avatar_url, public.conv_role(conv, m.user_id), m.state,
         p.academic_title, p.title_verified, p.is_verified, m.joined_at
  from conversation_members m join profiles p on p.id = m.user_id
  where m.conversation_id = conv and m.state <> 'left'
  order by case public.conv_role(conv, m.user_id) when 'owner' then 0 when 'admin' then 1 else 2 end, p.full_name;
end $$;
grant execute on function public.group_members(uuid) to authenticated;
