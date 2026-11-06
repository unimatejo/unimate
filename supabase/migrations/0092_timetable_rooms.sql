-- UniMate · 0092 timetable rooms and kinds.
-- The registration page puts notes ("المادة تدرس بشكل مدمج في منصة مايكروسوفت تيمز", "عن بعد") in the room column.
-- Those notes were saved as if they were rooms, and a blended class was saved as a plain lecture.
-- Now: a note is never a room (it sets the kind), a later report can fill in or correct a room, and re-reading a
-- timetable updates my own times instead of being ignored.

create or replace function private.room_note_kind(t text) returns text language sql immutable set search_path = '' as $$
  select case
    when t is null then null
    when t ~* '(مدمج|blended|hybrid)' then 'blended'
    when t ~* '(عن بعد|عن ب|اونلاين|أونلاين|الكتروني بالكامل|online|remote)' then 'online'
    else null end
$$;

-- a room column that only holds a note (no building or room number in it)
create or replace function private.is_room_note(t text) returns boolean language sql immutable set search_path = '' as $$
  select t is not null and (
    trim(t) in ('المادة', 'مدمج', 'عن بعد', 'online', 'Online', 'teams', 'Teams')
    or (t ~* '(تدرس|منصة|مايكروسوفت|microsoft|teams|عن بعد|مدمج)' and t !~ '(قاع|مبنى|مجمع|مختبر|ح\.ب|[0-9]{2,})')
  )
$$;

create or replace function public.report_meeting(sec uuid, wd smallint, st time, en time, k meeting_kind, room text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); r text := nullif(trim(room), ''); kk meeting_kind := k;
begin
  if not exists (select 1 from enrollments where user_id = me and section_id = sec) then raise exception 'not enrolled'; end if;
  if en <= st then raise exception 'bad time'; end if;
  -- a note in the room column tells the kind, it isn't a room
  if r is not null and private.room_note_kind(r) is not null and kk in ('lecture') then kk := private.room_note_kind(r)::meeting_kind; end if;
  if private.is_room_note(r) then r := null; end if;
  -- my own report: a new reading of my timetable replaces the old one
  insert into meeting_reports(section_id, user_id, weekday, starts_at, ends_at, room_text, kind)
  values (sec, me, wd, st, en, r, kk)
  on conflict (section_id, user_id, weekday, starts_at) do update
    set ends_at = excluded.ends_at, kind = excluded.kind, room_text = coalesce(excluded.room_text, meeting_reports.room_text);
  if not exists (select 1 from section_meetings where section_id = sec and weekday = wd and starts_at = st) then
    insert into section_meetings(section_id, kind, weekday, starts_at, ends_at, room_text, source, confirmations)
    values (sec, kk, wd, st, en, r, 'crowd', 1);
  else
    -- the shared time gets a real room when it had none (or only a note), and its kind when it was a plain lecture
    update section_meetings set
      room_text = case when r is not null and room_id is null and (room_text is null or private.is_room_note(room_text)) then r else room_text end,
      kind = case when kind = 'lecture' and kk <> 'lecture' then kk else kind end
    where section_id = sec and weekday = wd and starts_at = st;
  end if;
end $$;

-- clean what is already saved: notes out of the room field, and the kind they describe
select set_config('unimate.system', 'on', true);
update section_meetings set kind = private.room_note_kind(room_text)::meeting_kind
  where kind = 'lecture' and private.room_note_kind(room_text) is not null;
update section_meetings set room_text = null where private.is_room_note(room_text);
update meeting_reports set kind = private.room_note_kind(room_text)::meeting_kind
  where kind = 'lecture' and private.room_note_kind(room_text) is not null;
update meeting_reports set room_text = null where private.is_room_note(room_text);
