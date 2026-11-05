-- Admins can remove a user's Instagram / Snapchat handles: from the profile icons and from the bio
-- (links, "@name", "insta: name", "سناب: name"…). Optionally stop them adding new ones. Logged; the user is told.

create table if not exists private.socials_blocked (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  blocked_by uuid,
  created_at timestamptz not null default now()
);

-- text without social handles / links
create or replace function private.strip_socials(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
    -- links to instagram / snapchat / tiktok
    '(https?://)?(www\.)?(instagram\.com|instagr\.am|snapchat\.com|tiktok\.com)/[^\s]*', '', 'gi'),
    -- "insta: name", "snap - name" (English words need a separator, so normal sentences stay) and "انستا name" / "سناب: name"
    '(\m(instagram|insta|ig|snapchat|snap|sc|tiktok)\s*([:：\-–—=]\s*@?|@)|(انستغرام|انستقرام|انستا|إنستا|سناب شات|سناب|تيك توك)\s*[:：\-–—=]?\s*@?)[A-Za-z0-9._\-]{2,30}', '', 'gi'),
    -- any @handle
    '@[A-Za-z0-9._]{2,30}', '', 'g'),
    -- leftover icons often put next to handles
    '(📸|👻|📷)', '', 'g'),
    '[ \t]{2,}', ' ', 'g')), '');
$$;

-- after removing handles: drop dangling separators ("… |", "و" left alone at the end)
create or replace function private.strip_socials_clean(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(coalesce(p, ''),
    '(\s*[|•·,/\-–—]+\s*)+$', '', 'g'),
    '^(\s*[|•·,/\-–—]+\s*)+', '', 'g'),
    '(^|\s)و\s*$', '', 'g')), '');
$$;

create or replace function public.admin_clear_socials(p_user uuid, p_block boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare had_ig text; had_sc text; old_bio text; new_bio text;
begin
  perform admin_require();
  select instagram, snapchat into had_ig, had_sc from private.profile_socials where user_id = p_user;
  select bio into old_bio from profiles where id = p_user;
  if not found then raise exception 'not found'; end if;
  new_bio := coalesce(private.strip_socials_clean(private.strip_socials(old_bio)), '');
  update private.profile_socials set instagram = null, snapchat = null, updated_at = now() where user_id = p_user;
  perform set_config('unimate.system', 'on', true);
  update profiles set bio = new_bio, instagram = null, snapchat = null where id = p_user and (bio is distinct from new_bio or instagram is not null or snapchat is not null);
  if p_block then
    insert into private.socials_blocked(user_id, blocked_by) values (p_user, auth.uid()) on conflict (user_id) do nothing;
  else
    delete from private.socials_blocked where user_id = p_user;
  end if;
  insert into notifications(user_id, kind, title, body)
  values (p_user, 'system', 'انشالت حسابات التواصل من بروفايلك',
          case when p_block then 'شلنا حسابات إنستغرام وسناب من بروفايلك لأنها مخالفة لشروط الاستخدام، وما بتقدر تضيفها من جديد. للاستفسار تواصل مع الدعم.'
               else 'شلنا حسابات إنستغرام وسناب من بروفايلك لأنها مخالفة لشروط الاستخدام.' end);
  perform set_config('unimate.system', 'off', true);
  perform admin_log('clear_socials', 'user', p_user::text,
    jsonb_build_object('instagram', had_ig, 'snapchat', had_sc, 'bio_before', old_bio, 'blocked', p_block));
  return jsonb_build_object('bio', new_bio, 'had_instagram', had_ig is not null, 'had_snapchat', had_sc is not null, 'bio_changed', old_bio is distinct from new_bio);
end $$;

create or replace function public.admin_unblock_socials(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform admin_require();
  delete from private.socials_blocked where user_id = p_user;
  perform admin_log('unblock_socials', 'user', p_user::text, '{}'::jsonb);
end $$;

create or replace function public.admin_socials_state(p_user uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when is_admin() then jsonb_build_object(
    'instagram', (select instagram from private.profile_socials where user_id = p_user),
    'snapchat', (select snapchat from private.profile_socials where user_id = p_user),
    'blocked', exists (select 1 from private.socials_blocked where user_id = p_user)) end;
$$;

-- a blocked user can't put handles back: not in the icons, not in the bio
create or replace function public.set_my_socials(p_instagram text, p_snapchat text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from private.socials_blocked where user_id = auth.uid())
     and (nullif(trim(p_instagram), '') is not null or nullif(trim(p_snapchat), '') is not null) then
    raise exception 'socials_blocked' using errcode = 'P0001';
  end if;
  insert into private.profile_socials(user_id, instagram, snapchat) values (auth.uid(), nullif(trim(p_instagram), ''), nullif(trim(p_snapchat), ''))
  on conflict (user_id) do update set instagram = excluded.instagram, snapchat = excluded.snapchat, updated_at = now();
end $$;

create or replace function private.profiles_socials_capture()
returns trigger language plpgsql security definer set search_path = public as $$
declare blocked boolean := exists (select 1 from private.socials_blocked where user_id = new.id);
begin
  if new.instagram is not null or new.snapchat is not null then
    if not blocked then
      insert into private.profile_socials(user_id, instagram, snapchat) values (new.id, new.instagram, new.snapchat)
      on conflict (user_id) do update set
        instagram = coalesce(excluded.instagram, private.profile_socials.instagram),
        snapchat = coalesce(excluded.snapchat, private.profile_socials.snapchat), updated_at = now();
    end if;
    new.instagram := null; new.snapchat := null;
  end if;
  return new;
end $$;

create or replace function private.profiles_bio_socials_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.bio is distinct from old.bio and current_setting('unimate.system', true) is distinct from 'on'
     and exists (select 1 from private.socials_blocked where user_id = new.id) then
    new.bio := coalesce(private.strip_socials_clean(private.strip_socials(new.bio)), '');
  end if;
  return new;
end $$;
drop trigger if exists profiles_bio_socials_guard on public.profiles;
create trigger profiles_bio_socials_guard before update of bio on public.profiles
  for each row execute function private.profiles_bio_socials_guard();

revoke all on function public.admin_clear_socials(uuid, boolean), public.admin_unblock_socials(uuid), public.admin_socials_state(uuid) from public, anon;
grant execute on function public.admin_clear_socials(uuid, boolean), public.admin_unblock_socials(uuid), public.admin_socials_state(uuid) to authenticated;
revoke all on function public.set_my_socials(text, text) from public, anon;
grant execute on function public.set_my_socials(text, text) to authenticated;
