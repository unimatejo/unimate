-- UniMate · 0132 the feed reads only the posts it shows
--
-- Found by the load test (staging copy, 20,000 students, 200,000 posts): the feed asks for
-- "posts of my university, pinned first, newest first, 20 of them". No index had that order, so Postgres read
-- every post of the university, ran the privacy check (can_see_post) on each one, sorted them all and kept 20.
-- With 40,000 posts in one university that took over 20 seconds; with the index below it takes 27 ms, because
-- Postgres walks the posts already in order and stops after the first 20 the student may see.
-- One index per feed tab (university, college, a community); nothing else changes.

create index if not exists posts_uni_feed_idx on public.posts (university_id, is_pinned desc, created_at desc)
  where community_id is null;
create index if not exists posts_college_feed_idx on public.posts (college_id, is_pinned desc, created_at desc)
  where community_id is null;
create index if not exists posts_community_feed_idx on public.posts (community_id, is_pinned desc, created_at desc)
  where community_id is not null;
