-- Someone removed from a group (or who left) could set their own membership back to active and read / send again.
-- Now only the group's own functions (invite link, add member) can bring them back.
CREATE OR REPLACE FUNCTION public.guard_moderation_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- removed from (or left) a group: only an invite / an admin of the group can bring you back, never your own update
    if old.state = 'left' and new.state <> 'left'
       and (select kind from conversations where id = old.conversation_id) = 'group' then
      new.state := old.state;
    end if;
    new.joined_at := old.joined_at;
    new.last_sent_day := old.last_sent_day;
  end if;
  return new;
end $function$;
