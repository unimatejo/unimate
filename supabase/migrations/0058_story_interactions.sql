-- UniMate · 0058 interactive story stickers (Instagram-style): poll, question box, emoji slider, countdown.
-- The sticker itself lives in stories.overlays (its id is the sticker_id here); these tables hold the answers.
-- Viewers add their own answer to stories they can see; the author reads everything; others get totals via RPC.

create table if not exists story_poll_votes (
  story_id   uuid not null references stories(id) on delete cascade,
  sticker_id text not null check (char_length(sticker_id) between 1 and 40),
  user_id    uuid not null default auth.uid() references profiles(id) on delete cascade,
  option     smallint not null check (option between 0 and 3),
  created_at timestamptz not null default now(),
  primary key (story_id, sticker_id, user_id)
);
create table if not exists story_question_answers (
  id         uuid primary key default gen_random_uuid(),
  story_id   uuid not null references stories(id) on delete cascade,
  sticker_id text not null check (char_length(sticker_id) between 1 and 40),
  user_id    uuid not null default auth.uid() references profiles(id) on delete cascade,
  body       text not null check (char_length(trim(body)) between 1 and 300),
  created_at timestamptz not null default now()
);
create index if not exists story_question_answers_story_idx on story_question_answers(story_id, created_at desc);
create table if not exists story_slider_votes (
  story_id   uuid not null references stories(id) on delete cascade,
  sticker_id text not null check (char_length(sticker_id) between 1 and 40),
  user_id    uuid not null default auth.uid() references profiles(id) on delete cascade,
  value      real not null check (value between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (story_id, sticker_id, user_id)
);
create table if not exists story_countdown_subscribers (
  story_id   uuid not null references stories(id) on delete cascade,
  sticker_id text not null check (char_length(sticker_id) between 1 and 40),
  user_id    uuid not null default auth.uid() references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, sticker_id, user_id)
);

-- may the signed-in user answer on this story? (they can see it, and it is still live)
create or replace function public.story_answerable(p_story uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from stories s where s.id = p_story and s.expires_at > now() and can_see_story(s));
$$;
create or replace function public.story_author_is_me(p_story uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from stories s where s.id = p_story and s.author_id = auth.uid());
$$;
grant execute on function public.story_answerable(uuid), public.story_author_is_me(uuid) to authenticated;

do $$
declare tb text;
begin
  foreach tb in array array['story_poll_votes', 'story_question_answers', 'story_slider_votes', 'story_countdown_subscribers'] loop
    execute format('alter table %I enable row level security', tb);
    execute format('drop policy if exists "%s read" on %I', tb, tb);
    execute format('create policy "%s read" on %I for select using (user_id = auth.uid() or public.story_author_is_me(story_id) or is_admin())', tb, tb);
    execute format('drop policy if exists "%s add" on %I', tb, tb);
    execute format('create policy "%s add" on %I for insert with check (user_id = auth.uid() and public.story_answerable(story_id))', tb, tb);
    execute format('drop policy if exists "%s own" on %I', tb, tb);
    execute format('create policy "%s own" on %I for delete using (user_id = auth.uid() or is_admin())', tb, tb);
    execute format('grant select, insert, delete on %I to authenticated', tb);
  end loop;
end $$;
-- a poll / slider answer can be changed (upsert)
drop policy if exists "story_poll_votes change" on story_poll_votes;
create policy "story_poll_votes change" on story_poll_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.story_answerable(story_id));
drop policy if exists "story_slider_votes change" on story_slider_votes;
create policy "story_slider_votes change" on story_slider_votes for update using (user_id = auth.uid()) with check (user_id = auth.uid() and public.story_answerable(story_id));
grant update on story_poll_votes, story_slider_votes to authenticated;

-- totals for every sticker on one story, plus my own answers; the author also gets the question answers with names
create or replace function public.story_sticker_results(p_story uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare me uuid := auth.uid(); author boolean; r jsonb;
begin
  if me is null or not exists (select 1 from stories s where s.id = p_story and (can_see_story(s) or s.author_id = me)) then
    return '{}'::jsonb;
  end if;
  author := exists (select 1 from stories s where s.id = p_story and s.author_id = me);
  select jsonb_build_object(
    'polls', coalesce((select jsonb_object_agg(sticker_id, x) from (
        select sticker_id, jsonb_build_object(
          'counts', (select jsonb_agg(coalesce((select count(*) from story_poll_votes v2 where v2.story_id = p_story and v2.sticker_id = v.sticker_id and v2.option = o), 0) order by o) from generate_series(0, 3) o),
          'mine', (select option from story_poll_votes v3 where v3.story_id = p_story and v3.sticker_id = v.sticker_id and v3.user_id = me)) x
        from (select distinct sticker_id from story_poll_votes where story_id = p_story) v) q), '{}'::jsonb),
    'sliders', coalesce((select jsonb_object_agg(sticker_id, jsonb_build_object('avg', avg_v, 'count', n,
        'mine', (select value from story_slider_votes v3 where v3.story_id = p_story and v3.sticker_id = q.sticker_id and v3.user_id = me)))
        from (select sticker_id, avg(value) avg_v, count(*) n from story_slider_votes where story_id = p_story group by sticker_id) q), '{}'::jsonb),
    'countdowns', coalesce((select jsonb_object_agg(sticker_id, jsonb_build_object('count', n,
        'mine', exists (select 1 from story_countdown_subscribers v3 where v3.story_id = p_story and v3.sticker_id = q.sticker_id and v3.user_id = me)))
        from (select sticker_id, count(*) n from story_countdown_subscribers where story_id = p_story group by sticker_id) q), '{}'::jsonb),
    'questions', coalesce((select jsonb_object_agg(sticker_id, jsonb_build_object('count', n,
        'answers', case when author then (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'body', a.body, 'user_id', a.user_id, 'name', p.full_name, 'username', p.username, 'avatar_url', p.avatar_url, 'at', a.created_at) order by a.created_at desc), '[]'::jsonb)
                                       from story_question_answers a join profiles p on p.id = a.user_id where a.story_id = p_story and a.sticker_id = q.sticker_id) else null end))
        from (select sticker_id, count(*) n from story_question_answers where story_id = p_story group by sticker_id) q), '{}'::jsonb),
    'author', author
  ) into r;
  return r;
end $$;
grant execute on function public.story_sticker_results(uuid) to authenticated;
