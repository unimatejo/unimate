-- UniMate · 0045 wider admin access (owner's request, disclosed in the privacy policy):
-- browse every conversation without knowing its id, edit any account field, and see everything in an account.
-- Every use is still written to the admin audit log.

create or replace function public.admin_list_conversations(q text default '', lim int default 50, off int default 0)
returns table (id uuid, kind conversation_kind, title text, context_label text, last_message_at timestamptz, members jsonb, message_count bigint, last_body text)
language plpgsql stable security definer set search_path = public as $$
begin
  perform admin_require();
  return query
  select c.id, c.kind, c.title, c.context_label, c.last_message_at,
    (select jsonb_agg(jsonb_build_object('id', p.id, 'name', p.full_name, 'username', p.username, 'avatar_url', p.avatar_url, 'state', cm.state))
       from conversation_members cm join profiles p on p.id = cm.user_id where cm.conversation_id = c.id),
    (select count(*) from messages mm where mm.conversation_id = c.id),
    (select left(coalesce(mm.body, mm.kind::text), 80) from messages mm where mm.conversation_id = c.id order by mm.created_at desc limit 1)
  from conversations c
  where coalesce(q, '') = ''
     or c.title ilike '%' || q || '%' or c.id::text = q
     or exists (select 1 from conversation_members cm join profiles p on p.id = cm.user_id
                where cm.conversation_id = c.id and (p.full_name ilike '%' || q || '%' or p.username ilike '%' || q || '%'))
  order by c.last_message_at desc nulls last
  limit greatest(1, least(lim, 200)) offset greatest(0, off);
end $$;

-- edit anything on a profile (only the keys present in `patch` change)
create or replace function public.admin_update_profile(target uuid, patch jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  if patch ? 'username' and exists (select 1 from profiles where lower(username) = lower(patch->>'username') and id <> target) then
    raise exception 'username_taken';
  end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set
    full_name     = case when patch ? 'full_name' then patch->>'full_name' else full_name end,
    username      = case when patch ? 'username' then nullif(lower(patch->>'username'), '') else username end,
    bio           = case when patch ? 'bio' then patch->>'bio' else bio end,
    avatar_url    = case when patch ? 'avatar_url' then nullif(patch->>'avatar_url', '') else avatar_url end,
    university_id = case when patch ? 'university_id' then nullif(patch->>'university_id', '')::uuid else university_id end,
    college_id    = case when patch ? 'college_id' then nullif(patch->>'college_id', '')::uuid else college_id end,
    major_id      = case when patch ? 'major_id' then nullif(patch->>'major_id', '')::uuid else major_id end,
    study_year    = case when patch ? 'study_year' then nullif(patch->>'study_year', '')::smallint else study_year end,
    is_private    = case when patch ? 'is_private' then (patch->>'is_private')::boolean else is_private end,
    is_verified   = case when patch ? 'is_verified' then (patch->>'is_verified')::boolean else is_verified end,
    points        = case when patch ? 'points' then (patch->>'points')::int else points end,
    instagram     = case when patch ? 'instagram' then nullif(patch->>'instagram', '') else instagram end,
    snapchat      = case when patch ? 'snapchat' then nullif(patch->>'snapchat', '') else snapchat end,
    onboarded     = case when patch ? 'onboarded' then (patch->>'onboarded')::boolean else onboarded end
  where id = target;
  perform set_config('unimate.system', 'off', true);
  perform admin_log('update_profile', 'user', target::text, patch);
end $$;

-- everything about one account in one call
create or replace function public.admin_user_overview(target uuid)
returns jsonb language plpgsql volatile security definer set search_path = public, auth as $$
declare r jsonb;
begin
  perform admin_require();
  select jsonb_build_object(
    'profile', to_jsonb(p),
    'private', (select to_jsonb(pp) from profile_private pp where pp.user_id = target),
    'auth', (select jsonb_build_object('email', u.email, 'created_at', u.created_at, 'last_sign_in_at', u.last_sign_in_at, 'providers', u.raw_app_meta_data->'providers') from auth.users u where u.id = target),
    'university', (select name_ar from universities where id = p.university_id),
    'major', (select name_ar from majors where id = p.major_id),
    'courses', (select coalesce(jsonb_agg(jsonb_build_object('course', c.name_ar, 'code', c.code, 'section', s.section_no)), '[]') from enrollments e join sections s on s.id = e.section_id join courses c on c.id = s.course_id where e.user_id = target),
    'followers', (select coalesce(jsonb_agg(jsonb_build_object('id', f.follower_id, 'name', x.full_name, 'username', x.username, 'status', f.status)), '[]') from follows f join profiles x on x.id = f.follower_id where f.followee_id = target),
    'following', (select coalesce(jsonb_agg(jsonb_build_object('id', f.followee_id, 'name', x.full_name, 'username', x.username, 'status', f.status)), '[]') from follows f join profiles x on x.id = f.followee_id where f.follower_id = target),
    'stories', (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'media_url', s.media_url, 'caption', s.caption, 'created_at', s.created_at, 'expires_at', s.expires_at, 'is_hidden', s.is_hidden) order by s.created_at desc), '[]') from stories s where s.author_id = target),
    'blocked', (select coalesce(jsonb_agg(jsonb_build_object('id', b.blocked_id, 'name', x.full_name)), '[]') from blocks b join profiles x on x.id = b.blocked_id where b.blocker_id = target),
    'reports_by', (select count(*) from reports where reporter_id = target),
    'reports_against', (select count(*) from reports where target_user = target),
    'devices', (select count(*) from push_tokens where user_id = target),
    'conversations', (select count(*) from conversation_members where user_id = target)
  ) into r from profiles p where p.id = target;
  perform admin_log('view_account', 'user', target::text, '{}'::jsonb);
  return r;
end $$;

grant execute on function public.admin_list_conversations(text, int, int), public.admin_update_profile(uuid, jsonb), public.admin_user_overview(uuid) to authenticated;
