-- UniMate · 0101 "غير": wherever the app offers quick picks, people can also type their own.
-- 1) A faculty title request can carry the full official position ("عميد شؤون الطلبة"); approving it shows that wording.
-- 2) Study-buddy place / time are free text now, so they get the same length limits as everything else.

alter table title_requests add column if not exists position text;
alter table title_requests drop constraint if exists title_requests_position_check;
alter table title_requests add constraint title_requests_position_check check (position is null or char_length(position) <= 80);

drop function if exists public.request_title(text, text, text);
create or replace function public.request_title(p_title text, p_department text, p_note text, p_position text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.can_request_title() then raise exception 'staff_email_only'; end if;
  if p_title is null or p_title not in ('prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','vice_dean','head','staff') then
    raise exception 'title_not_allowed';
  end if;
  if exists (select 1 from title_requests where user_id = auth.uid() and status = 'pending') then raise exception 'already pending'; end if;
  insert into title_requests(user_id, title, department, note, position)
  values (auth.uid(), p_title, nullif(trim(p_department), ''), nullif(trim(p_note), ''), private.clean_position(p_position)) returning id into r;
  return r;
end $$;

create or replace function public.admin_review_title(p_request uuid, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
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
    values (r.user_id, 'title_verified', 'تم توثيق حسابك كـ ' || coalesce(r.position, title_label(r.title)), 'صار اللقب ظاهر على حسابك للكل.');
  else
    insert into notifications(user_id, kind, title, body) values (r.user_id, 'title_rejected', 'ما قدرنا نوثّق اللقب', 'تواصل مع الدعم إذا بدك تبعتلنا إثبات.');
  end if;
  perform admin_log(case when p_approve then 'approve_title' else 'reject_title' end, 'user', r.user_id::text, jsonb_build_object('title', r.title, 'position', r.position));
end $$;

revoke all on function public.request_title(text, text, text, text) from public, anon;
grant execute on function public.request_title(text, text, text, text) to authenticated;

update study_intents set place_pref = left(place_pref, 40) where char_length(place_pref) > 40;
update study_intents set time_pref = left(time_pref, 40) where char_length(time_pref) > 40;
alter table study_intents drop constraint if exists study_intents_place_len;
alter table study_intents add constraint study_intents_place_len check (char_length(place_pref) <= 40);
alter table study_intents drop constraint if exists study_intents_time_len;
alter table study_intents add constraint study_intents_time_len check (char_length(time_pref) <= 40);
