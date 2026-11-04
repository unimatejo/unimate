-- UniMate · 0051 automatic content checks.
-- Text: a word list (Arabic, Jordanian, English) checked on new posts, comments, stories, group/community
-- messages (never private chats) and bio changes. A hit hides the item (or keeps the old bio) and puts it
-- in moderation_queue for an admin to approve or remove — nothing is deleted.
-- Images: new post photos, stories and profile photos go to the `moderate` edge function (Gemini);
-- if it flags them they are hidden and queued the same way.
create extension if not exists pg_net with schema extensions;

create table if not exists public.moderation_words (
  word       text primary key,          -- stored normalized (see private.mod_norm)
  created_at timestamptz not null default now()
);
alter table public.moderation_words enable row level security;
drop policy if exists "mod words admins" on public.moderation_words;
create policy "mod words admins" on public.moderation_words for all using (is_admin()) with check (is_admin());

create table if not exists public.moderation_queue (
  id          uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('post', 'comment', 'story', 'message', 'bio', 'avatar', 'post_media')),
  target_id   text not null,
  author_id   uuid references profiles(id) on delete cascade,
  reason      text not null check (reason in ('words', 'image')),
  matched     text,                     -- the words found, or the image verdict
  excerpt     text,                     -- the text, or the new bio
  media_url   text,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'removed')),
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists moderation_queue_pending on public.moderation_queue(created_at desc) where status = 'pending';
alter table public.moderation_queue enable row level security;
drop policy if exists "mod queue admins" on public.moderation_queue;
create policy "mod queue admins" on public.moderation_queue for select using (is_admin());

-- normalize Arabic/English text so spelling tricks still match: no diacritics/tatweel, one form of alef/ya/ta marbuta,
-- Arabic digits, lowercase, repeated letters collapsed ("كسسسس" → "كس"), punctuation → spaces
create or replace function private.mod_norm(s text)
returns text language sql immutable as $$
  -- digits and letters first (mapped), diacritics and tatweel last (no counterpart = removed)
  select regexp_replace(regexp_replace(lower(translate(coalesce(s, ''),
    '٠١٢٣٤٥٦٧٨٩أإآٱىةًٌٍَُِّْـ',
    '0123456789اااايه')), '(.)\1{2,}', '\1', 'g'), '[^[:alnum:] ]+', ' ', 'g');
$$;

-- the words found in a text (null = clean). Whole words only, so "عكس" or "كسر" never match "كس".
create or replace function private.mod_hits(s text)
returns text language sql stable security definer set search_path = public as $$
  select string_agg(w.word, '، ')
  from moderation_words w, (select ' ' || private.mod_norm(s) || ' ' as t) x
  where position(' ' || w.word || ' ' in x.t) > 0;
$$;

create or replace function private.mod_queue(p_type text, p_id text, p_author uuid, p_reason text, p_matched text, p_excerpt text, p_media text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into moderation_queue(target_type, target_id, author_id, reason, matched, excerpt, media_url)
  values (p_type, p_id, p_author, p_reason, left(p_matched, 200), left(p_excerpt, 500), p_media);
  perform private.admin_alert('mod-queue', 'في محتوى بانتظار المراجعة', 'افتح «فحص المحتوى» بلوحة الإدارة', '/admin/moderation');
exception when others then null;
end $$;

-- ---------- text checks ----------
create or replace function private.mod_post()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text := private.mod_hits(concat_ws(' ', new.title, new.body));
begin
  if h is not null then
    new.is_hidden := true;
    perform private.mod_queue('post', new.id::text, new.author_id, 'words', h, concat_ws(' — ', new.title, new.body));
  end if;
  return new;
end $$;
drop trigger if exists posts_moderate on posts;
create trigger posts_moderate before insert on posts for each row execute function private.mod_post();

create or replace function private.mod_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text := private.mod_hits(new.body);
begin
  if h is not null then
    new.is_hidden := true;
    perform private.mod_queue('comment', new.id::text, new.author_id, 'words', h, new.body);
  end if;
  return new;
end $$;
drop trigger if exists comments_moderate on comments;
create trigger comments_moderate before insert on comments for each row execute function private.mod_comment();

create or replace function private.mod_story()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text := private.mod_hits(new.caption);
begin
  if h is not null then
    new.is_hidden := true;
    perform private.mod_queue('story', new.id::text, new.author_id, 'words', h, new.caption, new.media_url);
  end if;
  return new;
end $$;
drop trigger if exists stories_moderate on stories;
create trigger stories_moderate before insert on stories for each row execute function private.mod_story();

-- group and community chats only; a private chat is never scanned
create or replace function private.mod_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if new.kind <> 'text' or new.body is null then return new; end if;
  if not exists (select 1 from conversations c where c.id = new.conversation_id and c.kind in ('group', 'community')) then return new; end if;
  h := private.mod_hits(new.body);
  if h is not null then
    new.deleted_at := now();
    perform private.mod_queue('message', new.id::text, new.sender_id, 'words', h, new.body);
  end if;
  return new;
end $$;
drop trigger if exists messages_moderate on messages;
create trigger messages_moderate before insert on messages for each row execute function private.mod_message();

-- bio: a flagged new bio isn't saved; it waits in the queue and goes live if an admin approves
create or replace function private.mod_profile()
returns trigger language plpgsql security definer set search_path = public as $$
declare h text;
begin
  if current_setting('unimate.system', true) = 'on' then return new; end if;
  if new.bio is distinct from old.bio and new.bio is not null then
    h := private.mod_hits(new.bio);
    if h is not null then
      perform private.mod_queue('bio', new.id::text, new.id, 'words', h, new.bio);
      new.bio := old.bio;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists profiles_moderate on profiles;
create trigger profiles_moderate before update of bio on profiles for each row execute function private.mod_profile();

-- ---------- image checks (edge function `moderate`, secret in private.push_cfg 'moderate_secret') ----------
create or replace function private.mod_image(p_type text, p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare s text;
begin
  select v into s from private.push_cfg where k = 'moderate_secret';
  if s is null then return; end if;
  perform net.http_post(
    url := 'https://slkfyblvpewlxrifzrhg.supabase.co/functions/v1/moderate',
    body := jsonb_build_object('type', p_type, 'id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mod-secret', s),
    timeout_milliseconds := 20000);
exception when others then null;
end $$;

create or replace function private.on_post_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'image' then perform private.mod_image('post_media', new.id::text); end if;
  return null;
end $$;
drop trigger if exists post_media_moderate on post_media;
create trigger post_media_moderate after insert on post_media for each row execute function private.on_post_media();

create or replace function private.on_story_media()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind::text = 'image' and new.media_url is not null and not new.is_hidden then perform private.mod_image('story', new.id::text); end if;
  return null;
end $$;
drop trigger if exists stories_moderate_image on stories;
create trigger stories_moderate_image after insert on stories for each row execute function private.on_story_media();

create or replace function private.on_avatar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.avatar_url is distinct from old.avatar_url and new.avatar_url is not null and current_setting('unimate.system', true) is distinct from 'on' then
    perform private.mod_image('avatar', new.id::text);
  end if;
  return null;
end $$;
drop trigger if exists profiles_moderate_avatar on profiles;
create trigger profiles_moderate_avatar after update of avatar_url on profiles for each row execute function private.on_avatar();

-- the edge function checks the caller's secret against the one stored here (no env secret needed)
create or replace function public.mod_secret_ok(s text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from private.push_cfg where k = 'moderate_secret' and v = s);
$$;
revoke all on function public.mod_secret_ok(text) from public, anon, authenticated;

-- the edge function (service role) tells the admins once, throttled
create or replace function public.mod_alert()
returns void language sql security definer set search_path = public as $$
  select private.admin_alert('mod-queue', 'في محتوى بانتظار المراجعة', 'افتح «فحص المحتوى» بلوحة الإدارة', '/admin/moderation') is not null;
$$;
revoke all on function public.mod_alert() from public, anon, authenticated;

-- ---------- review (admin panel) ----------
-- approve: put it back (unhide / restore the message / apply the bio / restore the photo). remove: keep it hidden.
create or replace function public.admin_moderation_review(p_id uuid, p_approve boolean, p_warn boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare q moderation_queue;
begin
  perform admin_require();
  select * into q from moderation_queue where id = p_id;
  if q.id is null then raise exception 'not found'; end if;
  perform set_config('unimate.system', 'on', true);
  if p_approve then
    case q.target_type
      when 'post' then update posts set is_hidden = false where id = q.target_id::uuid;
      when 'comment' then update comments set is_hidden = false where id = q.target_id::uuid;
      when 'story' then update stories set is_hidden = false where id = q.target_id::uuid;
      when 'message' then update messages set deleted_at = null where id = q.target_id::uuid;
      when 'bio' then update profiles set bio = q.excerpt where id = q.target_id::uuid;
      when 'avatar' then update profiles set avatar_url = q.media_url where id = q.target_id::uuid;
      when 'post_media' then update posts set is_hidden = false where id = (select post_id from post_media where id = q.target_id::uuid);
      else null;
    end case;
  elsif p_warn and q.author_id is not null then
    insert into notifications(user_id, kind, title, body)
    values (q.author_id, 'moderation', 'شلنا محتوى إلك', 'المحتوى ما بيناسب قوانين يونيميت. إذا تكرر ممكن يتوقف حسابك.');
  end if;
  perform set_config('unimate.system', 'off', true);
  update moderation_queue set status = case when p_approve then 'approved' else 'removed' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform admin_log(case when p_approve then 'moderation_approve' else 'moderation_remove' end, q.target_type, q.target_id, jsonb_build_object('warned', p_warn));
end $$;
grant execute on function public.admin_moderation_review(uuid, boolean, boolean) to authenticated;

-- ---------- starting word list (normalized; admins can add more) ----------
insert into moderation_words(word)
select private.mod_norm(w) from unnest(array[
  -- Arabic / Jordanian
  'شرموط', 'شرموطه', 'شراميط', 'قحبه', 'قحاب', 'منيك', 'منيوك', 'منايك', 'نيك', 'نياك', 'متناك', 'انيكك', 'بنيكك',
  'كس', 'كسك', 'كسها', 'كسمك', 'كس امك', 'كس اختك', 'كس امها', 'زب', 'زبي', 'زبك', 'طيز', 'طيزك',
  'عرص', 'عرصه', 'معرص', 'خول', 'لوطي', 'عاهره', 'سكس', 'بورن', 'سحاق',
  'ابن الشرموطه', 'ابن القحبه', 'يلعن ابوك', 'يلعن امك', 'يلعن دينك', 'تفو عليك',
  -- English
  'fuck', 'fucking', 'fucker', 'motherfucker', 'shit', 'bitch', 'bitches', 'whore', 'slut', 'pussy', 'dick',
  'cock', 'porn', 'porno', 'nudes', 'asshole', 'bastard', 'nigger', 'nigga', 'faggot', 'retard'
]) w
on conflict do nothing;
