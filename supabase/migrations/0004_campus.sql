-- UniMate · 0004 academics & campus: courses, sections, schedule, exams, reminders, map, nicknames, links, swaps

create type meeting_kind as enum ('lecture', 'lab', 'online', 'tutorial');
create type enrollment_source as enum ('microsoft', 'offerings', 'crowd', 'manual');
create type event_kind as enum ('exam_first', 'exam_second', 'exam_mid', 'exam_final', 'quiz', 'assignment', 'project', 'custom');
create type place_kind as enum ('building', 'room', 'lab', 'cafeteria', 'restaurant', 'mosque', 'library', 'parking', 'gate', 'clinic', 'bank', 'print', 'service', 'sports', 'other');
create type moderation_state as enum ('pending', 'approved', 'rejected');
create type swap_status as enum ('open', 'matched', 'closed');

-- ---------- map ----------
create table buildings (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  college_id    uuid references colleges(id) on delete set null,
  name_ar       text not null,
  name_en       text,
  code          text,
  lat           double precision,
  lng           double precision,
  floors        smallint,
  photo_url     text,
  osm_id        text,
  created_at    timestamptz not null default now()
);
create index buildings_uni_idx on buildings(university_id);

create table rooms (
  id          uuid primary key default gen_random_uuid(),
  building_id uuid not null references buildings(id) on delete cascade,
  code        text not null,
  floor       smallint,
  name        text,
  kind        place_kind not null default 'room',
  directions  text,  -- "المدخل الشرقي، الدرج على اليمين"
  unique (building_id, code)
);

create table places (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  kind          place_kind not null,
  name_ar       text not null,
  description   text,
  building_id   uuid references buildings(id) on delete set null,
  lat           double precision not null,
  lng           double precision not null,
  hours         text,
  photo_url     text,
  advertiser_id uuid,  -- fk added in 0005
  created_by    uuid references profiles(id) on delete set null,
  state         moderation_state not null default 'approved',
  created_at    timestamptz not null default now()
);
create index places_uni_idx on places(university_id, kind);
create index places_name_trgm on places using gin (name_ar gin_trgm_ops);

-- student nicknames for places ("الكراج", "درج الهندسة"); admin approves before they show
create table place_aliases (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  building_id   uuid references buildings(id) on delete cascade,
  room_id       uuid references rooms(id) on delete cascade,
  place_id      uuid references places(id) on delete cascade,
  alias         text not null check (char_length(alias) between 2 and 40),
  suggested_by  uuid references profiles(id) on delete set null,
  state         moderation_state not null default 'pending',
  created_at    timestamptz not null default now(),
  check (num_nonnulls(building_id, room_id, place_id) = 1)
);
create index place_aliases_trgm on place_aliases using gin (alias gin_trgm_ops);

create table university_links (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  kind          text not null check (kind in ('portal', 'elearning', 'teams', 'email', 'library', 'calendar', 'registration', 'phone', 'website', 'other')),
  title         text not null,
  url           text not null check (url ~ '^(https://|tel:)'),
  position      smallint not null default 0
);

-- ---------- academics ----------
create table terms (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  name          text not null,            -- "الفصل الأول 2026/2027"
  starts_on     date not null,
  ends_on       date not null,
  is_current    boolean not null default false
);
create unique index terms_one_current on terms(university_id) where is_current;

create table courses (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  major_id      uuid references majors(id) on delete set null,
  code          text not null,
  name_ar       text not null,
  name_en       text,
  credit_hours  smallint,
  unique (university_id, code)
);
create index courses_name_trgm on courses using gin (name_ar gin_trgm_ops);

create table sections (
  id            uuid primary key default gen_random_uuid(),
  course_id     uuid not null references courses(id) on delete cascade,
  term_id       uuid not null references terms(id) on delete cascade,
  section_no    text not null,
  instructor    text,
  teams_id      text,                    -- Microsoft Teams team id, used for auto-matching
  capacity      smallint,
  unique (course_id, term_id, section_no)
);

alter table communities add constraint communities_section_fk foreign key (section_id) references sections(id) on delete cascade;
create unique index communities_one_section on communities(section_id) where kind = 'course_section';

create table section_meetings (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references sections(id) on delete cascade,
  kind        meeting_kind not null default 'lecture',
  weekday     smallint not null check (weekday between 0 and 6),  -- 0 = Sunday
  starts_at   time not null,
  ends_at     time not null,
  room_id     uuid references rooms(id) on delete set null,
  online_url  text,
  source      enrollment_source not null default 'offerings',
  confirmations integer not null default 0,
  check (ends_at > starts_at)
);
create index section_meetings_section_idx on section_meetings(section_id);

create table enrollments (
  user_id    uuid not null references profiles(id) on delete cascade,
  section_id uuid not null references sections(id) on delete cascade,
  source     enrollment_source not null default 'microsoft',
  created_at timestamptz not null default now(),
  primary key (user_id, section_id)
);
create index enrollments_section_idx on enrollments(section_id);

-- crowd confirmation: the first students in a section confirm time & room, everyone else gets it filled in
create table meeting_reports (
  id         uuid primary key default gen_random_uuid(),
  section_id uuid not null references sections(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  weekday    smallint not null check (weekday between 0 and 6),
  starts_at  time not null,
  ends_at    time not null,
  room_text  text,
  room_id    uuid references rooms(id) on delete set null,
  kind       meeting_kind not null default 'lecture',
  created_at timestamptz not null default now(),
  unique (section_id, user_id, weekday, starts_at)
);

-- when 3 classmates agree on the same slot, it becomes the section's official meeting
create or replace function promote_meeting_reports()
returns trigger language plpgsql security definer set search_path = public as $$
declare agree int;
begin
  select count(*) into agree from meeting_reports
  where section_id = new.section_id and weekday = new.weekday and starts_at = new.starts_at and ends_at = new.ends_at
    and coalesce(room_id::text, room_text, '') = coalesce(new.room_id::text, new.room_text, '');
  if agree >= 3 and not exists (
    select 1 from section_meetings where section_id = new.section_id and weekday = new.weekday and starts_at = new.starts_at
  ) then
    insert into section_meetings(section_id, kind, weekday, starts_at, ends_at, room_id, source, confirmations)
    values (new.section_id, new.kind, new.weekday, new.starts_at, new.ends_at, new.room_id, 'crowd', agree);
  else
    update section_meetings set confirmations = greatest(confirmations, agree)
    where section_id = new.section_id and weekday = new.weekday and starts_at = new.starts_at;
  end if;
  return new;
end $$;
create trigger meeting_reports_promote after insert on meeting_reports for each row execute function promote_meeting_reports();

-- joining a section also joins its course group (community + group chat)
create or replace function ensure_section_community()
returns trigger language plpgsql security definer set search_path = public as $$
declare comm uuid; conv uuid; uni uuid; label text;
begin
  select c.university_id, c.name_ar || ' · شعبة ' || s.section_no into uni, label
  from sections s join courses c on c.id = s.course_id where s.id = new.section_id;

  select id into comm from communities where section_id = new.section_id and kind = 'course_section';
  if comm is null then
    insert into communities(university_id, kind, section_id, name) values (uni, 'course_section', new.section_id, label)
    returning id into comm;
  end if;
  insert into community_members(community_id, user_id) values (comm, new.user_id) on conflict do nothing;

  select id into conv from conversations where community_id = comm and kind = 'community';
  if conv is null then
    insert into conversations(kind, university_id, community_id, title, vanish, block_screenshots)
    values ('community', uni, comm, label, 'never', false) returning id into conv;
  end if;
  insert into conversation_members(conversation_id, user_id) values (conv, new.user_id)
  on conflict (conversation_id, user_id) do update set state = 'active';
  return new;
end $$;
create trigger enrollments_community after insert on enrollments for each row execute function ensure_section_community();

create or replace function leave_section_community()
returns trigger language plpgsql security definer set search_path = public as $$
declare comm uuid;
begin
  select id into comm from communities where section_id = old.section_id and kind = 'course_section';
  delete from community_members where community_id = comm and user_id = old.user_id;
  update conversation_members set state = 'left'
  where user_id = old.user_id and conversation_id in (select id from conversations where community_id = comm);
  return old;
end $$;
create trigger enrollments_leave after delete on enrollments for each row execute function leave_section_community();

-- new profiles join their university, college and major communities automatically
create or replace function join_base_communities()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.university_id is null then return new; end if;
  insert into community_members(community_id, user_id)
  select id, new.id from communities
  where (kind = 'university' and university_id = new.university_id)
     or (kind = 'college' and college_id = new.college_id)
     or (kind = 'major' and major_id = new.major_id)
  on conflict do nothing;
  return new;
end $$;
create trigger profiles_join_communities after insert or update of university_id, college_id, major_id on profiles
for each row execute function join_base_communities();

-- ---------- exams, deadlines, personal events, reminders ----------
create table academic_events (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid references sections(id) on delete cascade,
  owner_id    uuid references profiles(id) on delete cascade,  -- set for personal events
  kind        event_kind not null,
  title       text not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz,
  room_id     uuid references rooms(id) on delete set null,
  location    text,
  notes       text,
  created_by  uuid references profiles(id) on delete set null,
  confirmations integer not null default 1,
  created_at  timestamptz not null default now(),
  check (num_nonnulls(section_id, owner_id) >= 1)
);
create index academic_events_section_idx on academic_events(section_id, starts_at);
create index academic_events_owner_idx on academic_events(owner_id, starts_at);

-- per-item reminder override: minutes before, or a smart "leave now" based on walking time
create table reminders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  meeting_id  uuid references section_meetings(id) on delete cascade,
  event_id    uuid references academic_events(id) on delete cascade,
  minutes     smallint check (minutes between 0 and 1440),
  smart_leave boolean not null default false,
  enabled     boolean not null default true,
  check (num_nonnulls(meeting_id, event_id) = 1),
  unique (user_id, meeting_id),
  unique (user_id, event_id)
);

-- ---------- section swap & study buddy ----------
create table swap_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  course_id       uuid not null references courses(id) on delete cascade,
  from_section_id uuid not null references sections(id) on delete cascade,
  to_section_id   uuid not null references sections(id) on delete cascade,
  status          swap_status not null default 'open',
  matched_with    uuid references swap_requests(id) on delete set null,
  created_at      timestamptz not null default now(),
  check (from_section_id <> to_section_id)
);
create index swap_requests_match_idx on swap_requests(course_id, from_section_id, to_section_id) where status = 'open';

create or replace function find_swap_match()
returns trigger language plpgsql security definer set search_path = public as $$
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
      (other.user_id, 'swap_match', new.user_id, 'لقينا تبديل مطابق', 'في حدا بدّه نفس التبديل بالعكس', jsonb_build_object('swap_id', other.id)),
      (new.user_id, 'swap_match', other.user_id, 'لقينا تبديل مطابق', 'في حدا بدّه نفس التبديل بالعكس', jsonb_build_object('swap_id', new.id));
  end if;
  return new;
end $$;
create trigger swap_requests_match before insert on swap_requests for each row execute function find_swap_match();

create table study_intents (
  user_id    uuid not null references profiles(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  place_pref text,
  time_pref  text,
  note       text check (char_length(note) <= 200),
  active     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (user_id, course_id)
);

create table study_requests (
  id         uuid primary key default gen_random_uuid(),
  from_id    uuid not null references profiles(id) on delete cascade,
  to_id      uuid not null references profiles(id) on delete cascade,
  course_id  uuid not null references courses(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  unique (from_id, to_id, course_id)
);

-- ---------- nearby friends (opt-in, both sides, friends only, coarse place) ----------
create table presence (
  user_id    uuid primary key references profiles(id) on delete cascade,
  place_id   uuid references places(id) on delete set null,
  building_id uuid references buildings(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function nearby_friends()
returns table (user_id uuid, full_name text, avatar_url text, place_name text, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url, coalesce(pl.name_ar, b.name_ar), pr.updated_at
  from presence pr
  join profiles p on p.id = pr.user_id and p.nearby_enabled
  left join places pl on pl.id = pr.place_id
  left join buildings b on b.id = pr.building_id
  where (select nearby_enabled from profiles where id = auth.uid())
    and pr.updated_at > now() - interval '30 minutes'
    and follows_accepted(auth.uid(), p.id) and follows_accepted(p.id, auth.uid())
    and not is_blocked_between(auth.uid(), p.id);
$$;

-- ---------- search ----------
create or replace function campus_search(q text, lim int default 20)
returns table (kind text, id uuid, title text, subtitle text, lat double precision, lng double precision)
language sql stable security definer set search_path = public as $$
  with u as (select my_university() as uni)
  select * from (
    select 'building', b.id, b.name_ar, coalesce(b.code, ''), b.lat, b.lng
      from buildings b, u where b.university_id = u.uni and (b.name_ar ilike '%' || q || '%' or b.code ilike q || '%')
    union all
    select 'room', r.id, b.name_ar || ' · ' || r.code, coalesce(r.name, ''), b.lat, b.lng
      from rooms r join buildings b on b.id = r.building_id, u where b.university_id = u.uni and (r.code ilike q || '%' or r.name ilike '%' || q || '%')
    union all
    select 'place', p.id, p.name_ar, p.kind::text, p.lat, p.lng
      from places p, u where p.university_id = u.uni and p.state = 'approved' and p.name_ar ilike '%' || q || '%'
    union all
    select 'alias', coalesce(a.building_id, a.room_id, a.place_id), a.alias,
           coalesce(b.name_ar, pl.name_ar, ''), coalesce(b.lat, pl.lat), coalesce(b.lng, pl.lng)
      from place_aliases a
      left join buildings b on b.id = a.building_id
      left join places pl on pl.id = a.place_id, u
      where a.university_id = u.uni and a.state = 'approved' and a.alias ilike '%' || q || '%'
    union all
    select 'course', c.id, c.name_ar, c.code, null, null
      from courses c, u where c.university_id = u.uni and (c.name_ar ilike '%' || q || '%' or c.code ilike q || '%')
    union all
    select 'link', l.id, l.title, l.url, null, null
      from university_links l, u where l.university_id = u.uni and l.title ilike '%' || q || '%'
  ) s limit lim;
$$;

-- helpers used by policies (security definer avoids recursive RLS)
create or replace function is_enrolled(sec uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments where section_id = sec and user_id = auth.uid());
$$;

create or replace function is_my_swap_partner(req uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from swap_requests where user_id = auth.uid() and matched_with = req);
$$;

alter table posts add constraint posts_place_fk foreign key (place_id) references places(id) on delete set null;

-- ---------- RLS ----------
alter table buildings enable row level security;
alter table rooms enable row level security;
alter table places enable row level security;
alter table place_aliases enable row level security;
alter table university_links enable row level security;
alter table terms enable row level security;
alter table courses enable row level security;
alter table sections enable row level security;
alter table section_meetings enable row level security;
alter table enrollments enable row level security;
alter table meeting_reports enable row level security;
alter table academic_events enable row level security;
alter table reminders enable row level security;
alter table swap_requests enable row level security;
alter table study_intents enable row level security;
alter table study_requests enable row level security;
alter table presence enable row level security;

-- campus reference data: readable by the university's students, managed by admins
create policy "buildings read" on buildings for select using (university_id = my_university() or is_admin());
create policy "buildings admin" on buildings for all using (is_admin()) with check (is_admin());
create policy "rooms read" on rooms for select using (exists (select 1 from buildings b where b.id = building_id and (b.university_id = my_university() or is_admin())));
create policy "rooms admin" on rooms for all using (is_admin()) with check (is_admin());
create policy "places read" on places for select using ((university_id = my_university() and state = 'approved') or created_by = auth.uid() or is_admin());
create policy "places suggest" on places for insert with check (created_by = auth.uid() and university_id = my_university() and state = 'pending' and advertiser_id is null);
create policy "places admin" on places for all using (is_admin()) with check (is_admin());
create policy "aliases read" on place_aliases for select using ((university_id = my_university() and state = 'approved') or suggested_by = auth.uid() or is_admin());
create policy "aliases suggest" on place_aliases for insert with check (suggested_by = auth.uid() and university_id = my_university() and state = 'pending');
create policy "aliases admin" on place_aliases for all using (is_admin()) with check (is_admin());
create policy "links read" on university_links for select using (university_id = my_university() or is_admin());
create policy "links admin" on university_links for all using (is_admin()) with check (is_admin());

create policy "terms read" on terms for select using (university_id = my_university() or is_admin());
create policy "terms admin" on terms for all using (is_admin()) with check (is_admin());
create policy "courses read" on courses for select using (university_id = my_university() or is_admin());
create policy "courses admin" on courses for all using (is_admin()) with check (is_admin());
create policy "sections read" on sections for select using (exists (select 1 from courses c where c.id = course_id and (c.university_id = my_university() or is_admin())));
create policy "sections admin" on sections for all using (is_admin()) with check (is_admin());
create policy "meetings read" on section_meetings for select using (exists (select 1 from sections s join courses c on c.id = s.course_id where s.id = section_id and (c.university_id = my_university() or is_admin())));
create policy "meetings admin" on section_meetings for all using (is_admin()) with check (is_admin());

create policy "enrollments read" on enrollments for select using (
  user_id = auth.uid() or is_admin() or is_enrolled(section_id)
);
create policy "enrollments self" on enrollments for insert with check (
  user_id = auth.uid() and source in ('manual', 'crowd')
  and exists (select 1 from sections s join courses c on c.id = s.course_id where s.id = section_id and c.university_id = my_university())
);
create policy "enrollments leave" on enrollments for delete using (user_id = auth.uid() or is_admin());
create policy "enrollments admin" on enrollments for all using (is_admin()) with check (is_admin());

create policy "meeting reports own" on meeting_reports for insert with check (
  user_id = auth.uid() and is_enrolled(meeting_reports.section_id)
);
create policy "meeting reports read" on meeting_reports for select using (user_id = auth.uid() or is_admin());

create policy "events read" on academic_events for select using (
  owner_id = auth.uid() or is_admin()
  or (owner_id is null and is_enrolled(academic_events.section_id))
);
create policy "events add" on academic_events for insert with check (
  created_by = auth.uid() and (
    owner_id = auth.uid()
    or (owner_id is null and is_enrolled(academic_events.section_id))
  )
);
create policy "events edit" on academic_events for update using (created_by = auth.uid() or owner_id = auth.uid() or is_admin()) with check (created_by = auth.uid() or owner_id = auth.uid() or is_admin());
create policy "events delete" on academic_events for delete using (created_by = auth.uid() or owner_id = auth.uid() or is_admin());

create policy "reminders own" on reminders for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "swaps read" on swap_requests for select using (
  user_id = auth.uid() or is_admin()
  or is_my_swap_partner(id)
);
create policy "swaps create" on swap_requests for insert with check (
  user_id = auth.uid() and is_enrolled(from_section_id)
);
create policy "swaps close" on swap_requests for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "intents read" on study_intents for select using (
  user_id = auth.uid() or is_admin()
  or (active and (select university_id from profiles where id = study_intents.user_id) = my_university() and not is_blocked_between(auth.uid(), user_id))
);
create policy "intents own" on study_intents for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "study requests read" on study_requests for select using (from_id = auth.uid() or to_id = auth.uid() or is_admin());
create policy "study requests send" on study_requests for insert with check (from_id = auth.uid() and not is_blocked_between(from_id, to_id));
create policy "study requests answer" on study_requests for update using (to_id = auth.uid()) with check (to_id = auth.uid());

create policy "presence own" on presence for all using (user_id = auth.uid()) with check (
  user_id = auth.uid() and (select nearby_enabled from profiles where id = auth.uid())
);
