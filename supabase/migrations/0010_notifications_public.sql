-- Accounts start public (like Instagram); people can switch to private in Privacy settings.
alter table profiles alter column is_private set default false;
update profiles set is_private = false where is_private and created_at > now() - interval '30 days'
;

-- In-app notifications for social activity. Respects notification_prefs.social and never notifies yourself.
create or replace function wants_social(uid uuid) returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select social from notification_prefs where user_id = uid), true);
$$;

create or replace function notify_social() returns trigger language plpgsql security definer set search_path = public as $$
declare target uuid; actor uuid; who text; pid uuid;
begin
  if tg_table_name = 'post_likes' then
    select author_id into target from posts where id = new.post_id; actor := new.user_id; pid := new.post_id;
    if target is null or target = actor or not wants_social(target) then return new; end if;
    -- one like notification per post per hour, so a viral post doesn't flood
    if exists (select 1 from notifications where user_id = target and kind = 'like' and data->>'post_id' = pid::text and created_at > now() - interval '1 hour') then return new; end if;
    select full_name into who from profiles where id = actor;
    insert into notifications(user_id, kind, actor_id, title, data) values (target, 'like', actor, coalesce(who, 'حدا') || ' عجبه منشورك', jsonb_build_object('post_id', pid));
  elsif tg_table_name = 'comments' then
    select author_id into target from posts where id = new.post_id; actor := new.author_id; pid := new.post_id;
    if target is null or target = actor or not wants_social(target) then return new; end if;
    select full_name into who from profiles where id = actor;
    insert into notifications(user_id, kind, actor_id, title, body, data) values (target, 'comment', actor, coalesce(who, 'حدا') || ' علّق على منشورك', left(new.body, 80), jsonb_build_object('post_id', pid));
  elsif tg_table_name = 'follows' then
    target := new.followee_id; actor := new.follower_id;
    if not wants_social(target) then return new; end if;
    select full_name into who from profiles where id = actor;
    if tg_op = 'INSERT' and new.status = 'accepted' then
      insert into notifications(user_id, kind, actor_id, title, data) values (target, 'follow', actor, coalesce(who, 'حدا') || ' صار يتابعك', jsonb_build_object('user_id', actor));
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
      select full_name into who from profiles where id = target;
      insert into notifications(user_id, kind, actor_id, title, data) values (actor, 'follow', target, coalesce(who, 'حدا') || ' قبل طلب متابعتك', jsonb_build_object('user_id', target));
    end if;
    -- pending requests show in the requests list on the notifications screen, no extra row
  end if;
  return new;
end $$;

drop trigger if exists post_likes_notify on post_likes;
create trigger post_likes_notify after insert on post_likes for each row execute function notify_social();
drop trigger if exists comments_notify on comments;
create trigger comments_notify after insert on comments for each row execute function notify_social();
drop trigger if exists follows_notify on follows;
create trigger follows_notify after insert or update on follows for each row execute function notify_social();
revoke execute on function notify_social(), wants_social(uuid) from public, anon, authenticated;
