-- UniMate · 0002 social graph, communities, posts, stories, notifications, reports, points

create type follow_status as enum ('pending', 'accepted');
create type community_kind as enum ('university', 'college', 'major', 'course_section', 'club');
create type post_category as enum (
  'square', 'summaries', 'assignments', 'tutoring', 'lost_found',
  'market', 'exchange', 'transport_housing', 'events', 'opportunities'
);
create type post_audience as enum ('university', 'college', 'major', 'friends', 'community');
create type lost_found_kind as enum ('lost', 'found');
create type story_audience as enum ('friends', 'close_friends', 'major', 'university');
create type media_kind as enum ('image', 'video', 'file');
create type report_target as enum ('user', 'post', 'comment', 'story', 'message', 'conversation');
create type report_status as enum ('open', 'reviewing', 'resolved', 'dismissed');

-- ---------- graph ----------
create table follows (
  follower_id uuid not null references profiles(id) on delete cascade,
  followee_id uuid not null references profiles(id) on delete cascade,
  status      follow_status not null default 'pending',
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index follows_followee_idx on follows(followee_id, status);

create table blocks (
  blocker_id uuid not null references profiles(id) on delete cascade,
  blocked_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table close_friends (
  owner_id   uuid not null references profiles(id) on delete cascade,
  friend_id  uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, friend_id)
);

create or replace function is_blocked_between(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from blocks where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a));
$$;

create or replace function follows_accepted(viewer uuid, target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from follows where follower_id = viewer and followee_id = target and status = 'accepted');
$$;

-- can the current user see this person's content (posts, stories, highlights)?
create or replace function can_see_user(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
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
$$;

-- ---------- communities ----------
create table communities (
  id            uuid primary key default gen_random_uuid(),
  university_id uuid not null references universities(id) on delete cascade,
  kind          community_kind not null,
  college_id    uuid references colleges(id) on delete cascade,
  major_id      uuid references majors(id) on delete cascade,
  section_id    uuid,  -- fk added in 0004
  name          text not null,
  description   text not null default '',
  color         text not null default '#2E5BFF',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
create index communities_uni_idx on communities(university_id, kind);
create unique index communities_one_university on communities(university_id) where kind = 'university';
create unique index communities_one_college on communities(college_id) where kind = 'college';
create unique index communities_one_major on communities(major_id) where kind = 'major';

create table community_members (
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references profiles(id) on delete cascade,
  role         text not null default 'member' check (role in ('member', 'moderator')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index community_members_user_idx on community_members(user_id);

create or replace function is_community_member(c uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from community_members where community_id = c and user_id = auth.uid());
$$;

-- ---------- posts ----------
create table posts (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  university_id  uuid not null references universities(id) on delete cascade,
  community_id   uuid references communities(id) on delete cascade,
  category       post_category not null default 'square',
  audience       post_audience not null default 'university',
  title          text check (char_length(title) <= 140),
  body           text not null default '' check (char_length(body) <= 5000),
  price_jod      numeric(10,2),
  lost_found     lost_found_kind,
  place_id       uuid,  -- fk added in 0004
  poll           jsonb,
  is_pinned      boolean not null default false,
  is_hidden      boolean not null default false,
  hide_likes     boolean not null default false,
  like_count     integer not null default 0,
  comment_count  integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index posts_feed_idx on posts(university_id, created_at desc) where not is_hidden;
create index posts_category_idx on posts(university_id, category, created_at desc);
create index posts_community_idx on posts(community_id, created_at desc);
create index posts_author_idx on posts(author_id, created_at desc);
create index posts_text_trgm on posts using gin ((coalesce(title,'') || ' ' || body) gin_trgm_ops);
create trigger posts_touch before update on posts for each row execute function touch_updated_at();

create table post_media (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  kind       media_kind not null default 'image',
  url        text not null,
  file_name  text,
  size_bytes bigint,
  position   smallint not null default 0
);
create index post_media_post_idx on post_media(post_id, position);

create table post_likes (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index post_likes_user_idx on post_likes(user_id);

create table post_saves (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references posts(id) on delete cascade,
  author_id  uuid not null references profiles(id) on delete cascade,
  parent_id  uuid references comments(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now()
);
create index comments_post_idx on comments(post_id, created_at);

create table poll_votes (
  post_id    uuid not null references posts(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  option_idx smallint not null,
  primary key (post_id, user_id)
);

-- can the current user see this post?
create or replace function can_see_post(p posts)
returns boolean language sql stable security definer set search_path = public as $$
  select
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
$$;

-- counters
create or replace function bump_post_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('unimate.system', 'on', true);
  if tg_table_name = 'post_likes' then
    update posts set like_count = like_count + (case when tg_op = 'INSERT' then 1 else -1 end)
    where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'comments' then
    update posts set comment_count = comment_count + (case when tg_op = 'INSERT' then 1 else -1 end)
    where id = coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'posts' then
    update profiles set post_count = post_count + (case when tg_op = 'INSERT' then 1 else -1 end)
    where id = coalesce(new.author_id, old.author_id);
  end if;
  perform set_config('unimate.system', 'off', true);
  return null;
end $$;
create trigger post_likes_count after insert or delete on post_likes for each row execute function bump_post_counts();
create trigger comments_count after insert or delete on comments for each row execute function bump_post_counts();
create trigger posts_count after insert or delete on posts for each row execute function bump_post_counts();

create or replace function bump_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare delta int;
begin
  if tg_op = 'INSERT' and new.status = 'accepted' then delta := 1;
  elsif tg_op = 'DELETE' and old.status = 'accepted' then delta := -1;
  elsif tg_op = 'UPDATE' and old.status <> new.status then
    delta := case when new.status = 'accepted' then 1 else -1 end;
  else return null; end if;
  perform set_config('unimate.system', 'on', true);
  update profiles set follower_count = follower_count + delta where id = coalesce(new.followee_id, old.followee_id);
  update profiles set following_count = following_count + delta where id = coalesce(new.follower_id, old.follower_id);
  perform set_config('unimate.system', 'off', true);
  return null;
end $$;
create trigger follows_count after insert or update or delete on follows for each row execute function bump_follow_counts();

-- following a public account is accepted immediately; private needs approval
create or replace function follow_default_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if is_blocked_between(new.follower_id, new.followee_id) then
    raise exception 'blocked';
  end if;
  new.status := case when (select is_private from profiles where id = new.followee_id) then 'pending' else 'accepted' end;
  return new;
end $$;
create trigger follows_default before insert on follows for each row execute function follow_default_status();

-- blocking removes follows both ways
create or replace function block_cleanup()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from follows where (follower_id = new.blocker_id and followee_id = new.blocked_id)
                         or (follower_id = new.blocked_id and followee_id = new.blocker_id);
  delete from close_friends where (owner_id = new.blocker_id and friend_id = new.blocked_id)
                               or (owner_id = new.blocked_id and friend_id = new.blocker_id);
  return new;
end $$;
create trigger blocks_cleanup after insert on blocks for each row execute function block_cleanup();

-- ---------- stories ----------
create table stories (
  id             uuid primary key default gen_random_uuid(),
  author_id      uuid not null references profiles(id) on delete cascade,
  university_id  uuid not null references universities(id) on delete cascade,
  community_id   uuid references communities(id) on delete cascade,
  kind           media_kind not null default 'image' check (kind in ('image', 'video')),
  media_url      text not null,
  duration_sec   smallint check (duration_sec <= 15),
  caption        text check (char_length(caption) <= 300),
  audience       story_audience not null default 'friends',
  is_highlighted boolean not null default false,
  is_hidden      boolean not null default false,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '24 hours'
);
create index stories_active_idx on stories(university_id, expires_at desc);
create index stories_author_idx on stories(author_id, created_at desc);

create table story_views (
  story_id  uuid not null references stories(id) on delete cascade,
  viewer_id uuid not null references profiles(id) on delete cascade,
  liked     boolean not null default false,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table highlights (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references profiles(id) on delete cascade,
  title      text not null check (char_length(title) <= 30),
  cover_url  text,
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

create table highlight_items (
  highlight_id uuid not null references highlights(id) on delete cascade,
  story_id     uuid not null references stories(id) on delete cascade,
  added_at     timestamptz not null default now(),
  primary key (highlight_id, story_id)
);

-- only images can be highlighted, and at most 30 per person
create or replace function guard_highlight()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; k media_kind; n int;
begin
  select author_id, kind into owner, k from stories where id = new.story_id;
  if owner <> (select owner_id from highlights where id = new.highlight_id) then raise exception 'not your story'; end if;
  if k <> 'image' then raise exception 'only images can be highlighted'; end if;
  select count(*) into n from highlight_items hi join highlights h on h.id = hi.highlight_id where h.owner_id = owner;
  if n >= 30 then raise exception 'highlight limit reached'; end if;
  update stories set is_highlighted = true where id = new.story_id;
  return new;
end $$;
create trigger highlight_guard before insert on highlight_items for each row execute function guard_highlight();

create or replace function can_see_story(s stories)
returns boolean language sql stable security definer set search_path = public as $$
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
    );
$$;

-- ---------- notifications ----------
create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  actor_id   uuid references profiles(id) on delete cascade,
  title      text not null,
  body       text,
  data       jsonb not null default '{}',
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications(user_id, created_at desc);

create table push_tokens (
  token      text primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now()
);

create table notification_prefs (
  user_id         uuid primary key references profiles(id) on delete cascade,
  lectures        boolean not null default true,
  lecture_minutes smallint not null default 10 check (lecture_minutes between 0 and 180),
  smart_leave     boolean not null default true,
  nightly_summary boolean not null default true,
  summary_time    time not null default '21:00',
  exams           boolean not null default true,
  messages        boolean not null default true,
  social          boolean not null default true,
  community       boolean not null default true,
  ads             boolean not null default true
);

-- ---------- reports & safety ----------
create table reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references profiles(id) on delete cascade,
  target_type  report_target not null,
  target_id    uuid not null,
  target_user  uuid references profiles(id) on delete set null,
  reason       text not null,
  details      text,
  also_blocked boolean not null default false,
  status       report_status not null default 'open',
  resolved_by  uuid references profiles(id),
  action_taken text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz
);
create index reports_status_idx on reports(status, created_at desc);

create table hidden_words (
  user_id uuid not null references profiles(id) on delete cascade,
  word    text not null,
  primary key (user_id, word)
);

create table support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  subject    text not null,
  body       text not null,
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply      text,
  created_at timestamptz not null default now()
);

-- ---------- points ----------
create table point_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  points     integer not null,
  ref_id     uuid,
  created_at timestamptz not null default now()
);
create index point_events_user_idx on point_events(user_id, created_at desc);

create or replace function award_points()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('unimate.system', 'on', true);
  update profiles set points = points + new.points where id = new.user_id;
  perform set_config('unimate.system', 'off', true);
  return new;
end $$;
create trigger point_events_award after insert on point_events for each row execute function award_points();

-- summaries, answers and returned lost items earn points
create or replace function points_for_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.category = 'summaries' then
    insert into point_events(user_id, kind, points, ref_id) values (new.author_id, 'summary', 10, new.id);
  elsif new.category = 'lost_found' and new.lost_found = 'found' then
    insert into point_events(user_id, kind, points, ref_id) values (new.author_id, 'found_item', 5, new.id);
  end if;
  return new;
end $$;
create trigger posts_points after insert on posts for each row execute function points_for_post();

-- ---------- RLS ----------
alter table follows enable row level security;
alter table blocks enable row level security;
alter table close_friends enable row level security;
alter table communities enable row level security;
alter table community_members enable row level security;
alter table posts enable row level security;
alter table post_media enable row level security;
alter table post_likes enable row level security;
alter table post_saves enable row level security;
alter table comments enable row level security;
alter table poll_votes enable row level security;
alter table stories enable row level security;
alter table story_views enable row level security;
alter table highlights enable row level security;
alter table highlight_items enable row level security;
alter table notifications enable row level security;
alter table push_tokens enable row level security;
alter table notification_prefs enable row level security;
alter table reports enable row level security;
alter table hidden_words enable row level security;
alter table support_tickets enable row level security;
alter table point_events enable row level security;

-- follows: lists respect hide_followers / hide_following
create policy "follows read" on follows for select using (
  is_admin() or follower_id = auth.uid() or followee_id = auth.uid()
  or (
    status = 'accepted'
    and not exists (select 1 from profiles where id = followee_id and hide_followers)
    and not exists (select 1 from profiles where id = follower_id and hide_following)
    and can_see_user(followee_id) and can_see_user(follower_id)
  )
);
create policy "follows create" on follows for insert with check (
  follower_id = auth.uid() and is_active_user()
  and (select university_id from profiles where id = followee_id) = my_university()
);
create policy "follows accept" on follows for update using (followee_id = auth.uid()) with check (followee_id = auth.uid());
create policy "follows remove" on follows for delete using (follower_id = auth.uid() or followee_id = auth.uid() or is_admin());

create policy "blocks own" on blocks for all using (blocker_id = auth.uid() or is_admin()) with check (blocker_id = auth.uid());
create policy "close friends own" on close_friends for all using (owner_id = auth.uid()) with check (owner_id = auth.uid() and follows_accepted(friend_id, owner_id));

create policy "communities read" on communities for select using (university_id = my_university() or is_admin());
create policy "communities admin" on communities for all using (is_admin()) with check (is_admin());
create policy "members read" on community_members for select using (is_community_member(community_id) or is_admin());
create policy "members join" on community_members for insert with check (
  user_id = auth.uid() and exists (select 1 from communities c where c.id = community_id and c.university_id = my_university() and c.kind in ('university', 'club'))
);
create policy "members leave" on community_members for delete using (user_id = auth.uid() or is_admin());
create policy "members admin" on community_members for all using (is_admin()) with check (is_admin());

create policy "posts read" on posts for select using (can_see_post(posts));
create policy "posts create" on posts for insert with check (
  author_id = auth.uid() and is_active_user() and university_id = my_university()
  and (community_id is null or is_community_member(community_id))
  and not is_pinned and not is_hidden
);
create policy "posts edit own" on posts for update using (author_id = auth.uid() or is_admin()) with check (author_id = auth.uid() or is_admin());
create policy "posts delete own" on posts for delete using (author_id = auth.uid() or is_admin());

create policy "media read" on post_media for select using (exists (select 1 from posts p where p.id = post_id and can_see_post(p)));
create policy "media write" on post_media for all using (exists (select 1 from posts p where p.id = post_id and (p.author_id = auth.uid() or is_admin())))
  with check (exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid()));

create policy "likes read" on post_likes for select using (
  is_admin() or user_id = auth.uid()
  or exists (select 1 from posts p where p.id = post_id and can_see_post(p) and (not p.hide_likes or p.author_id = auth.uid()))
);
create policy "likes own" on post_likes for insert with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id and can_see_post(p)));
create policy "likes remove" on post_likes for delete using (user_id = auth.uid());

create policy "saves own" on post_saves for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "comments read" on comments for select using (
  is_admin() or (not is_hidden and exists (select 1 from posts p where p.id = post_id and can_see_post(p)) and not is_blocked_between(auth.uid(), author_id))
);
create policy "comments create" on comments for insert with check (
  author_id = auth.uid() and is_active_user() and exists (select 1 from posts p where p.id = post_id and can_see_post(p))
);
create policy "comments edit" on comments for update using (author_id = auth.uid() or is_admin()) with check (author_id = auth.uid() or is_admin());
create policy "comments delete" on comments for delete using (
  author_id = auth.uid() or is_admin() or exists (select 1 from posts p where p.id = post_id and p.author_id = auth.uid())
);

create policy "votes read" on poll_votes for select using (exists (select 1 from posts p where p.id = post_id and can_see_post(p)));
create policy "votes own" on poll_votes for insert with check (user_id = auth.uid() and exists (select 1 from posts p where p.id = post_id and can_see_post(p)));

create policy "stories read" on stories for select using (can_see_story(stories));
create policy "stories create" on stories for insert with check (
  author_id = auth.uid() and is_active_user() and university_id = my_university()
  and (community_id is null or is_community_member(community_id)) and not is_hidden
);
create policy "stories own" on stories for update using (author_id = auth.uid() or is_admin()) with check (author_id = auth.uid() or is_admin());
create policy "stories delete" on stories for delete using (author_id = auth.uid() or is_admin());

create policy "story views read" on story_views for select using (
  viewer_id = auth.uid() or is_admin() or exists (select 1 from stories s where s.id = story_id and s.author_id = auth.uid())
);
create policy "story views add" on story_views for insert with check (viewer_id = auth.uid() and exists (select 1 from stories s where s.id = story_id and can_see_story(s)));
create policy "story views like" on story_views for update using (viewer_id = auth.uid()) with check (viewer_id = auth.uid());

create policy "highlights read" on highlights for select using (can_see_user(owner_id));
create policy "highlights own" on highlights for all using (owner_id = auth.uid() or is_admin()) with check (owner_id = auth.uid());
create policy "highlight items read" on highlight_items for select using (exists (select 1 from highlights h where h.id = highlight_id and can_see_user(h.owner_id)));
create policy "highlight items own" on highlight_items for all using (exists (select 1 from highlights h where h.id = highlight_id and h.owner_id = auth.uid()))
  with check (exists (select 1 from highlights h where h.id = highlight_id and h.owner_id = auth.uid()));

create policy "notifications own" on notifications for select using (user_id = auth.uid() or is_admin());
create policy "notifications read mark" on notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notifications delete own" on notifications for delete using (user_id = auth.uid());
create policy "notifications admin" on notifications for insert with check (is_admin());

create policy "push own" on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "prefs own" on notification_prefs for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "reports create" on reports for insert with check (reporter_id = auth.uid());
create policy "reports read own" on reports for select using (reporter_id = auth.uid() or is_admin());
create policy "reports admin" on reports for update using (is_admin()) with check (is_admin());

create policy "hidden words own" on hidden_words for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "tickets create" on support_tickets for insert with check (user_id = auth.uid());
create policy "tickets read" on support_tickets for select using (user_id = auth.uid() or is_admin());
create policy "tickets admin" on support_tickets for update using (is_admin()) with check (is_admin());

create policy "points read own" on point_events for select using (user_id = auth.uid() or is_admin());
create policy "points admin" on point_events for insert with check (is_admin());
