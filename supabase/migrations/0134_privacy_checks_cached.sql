-- UniMate · 0134 the privacy checks keep their query plans
--
-- Found by the load test: the small checks behind every row rule ("is this my university?", "is one of us blocked?",
-- "am I a member of this chat?", "may I see this post?") were plain SQL functions. Postgres plans a plain SQL
-- function's query again every time it runs, and these run for every row a student reads: "may I see this post?"
-- cost about 1.1 ms, "may I see this person?" about 0.5 ms, and they were most of the database's work at peak.
-- A PL/pgSQL function keeps its plans for the whole connection, so each check now costs a few microseconds.
-- Every rule is copied word for word: only the language changes (and, as in plain SQL, a table column wins over a
-- parameter with the same name: "#variable_conflict use_column"). Tested against the old functions: the same answer
-- (including "no answer" when signed out) for every post and person checked, for a student, an admin, a student of
-- another university, a blocked student and a signed-out visitor, over own posts, hidden posts, private accounts
-- (follower, pending, not following), suspended accounts, blocks both ways and every post audience; and the same
-- rows visible in 20 tables for each of those identities.

create or replace function public.admin_session_ok()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select auth.uid() is null
        or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
        or (not exists (select 1 from private.team_accounts where user_id = auth.uid())
            and not exists (select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr', '[]'::jsonb)) x
                            where x->>'method' in ('password', 'recovery')))
  );
end
$function$;

create or replace function public.blocked_me(target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select auth.uid() is not null and exists (select 1 from blocks where blocker_id = target and blocked_id = auth.uid())
  );
end
$function$;

create or replace function public.can_see_story(s stories)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select
      is_admin() or s.author_id = auth.uid()
      or (
        not s.is_hidden
        and (s.expires_at > now() or s.is_highlighted)
        and s.university_id = my_university()
        and not is_blocked_between(auth.uid(), s.author_id)
        and case s.audience
          when 'friends'       then follows_accepted(auth.uid(), s.author_id)
          when 'close_friends' then exists (select 1 from close_friends where owner_id = s.author_id and friend_id = auth.uid())
          when 'major'         then (select major_id from profiles where id = auth.uid()) = (select major_id from profiles where id = s.author_id)
          when 'university'    then true
        end
        and (s.community_id is null or is_community_member(s.community_id))
      )
  );
end
$function$;

create or replace function public.follows_accepted(viewer uuid, target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select (auth.uid() is null or auth.uid() in (viewer, target) or is_admin())
       and exists (select 1 from follows where follower_id = viewer and followee_id = target and status = 'accepted')
  );
end
$function$;

create or replace function public.is_active_user(uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from profiles where id = uid and status = 'active')
  );
end
$function$;

create or replace function public.is_admin(uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from admins where user_id = uid)
       and (auth.uid() is null or uid = auth.uid() or exists (select 1 from admins where user_id = auth.uid()))
       and admin_session_ok()
  );
end
$function$;

create or replace function public.is_blocked_between(a uuid, b uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select (auth.uid() is null or auth.uid() in (a, b) or is_admin())
       and exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
  );
end
$function$;

create or replace function public.is_community_member(c uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from community_members where community_id = c and user_id = auth.uid())
  );
end
$function$;

create or replace function public.is_enrolled(sec uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from enrollments where section_id = sec and user_id = auth.uid())
  );
end
$function$;

create or replace function public.is_member(conv uuid, uid uuid DEFAULT auth.uid())
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from conversation_members where conversation_id = conv and user_id = uid and state <> 'left')
  );
end
$function$;

create or replace function public.is_my_swap_partner(req uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from swap_requests where user_id = auth.uid() and matched_with = req)
  );
end
$function$;

create or replace function public.is_owner()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from admins where user_id = auth.uid() and role = 'owner') and admin_session_ok()
  );
end
$function$;

create or replace function public.is_team_account(uid uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from private.team_accounts where user_id = uid)
  );
end
$function$;

create or replace function public.my_university()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select university_id from profiles where id = auth.uid()
  );
end
$function$;

create or replace function public.story_answerable(p_story uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from stories s where s.id = p_story and s.expires_at > now() and can_see_story(s))
  );
end
$function$;

create or replace function public.story_author_is_me(p_story uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
begin
  return (
    select exists (select 1 from stories s where s.id = p_story and s.author_id = auth.uid())
  );
end
$function$;

create or replace function public.can_see_user(target uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  return
    target = auth.uid()
    or is_admin()
    or exists (
      select 1 from profiles t
      where t.id = target
        and t.status = 'active'
        and t.university_id = my_university()
        and not is_blocked_between(auth.uid(), target)
        and (not t.is_private or follows_accepted(auth.uid(), target))
    );
end $$;

create or replace function public.can_see_post(p posts)
returns boolean language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  return
    is_admin()
    or p.author_id = auth.uid()
    or (
      not p.is_hidden
      and p.university_id = my_university()
      and not is_blocked_between(auth.uid(), p.author_id)
      and case
        -- course groups and clubs: every member sees posts, whatever the author's account privacy
        when p.audience = 'community' then is_community_member(p.community_id)
        -- personal feed posts ('square') of a private account: accepted followers only.
        -- section posts (lost & found, market, summaries...) are meant for the whole audience.
        else (p.category <> 'square' or can_see_user(p.author_id)) and case p.audience
          when 'university' then true
          when 'college'    then (select college_id from profiles where id = auth.uid()) = (select college_id from profiles where id = p.author_id)
          when 'major'      then (select major_id from profiles where id = auth.uid()) = (select major_id from profiles where id = p.author_id)
          when 'friends'    then follows_accepted(auth.uid(), p.author_id)
          else false
        end
      end
    );
end $$;
