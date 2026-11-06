-- 0090 · Content checks everywhere (FOR REVIEW — not applied yet)
-- Today posts, comments and story captions are checked only when created: an author can edit them afterwards
-- and the edit is never checked. Names, usernames, poll options, story text stickers, group names and official
-- announcements are not checked at all. This closes those gaps and widens the word list.

-- 1) edits are checked like new items (posts: title, body and poll options)
create or replace function private.mod_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text := private.mod_hits(concat_ws(' ', new.title, new.body, (select string_agg(x, ' ') from jsonb_array_elements_text(coalesce(new.poll->'options', '[]'::jsonb)) x)));
begin
  if tg_op = 'UPDATE' and new.title is not distinct from old.title and new.body is not distinct from old.body and new.poll is not distinct from old.poll then return new; end if;
  if h is not null then
    new.is_hidden := true;
    perform private.mod_queue('post', new.id::text, new.author_id, 'words', h, concat_ws(' — ', new.title, new.body));
  end if;
  return new;
end $$;
drop trigger if exists posts_moderate on posts;
create trigger posts_moderate before insert or update of title, body, poll on posts for each row execute function private.mod_post();

create or replace function private.mod_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text := private.mod_hits(new.body);
begin
  if tg_op = 'UPDATE' and new.body is not distinct from old.body then return new; end if;
  if h is not null then
    new.is_hidden := true;
    perform private.mod_queue('comment', new.id::text, new.author_id, 'words', h, new.body);
  end if;
  return new;
end $$;
drop trigger if exists comments_moderate on comments;
create trigger comments_moderate before insert or update of body on comments for each row execute function private.mod_comment();

-- stories: the caption and every text sticker on it
create or replace function private.mod_story()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text := private.mod_hits(concat_ws(' ', new.caption, (select string_agg(coalesce(o->>'text', o->>'body', o->>'question', ''), ' ') from jsonb_array_elements(case when jsonb_typeof(new.overlays) = 'array' then new.overlays else '[]'::jsonb end) o)));
begin
  if tg_op = 'UPDATE' and new.caption is not distinct from old.caption and new.overlays is not distinct from old.overlays then return new; end if;
  if h is not null then
    new.is_hidden := true;
    perform private.mod_queue('story', new.id::text, new.author_id, 'words', h, new.caption, new.media_url);
  end if;
  return new;
end $$;
drop trigger if exists stories_moderate on stories;
create trigger stories_moderate before insert or update of caption, overlays on stories for each row execute function private.mod_story();

-- 2) usernames with a bad word are refused; a name with one goes to the review queue (real names can look odd)
create or replace function private.mod_names()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if current_setting('unimate.system', true) = 'on' then return new; end if;
  if new.username is distinct from old.username and new.username is not null and private.mod_hits(replace(new.username, '_', ' ')) is not null then
    raise exception 'username_not_allowed' using errcode = 'P0001';
  end if;
  if new.full_name is distinct from old.full_name then
    h := private.mod_hits(new.full_name);
    if h is not null then
      perform private.mod_queue('bio', new.id::text, new.id, 'words', h, 'الاسم: ' || new.full_name);
      new.full_name := old.full_name;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_moderate_names on profiles;
create trigger profiles_moderate_names before update of username, full_name on profiles for each row execute function private.mod_names();

-- 3) group names
create or replace function private.mod_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.title is not null and (tg_op = 'INSERT' or new.title is distinct from old.title) and private.mod_hits(new.title) is not null then
    raise exception 'name_not_allowed' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists conversations_moderate on conversations;
create trigger conversations_moderate before insert or update of title on conversations for each row execute function private.mod_conversation();

-- 4) the review queue accepts the new kinds
alter table moderation_queue drop constraint if exists moderation_queue_target_type_check;
alter table moderation_queue add constraint moderation_queue_target_type_check
  check (target_type in ('post', 'comment', 'story', 'message', 'bio', 'avatar', 'post_media', 'announcement', 'name'));

-- 5) a wider word list (stored normalized: no diacritics, ة→ه, أ/إ/آ→ا, ى→ي)
insert into moderation_words(word)
select private.mod_norm(w) from unnest(array[
  'cunt', 'wanker', 'twat', 'dickhead', 'blowjob', 'handjob', 'jerk off', 'onlyfans', 'sexting', 'nude', 'rape', 'rapist',
  'kys', 'kill yourself', 'go die', 'whores', 'sluts', 'fag', 'tranny', 'retarded',
  'يا حيوان', 'يا حمار', 'يا كلب', 'يا خنزير', 'يا واطي', 'يا حقير', 'يا زباله', 'يا تافه', 'ابن الكلب', 'ابن الحرام', 'ابن الزانيه',
  'يلعن شرفك', 'يلعن عرضك', 'يلعن اختك', 'يلعن ربك', 'يلعن ابوكم', 'كس اخوك', 'كسختك', 'كسم', 'عير', 'عيري', 'طيزها', 'طيزي',
  'منيوكه', 'متناكه', 'تنتاك', 'انتاك', 'نيكني', 'سكسي', 'افلام سكس', 'صور عاريه', 'ديوث', 'مخنث', 'زانيه', 'زاني',
  'اقتل نفسك', 'روح انتحر', 'موت يا'
]) w
on conflict do nothing;
