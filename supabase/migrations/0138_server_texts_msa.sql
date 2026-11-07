-- UniMate · 0138 the server's own words in Modern Standard Arabic
--
-- The app now speaks فصحى everywhere, so the texts the database writes for people (notifications, the grey lines in a
-- chat, alerts to the admins) follow it. Only the wording changes; every function keeps its logic, arguments and
-- grants. Old rows keep the words they were written with.

CREATE OR REPLACE FUNCTION private.first_name(uid uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select coalesce(nullif(split_part(full_name, ' ', 1), ''), 'أحدهم') from profiles where id = uid;
$function$;

CREATE OR REPLACE FUNCTION private.health_check()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare bad int;
begin
  select count(*) into bad from net._http_response
   where created > now() - interval '10 minutes'
     and (timed_out or error_msg is not null or status_code is null or status_code >= 400);
  if bad >= 3 then
    perform private.admin_alert('health-functions', 'خلل في الخادم: ' || bad || ' طلبات فشلت خلال آخر 10 دقائق',
      'قد لا تعمل الإشعارات أو فحص المحتوى. راجع سجل الأخطاء.');
  end if;
exception when others then null;
end $function$;

CREATE OR REPLACE FUNCTION private.mod_message()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare h text; n int; dur interval;
begin
  if new.kind <> 'text' or new.body is null then return new; end if;
  if not exists (select 1 from conversations c where c.id = new.conversation_id and c.kind in ('group', 'community')) then return new; end if;
  h := private.mod_hits_chat(new.body);
  if h is null then return new; end if;
  new.deleted_at := now();
  -- platform admins are never muted, but their message is still hidden
  if exists (select 1 from admins a where a.user_id = new.sender_id) then return new; end if;
  insert into chat_strikes(user_id, conversation_id, word) values (new.sender_id, new.conversation_id, left(h, 200));
  select count(*) into n from chat_strikes where user_id = new.sender_id;
  dur := private.mute_for(n);
  insert into chat_mutes(user_id, until, level, updated_at) values (new.sender_id, now() + dur, least((n - 1) / 3, 8), now())
  on conflict (user_id) do update set until = greatest(chat_mutes.until, excluded.until), level = excluded.level, updated_at = now();
  if n > 24 then
    insert into moderation_queue(target_type, target_id, author_id, reason, matched, excerpt)
    values ('message', new.id::text, new.sender_id, 'words', 'مستخدم يتكرر منه السبّ (' || n || ' مرة)', left(new.body, 500));
    perform private.admin_alert('chat-repeat-' || new.sender_id, 'مستخدم يتكرر منه السبّ', 'بلغ ' || n || ' مخالفة في المجموعات. افتح «فحص المحتوى».', '/admin/moderation');
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION private.mod_queue(p_type text, p_id text, p_author uuid, p_reason text, p_matched text, p_excerpt text, p_media text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into moderation_queue(target_type, target_id, author_id, reason, matched, excerpt, media_url)
  values (p_type, p_id, p_author, p_reason, left(p_matched, 200), left(p_excerpt, 500), p_media);
  perform private.admin_alert('mod-queue', 'يوجد محتوى بانتظار المراجعة', 'افتح «فحص المحتوى» في لوحة الإدارة', '/admin/moderation');
exception when others then null;
end $function$;

CREATE OR REPLACE FUNCTION private.promote_section_event(p_section uuid, p_kind event_kind, p_day date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare off uuid; n int; q int := private.section_quorum(p_section); at timestamptz; ttl text; loc text; fresh boolean := false;
begin
  if not private.section_known((select section_no from sections where id = p_section)) then return null; end if;
  select id, starts_at into off, at from academic_events
  where section_id = p_section and owner_id is null and kind = p_kind and (starts_at at time zone 'Asia/Amman')::date = p_day
  order by created_at limit 1;
  select count(distinct owner_id) into n from private.agreeing_asks(p_section, p_kind, p_day, at);
  if off is not null and n = 0 then return off; end if;
  if off is null and n < q then return null; end if;

  perform set_config('unimate.system', 'on', true);
  if off is null then
    select starts_at into at from private.agreeing_asks(p_section, p_kind, p_day) group by starts_at order by count(*) desc, starts_at limit 1;
    select title into ttl from private.agreeing_asks(p_section, p_kind, p_day) group by title order by count(*) desc, min(created_at) limit 1;
    select location into loc from private.agreeing_asks(p_section, p_kind, p_day) where location is not null group by location order by count(*) desc limit 1;
    insert into academic_events(section_id, owner_id, kind, title, starts_at, location, created_by, confirmations, source)
    values (p_section, null, p_kind, ttl, at, loc, null, 0, 'crowd') returning id into off;
    fresh := true;
  end if;
  -- only the copies that agree are folded in; a copy at another time stays its owner's own
  update reminders r set event_id = off
  from private.agreeing_asks(p_section, p_kind, p_day, at) a
  where r.event_id = a.id and not exists (select 1 from reminders x where x.user_id = r.user_id and x.event_id = off);
  update academic_events set merged_into = off
  where id in (select id from private.agreeing_asks(p_section, p_kind, p_day, at)) and id <> off;
  update academic_events set confirmations = (select count(distinct owner_id) from academic_events where merged_into = off) where id = off;
  if fresh then
    insert into notifications(user_id, kind, title, body, data)
    select e.user_id, 'section_event', 'أضاف زملاؤك موعدًا لشعبتك 📌',
           ttl || ' · ' || to_char(at at time zone 'Asia/Amman', 'DD/MM HH24:MI') || ' · غير رسمي بعد', jsonb_build_object('event_id', off)
    from enrollments e
    where e.section_id = p_section and not exists (select 1 from academic_events a where a.merged_into = off and a.owner_id = e.user_id);
  end if;
  perform set_config('unimate.system', 'off', true);
  return off;
end $function$;

CREATE OR REPLACE FUNCTION public.admin_clear_socials(p_user uuid, p_block boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare had_ig text; had_sc text; old_bio text; new_bio text;
begin
  perform admin_require();
  select instagram, snapchat into had_ig, had_sc from private.profile_socials where user_id = p_user;
  select bio into old_bio from profiles where id = p_user;
  if not found then raise exception 'not found'; end if;
  new_bio := coalesce(private.strip_socials_clean(private.strip_socials(old_bio)), '');
  update private.profile_socials set instagram = null, snapchat = null, updated_at = now() where user_id = p_user;
  perform set_config('unimate.system', 'on', true);
  update profiles set bio = new_bio, instagram = null, snapchat = null
  where id = p_user and (bio is distinct from new_bio or instagram is not null or snapchat is not null);
  delete from private.socials_blocked where user_id = p_user;
  if had_ig is not null or had_sc is not null or old_bio is distinct from new_bio then
    insert into notifications(user_id, kind, title, body)
    values (p_user, 'system', 'أزلنا حسابات التواصل من ملفك الشخصي',
            'أزلنا حسابَي إنستغرام وسناب شات من ملفك الشخصي حفاظًا على خصوصيتك. يمكنك إضافتهما مجددًا في أي وقت من تعديل الملف الشخصي.');
  end if;
  perform set_config('unimate.system', 'off', true);
  perform admin_log('clear_socials', 'user', p_user::text,
    jsonb_build_object('instagram', had_ig, 'snapchat', had_sc, 'bio_before', old_bio));
  return jsonb_build_object('bio', new_bio, 'had_instagram', had_ig is not null, 'had_snapchat', had_sc is not null, 'bio_changed', old_bio is distinct from new_bio);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_moderation_review(p_id uuid, p_approve boolean, p_warn boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    values (q.author_id, 'moderation', 'أزلنا محتوى نشرته', 'هذا المحتوى يخالف قواعد يونيميت، وقد يُوقَف حسابك إذا تكرر ذلك.');
  end if;
  perform set_config('unimate.system', 'off', true);
  update moderation_queue set status = case when p_approve then 'approved' else 'removed' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform admin_log(case when p_approve then 'moderation_approve' else 'moderation_remove' end, q.target_type, q.target_id, jsonb_build_object('warned', p_warn));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_review_title(p_request uuid, p_approve boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r title_requests;
begin
  perform admin_require();
  select * into r from title_requests where id = p_request and status = 'pending';
  if r.id is null then raise exception 'not pending'; end if;
  update title_requests set status = case when p_approve then 'approved' else 'rejected' end, reviewed_by = auth.uid(), reviewed_at = now() where id = p_request;
  if p_approve then
    perform set_config('unimate.system', 'on', true);
    update profiles set academic_title = r.title, title_verified = true,
      is_verified = is_verified or private.is_vip_title(r.title),
      account_type = case when r.title = 'staff' then 'staff' else 'faculty' end,
      department = coalesce(r.department, department),
      position_title = coalesce(r.position, position_title),
      title_source = 'request'
    where id = r.user_id;
    insert into notifications(user_id, kind, title, body)
    values (r.user_id, 'title_verified', 'تم توثيق حسابك كـ ' || coalesce(r.position, title_label(r.title)), 'أصبح اللقب ظاهرًا على حسابك للجميع.');
  else
    insert into notifications(user_id, kind, title, body) values (r.user_id, 'title_rejected', 'تعذّر توثيق اللقب', 'تواصل مع الدعم إذا أردت إرسال إثبات.');
  end if;
  perform admin_log(case when p_approve then 'approve_title' else 'reject_title' end, 'user', r.user_id::text, jsonb_build_object('title', r.title, 'position', r.position));
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_blue_check(p_user uuid, p_on boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform owner_require();
  if not exists (select 1 from profiles where id = p_user) then raise exception 'not found'; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set blue_off = not p_on, is_verified = p_on, blue_manual = p_on, lapsed_blue = false where id = p_user;
  if p_on then
    insert into notifications(user_id, kind, title, body)
    values (p_user, 'system', 'أصبح حسابك موثّقًا ✓', 'أُضيفت العلامة الزرقاء إلى حسابك في يونيميت.');
  end if;
  perform set_config('unimate.system', 'off', true);
  perform admin_log(case when p_on then 'blue_check_on' else 'blue_check_off' end, 'user', p_user::text, '{}'::jsonb);
end $function$;

CREATE OR REPLACE FUNCTION public.admin_set_title(p_user uuid, p_title text, p_type text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform owner_require();
  perform set_config('unimate.system', 'on', true);
  update profiles set
    academic_title = p_title,
    title_verified = p_title is not null,
    lapsed_title = false,
    title_source = case when p_title is null then null else 'owner' end,
    position_title = case when p_title is null then null else position_title end,
    is_verified = blue_manual or coalesce(private.is_vip_title(p_title), false),
    account_type = coalesce(p_type, case when p_title is null or p_title in ('founder', 'team') then account_type when p_title = 'staff' then 'staff' else 'faculty' end)
  where id = p_user;
  perform admin_log(case when p_title is null then 'remove_title' else 'set_title' end, 'user', p_user::text, jsonb_build_object('title', p_title, 'type', p_type));
  if p_title is not null then
    insert into notifications(user_id, kind, title, body) values (p_user, 'title_verified', 'تم توثيق حسابك كـ ' || title_label(p_title), 'أصبح اللقب ظاهرًا على حسابك للجميع.');
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.answer_ride_request(p_request uuid, p_accept boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q ride_requests; r rides;
begin
  select * into q from ride_requests where id = p_request for update;
  if q.id is null then raise exception 'not found'; end if;
  select * into r from rides where id = q.ride_id for update;          -- locks the ride: seats can't be double-booked
  if r.driver_id <> auth.uid() then raise exception 'not allowed'; end if;
  if q.status <> 'pending' or r.status <> 'open' then raise exception 'not_pending'; end if;
  if p_accept then
    if r.seats_taken + q.seats > r.seats_total then raise exception 'no_seats'; end if;
    update rides set seats_taken = seats_taken + q.seats where id = r.id;
  end if;
  update ride_requests set status = case when p_accept then 'accepted' else 'declined' end, decided_at = now() where id = p_request;
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  values (q.rider_id, 'ride', r.driver_id,
          case when p_accept and r.kind = 'need' then 'قُبل عرضك، ستوصله أنت 🚗' when p_accept then 'قُبل طلبك في التوصيلة 🚗'
               when r.kind = 'need' then 'وجد من يوصله' else 'لم يُقبل طلبك في التوصيلة' end,
          r.area || ' · ' || to_char(r.depart_at at time zone 'Asia/Amman', 'Dy HH24:MI'), jsonb_build_object('ride_id', r.id));
  -- a need is settled once someone is accepted: tell the others politely
  if p_accept and r.kind = 'need' then
    insert into notifications(user_id, kind, actor_id, title, body, data)
    select o.rider_id, 'ride', r.driver_id, 'وجد من يوصله', r.area, jsonb_build_object('ride_id', r.id)
    from ride_requests o where o.ride_id = r.id and o.status = 'pending' and o.id <> q.id;
    update ride_requests set status = 'declined', decided_at = now() where ride_id = r.id and status = 'pending' and id <> q.id;
  end if;
  perform set_config('unimate.system', 'off', true);
end $function$;

CREATE OR REPLACE FUNCTION public.cancel_ride(p_ride uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r rides;
begin
  select * into r from rides where id = p_ride for update;
  if r.id is null or (r.driver_id <> auth.uid() and not is_admin()) then raise exception 'not allowed'; end if;
  update rides set status = 'cancelled' where id = p_ride;
  -- tell everyone who had a seat or was waiting
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  select q.rider_id, 'ride', r.driver_id, 'أُلغيت التوصيلة', r.area || ' · ' || to_char(r.depart_at at time zone 'Asia/Amman', 'HH24:MI'), jsonb_build_object('ride_id', r.id)
  from ride_requests q where q.ride_id = p_ride and q.status in ('pending', 'accepted');
  update ride_requests set status = 'cancelled', decided_at = now() where ride_id = p_ride and status in ('pending', 'accepted');
  perform set_config('unimate.system', 'off', true);
  if r.driver_id <> auth.uid() then perform admin_log('cancel_ride', 'ride', p_ride::text, '{}'::jsonb); end if;
end $function$;

CREATE OR REPLACE FUNCTION public.create_group(title text, members uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  insert into messages(conversation_id, sender_id, kind, body) values (conv, me, 'system', 'أُنشئت المجموعة');
  perform set_config('unimate.system', 'off', true);
  return conv;
end $function$;

CREATE OR REPLACE FUNCTION public.find_swap_match()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare other swap_requests;
begin
  select * into other from swap_requests
  where status = 'open' and course_id = new.course_id
    and from_section_id = new.to_section_id and to_section_id = new.from_section_id
    and user_id <> new.user_id and not is_blocked_between(user_id, new.user_id)
  order by created_at limit 1;
  if other.id is not null then
    new.status := 'matched'; new.matched_with := other.id;
    update swap_requests set status = 'matched', matched_with = new.id where id = other.id;
    insert into notifications(user_id, kind, actor_id, title, body, data) values
      (other.user_id, 'swap_match', new.user_id, 'وجدنا تبديلًا مطابقًا', 'هناك من يريد التبديل نفسه بالعكس', jsonb_build_object('swap_id', other.id)),
      (new.user_id, 'swap_match', other.user_id, 'وجدنا تبديلًا مطابقًا', 'هناك من يريد التبديل نفسه بالعكس', jsonb_build_object('swap_id', new.id));
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.group_add_members(conv uuid, uids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if n > 0 then perform private.sys_line(conv, private.first_name(me) || ' أضاف ' || n || ' إلى المجموعة'); end if;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.group_join(p_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if not c.approve_joins then perform private.sys_line(c.id, private.first_name(me) || ' انضم إلى المجموعة عبر الرابط'); end if;
  return c.id;
end $function$;

CREATE OR REPLACE FUNCTION public.group_leave(conv uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform private.sys_line(conv, private.first_name(me) || ' غادر المجموعة');
end $function$;

CREATE OR REPLACE FUNCTION public.group_remove_member(conv uuid, uid uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform private.sys_line(conv, private.first_name(auth.uid()) || ' أزال ' || private.first_name(uid) || ' من المجموعة');
end $function$;

CREATE OR REPLACE FUNCTION public.group_set_role(conv uuid, uid uuid, p_role text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  perform private.sys_line(conv, private.first_name(uid) || case when p_role = 'admin' then ' أصبح مشرفًا في المجموعة' else ' لم يعد مشرفًا' end);
end $function$;

CREATE OR REPLACE FUNCTION public.group_update(conv uuid, p_title text DEFAULT NULL::text, p_photo text DEFAULT NULL::text, p_clear_photo boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.can_manage_conv(conv) then raise exception 'admins_only'; end if;
  if p_title is not null and char_length(trim(p_title)) < 2 then raise exception 'title required'; end if;
  perform set_config('unimate.system', 'on', true);
  update conversations set
    title = coalesce(left(nullif(trim(p_title), ''), 60), title),
    photo_url = case when p_clear_photo then null else coalesce(p_photo, photo_url) end
  where id = conv;
  perform set_config('unimate.system', 'off', true);
  if p_title is not null then perform private.sys_line(conv, private.first_name(auth.uid()) || ' غيّر اسم المجموعة إلى «' || left(trim(p_title), 60) || '»'); end if;
  if p_photo is not null or p_clear_photo then perform private.sys_line(conv, private.first_name(auth.uid()) || ' غيّر صورة المجموعة'); end if;
end $function$;

CREATE OR REPLACE FUNCTION public.leave_ride(p_ride uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare q ride_requests; r rides;
begin
  select * into q from ride_requests where ride_id = p_ride and rider_id = auth.uid() for update;
  if q.id is null or q.status not in ('pending', 'accepted') then raise exception 'not found'; end if;
  select * into r from rides where id = p_ride for update;
  if q.status = 'accepted' then update rides set seats_taken = greatest(0, seats_taken - q.seats) where id = p_ride; end if;
  update ride_requests set status = 'cancelled', decided_at = now() where id = q.id;
  if q.status = 'accepted' then
    perform set_config('unimate.system', 'on', true);
    insert into notifications(user_id, kind, actor_id, title, body, data)
    values (r.driver_id, 'ride', auth.uid(), 'ألغى أحدهم مقعده في توصيلتك', r.area, jsonb_build_object('ride_id', r.id));
    perform set_config('unimate.system', 'off', true);
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.mod_alert()
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select private.admin_alert('mod-queue', 'يوجد محتوى بانتظار المراجعة', 'افتح «فحص المحتوى» في لوحة الإدارة', '/admin/moderation') is not null;
$function$;

CREATE OR REPLACE FUNCTION public.notify_social()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare target uuid; actor uuid; who text; pid uuid;
begin
  if tg_table_name = 'post_likes' then
    select author_id into target from posts where id = new.post_id; actor := new.user_id; pid := new.post_id;
    if target is null or target = actor or not wants_social(target) then return new; end if;
    -- one like notification per post per hour, so a viral post doesn't flood
    if exists (select 1 from notifications where user_id = target and kind = 'like' and data->>'post_id' = pid::text and created_at > now() - interval '1 hour') then return new; end if;
    select full_name into who from profiles where id = actor;
    insert into notifications(user_id, kind, actor_id, title, data) values (target, 'like', actor, coalesce(who, 'أحدهم') || ' أُعجب بمنشورك', jsonb_build_object('post_id', pid));
  elsif tg_table_name = 'comments' then
    select author_id into target from posts where id = new.post_id; actor := new.author_id; pid := new.post_id;
    if target is null or target = actor or not wants_social(target) then return new; end if;
    select full_name into who from profiles where id = actor;
    insert into notifications(user_id, kind, actor_id, title, body, data) values (target, 'comment', actor, coalesce(who, 'أحدهم') || ' علّق على منشورك', left(new.body, 80), jsonb_build_object('post_id', pid));
  elsif tg_table_name = 'follows' then
    target := new.followee_id; actor := new.follower_id;
    if not wants_social(target) then return new; end if;
    select full_name into who from profiles where id = actor;
    if tg_op = 'INSERT' and new.status = 'accepted' then
      insert into notifications(user_id, kind, actor_id, title, data) values (target, 'follow', actor, coalesce(who, 'أحدهم') || ' بدأ بمتابعتك', jsonb_build_object('user_id', actor));
    elsif tg_op = 'UPDATE' and old.status = 'pending' and new.status = 'accepted' then
      select full_name into who from profiles where id = target;
      insert into notifications(user_id, kind, actor_id, title, data) values (actor, 'follow', target, coalesce(who, 'أحدهم') || ' قبل طلب متابعتك', jsonb_build_object('user_id', target));
    end if;
    -- pending requests show in the requests list on the notifications screen, no extra row
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.pin_message(p_message uuid, p_pin boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  m messages;
  k conversation_kind;
  who text;
begin
  select * into m from messages where id = p_message and deleted_at is null;
  if m.id is null or not is_member(m.conversation_id) then raise exception 'not_found' using errcode = 'P0002'; end if;
  if m.kind = 'system' then raise exception 'not_pinnable' using errcode = 'P0001'; end if;
  select kind into k from conversations where id = m.conversation_id;
  if k <> 'direct' and not can_manage_conv(m.conversation_id, auth.uid()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_pin = (m.pinned_at is not null) then return; end if;
  if p_pin and (select count(*) from messages
                where conversation_id = m.conversation_id and pinned_at is not null and deleted_at is null) >= 3 then
    raise exception 'pin_limit' using errcode = 'P0001';
  end if;

  perform set_config('unimate.system', 'on', true);
  update messages
     set pinned_at = case when p_pin then now() end,
         pinned_by = case when p_pin then auth.uid() end,
         is_saved  = is_saved or p_pin
   where id = m.id;
  select split_part(full_name, ' ', 1) into who from profiles where id = auth.uid();
  insert into messages (conversation_id, sender_id, kind, body)
  values (m.conversation_id, auth.uid(), 'system',
          coalesce(who, '') || case when p_pin then ' ثبّت رسالة' else ' ألغى تثبيت رسالة' end);
  perform set_config('unimate.system', 'off', true);
end $function$;

CREATE OR REPLACE FUNCTION public.report_screenshot(conv uuid, plat text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text;
begin
  if not is_member(conv) then raise exception 'not a member'; end if;
  insert into screenshot_events(conversation_id, user_id, platform) values (conv, auth.uid(), plat);
  select full_name into who from profiles where id = auth.uid();
  insert into messages(conversation_id, sender_id, kind, body) values (conv, null, 'system', who || ' التقط لقطة شاشة');
end $function$;

CREATE OR REPLACE FUNCTION public.request_ride(p_ride uuid, p_seats integer DEFAULT 1, p_note text DEFAULT NULL::text, p_phone text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r rides; qid uuid; n int; seats int;
begin
  if auth.uid() is null or not is_active_user() then raise exception 'not allowed'; end if;
  select * into r from rides where id = p_ride;
  if r.id is null or r.status <> 'open' or r.depart_at < now() or r.university_id is distinct from my_university()
     or is_blocked_between(auth.uid(), r.driver_id) then raise exception 'not_available'; end if;
  if r.driver_id = auth.uid() then raise exception 'own_ride'; end if;
  -- a need is answered by one driver who takes everyone on it
  seats := case when r.kind = 'need' then r.seats_total else p_seats end;
  if r.kind = 'need' then
    if r.seats_taken > 0 then raise exception 'no_seats'; end if;
  elsif p_seats < 1 or p_seats > least(3, r.seats_total - r.seats_taken) then raise exception 'no_seats'; end if;
  select count(*) into n from ride_requests where rider_id = auth.uid() and created_at > now() - interval '1 day';
  if n >= 15 then raise exception 'rate_limited' using errcode = 'P0001'; end if;
  insert into ride_requests(ride_id, rider_id, seats, note) values (p_ride, auth.uid(), seats, nullif(btrim(p_note), ''))
  on conflict (ride_id, rider_id) do update set seats = excluded.seats, note = excluded.note, status = 'pending', created_at = now(), decided_at = null
    where ride_requests.status = 'cancelled'
  returning id into qid;
  if qid is null then raise exception 'already_requested'; end if;
  perform private.save_ride_phone(p_ride, p_phone);
  perform set_config('unimate.system', 'on', true);
  insert into notifications(user_id, kind, actor_id, title, body, data)
  values (r.driver_id, 'ride', auth.uid(),
          case when r.kind = 'need' then 'أحدهم يعرض أن يوصلك 🚗' else 'طلب مقعد في توصيلتك' end,
          (select full_name from profiles where id = auth.uid()) || case when r.kind = 'need' then ' · ' else ' يريد ' || seats || ' مقعد · ' end || r.area,
          jsonb_build_object('ride_id', r.id));
  perform set_config('unimate.system', 'off', true);
  return qid;
end $function$;

CREATE OR REPLACE FUNCTION public.set_conversation_vanish(conv uuid, mode vanish_mode)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    when 'never' then 'الرسائل لا تختفي'
    when 'after_view' then 'تختفي الرسائل بعد مشاهدتها'
    when 'h24' then 'تختفي الرسائل بعد 24 ساعة'
    else 'تختفي الرسائل بعد أسبوع' end);
  perform set_config('unimate.system', 'off', true);
end $function$
;
