-- Automatic groups: every student is placed in their college, major and cohort (college + entry year) groups,
-- each with a feed (community) and a group chat. Changing college/major moves them automatically.
alter table communities add column if not exists entry_year smallint;
create unique index if not exists communities_one_cohort on communities(college_id, entry_year) where kind = 'cohort';

create or replace function ensure_community(k community_kind, uni uuid, col uuid, maj uuid, yr smallint)
returns uuid language plpgsql security definer set search_path = public as $$
declare comm uuid; nm text; conv uuid; chat boolean := k in ('college', 'major', 'cohort');
begin
  if k = 'university' then select id into comm from communities where kind = k and university_id = uni;
  elsif k = 'college' then select id into comm from communities where kind = k and college_id = col;
  elsif k = 'major' then select id into comm from communities where kind = k and major_id = maj;
  else select id into comm from communities where kind = k and college_id = col and entry_year = yr; end if;

  if comm is null then
    nm := case k
      when 'university' then (select name_ar from universities where id = uni)
      when 'college' then (select name_ar from colleges where id = col)
      when 'major' then (select name_ar from majors where id = maj)
      else 'دفعة ' || yr || ' · ' || (select name_ar from colleges where id = col) end;
    if nm is null then return null; end if;
    insert into communities(university_id, kind, college_id, major_id, entry_year, name)
    values (uni, k, case when k in ('college', 'cohort') then col end, case when k = 'major' then maj end, case when k = 'cohort' then yr end, nm)
    on conflict do nothing returning id into comm;
    if comm is null then return ensure_community(k, uni, col, maj, yr); end if;
  end if;

  if chat then
    select id into conv from conversations where community_id = comm and kind = 'community';
    if conv is null then
      insert into conversations(kind, university_id, community_id, title, vanish, block_screenshots)
      select 'community', uni, comm, name, 'never', false from communities where id = comm
      on conflict do nothing;
    end if;
  end if;
  return comm;
end $$;
revoke execute on function ensure_community(community_kind, uuid, uuid, uuid, smallint) from public, anon, authenticated;

create or replace function join_base_communities()
returns trigger language plpgsql security definer set search_path = public as $$
declare ids uuid[] := '{}'; c uuid;
begin
  if new.university_id is null then return new; end if;
  perform set_config('unimate.system', 'on', true);
  c := ensure_community('university', new.university_id, null, null, null); if c is not null then ids := ids || c; end if;
  if new.college_id is not null then c := ensure_community('college', new.university_id, new.college_id, null, null); if c is not null then ids := ids || c; end if; end if;
  if new.major_id is not null then c := ensure_community('major', new.university_id, null, new.major_id, null); if c is not null then ids := ids || c; end if; end if;
  if new.college_id is not null and new.entry_year is not null then
    c := ensure_community('cohort', new.university_id, new.college_id, null, new.entry_year); if c is not null then ids := ids || c; end if;
  end if;

  -- leave base groups that no longer match (course sections and clubs are untouched)
  delete from community_members m using communities k
  where m.community_id = k.id and m.user_id = new.id and k.kind in ('university', 'college', 'major', 'cohort') and not (k.id = any(ids));
  update conversation_members cm set state = 'left'
  from conversations v join communities k on k.id = v.community_id
  where cm.conversation_id = v.id and cm.user_id = new.id and k.kind in ('college', 'major', 'cohort') and not (k.id = any(ids)) and cm.state <> 'left';

  insert into community_members(community_id, user_id) select unnest(ids), new.id on conflict do nothing;
  insert into conversation_members(conversation_id, user_id)
  select v.id, new.id from conversations v where v.kind = 'community' and v.community_id = any(ids)
  on conflict (conversation_id, user_id) do update set state = 'active';
  perform set_config('unimate.system', 'off', true);
  return new;
end $$;
drop trigger if exists profiles_join_communities on profiles;
create trigger profiles_join_communities after insert or update of university_id, college_id, major_id, entry_year on profiles
for each row execute function join_base_communities();

-- a message request becomes a normal chat as soon as you follow each other
create or replace function follows_unlock_requests()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'accepted' and follows_accepted(new.followee_id, new.follower_id) then
    perform set_config('unimate.system', 'on', true);
    update conversation_members cm set state = 'active'
    from conversations v
    where v.id = cm.conversation_id and v.kind = 'direct' and cm.state = 'request'
      and cm.user_id in (new.follower_id, new.followee_id)
      and exists (select 1 from conversation_members a where a.conversation_id = v.id and a.user_id = new.follower_id)
      and exists (select 1 from conversation_members b where b.conversation_id = v.id and b.user_id = new.followee_id);
    perform set_config('unimate.system', 'off', true);
  end if;
  return new;
end $$;
drop trigger if exists follows_unlock_requests on follows;
create trigger follows_unlock_requests after insert or update of status on follows for each row execute function follows_unlock_requests();

-- create a group chat with friends (max 50). People who don't follow you get it as a request.
create or replace function create_group(title text, members uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); conv uuid; m uuid; uni uuid;
begin
  if not is_active_user(me) then raise exception 'account not active'; end if;
  if coalesce(char_length(trim(title)), 0) < 2 then raise exception 'title required'; end if;
  if coalesce(array_length(members, 1), 0) < 1 or array_length(members, 1) > 49 then raise exception 'members 1..49'; end if;
  select university_id into uni from profiles where id = me;
  perform set_config('unimate.system', 'on', true);
  insert into conversations(kind, university_id, title, vanish, block_screenshots, created_by)
  values ('group', uni, left(trim(title), 60), 'never', false, me) returning id into conv;
  insert into conversation_members(conversation_id, user_id, state) values (conv, me, 'active');
  foreach m in array members loop
    if m <> me and not is_blocked_between(me, m) and exists (select 1 from profiles where id = m and university_id = uni and status = 'active') then
      insert into conversation_members(conversation_id, user_id, state)
      values (conv, m, case when follows_accepted(m, me) or follows_accepted(me, m) then 'active'::member_state else 'request'::member_state end)
      on conflict do nothing;
    end if;
  end loop;
  insert into messages(conversation_id, sender_id, kind, body) values (conv, me, 'system', 'انعمل الجروب');
  perform set_config('unimate.system', 'off', true);
  return conv;
end $$;
grant execute on function create_group(text, uuid[]) to authenticated;

-- put everyone who already has a profile into their groups
update profiles set entry_year = entry_year where university_id is not null;
-- everyone without an entry year sees the new one-time onboarding (prefilled)
update profiles set onboarded = false where entry_year is null;
