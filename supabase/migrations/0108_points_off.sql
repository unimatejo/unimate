-- UniMate · 0108 the points system is retired; the honor board (official GPAs) stays.
-- Nothing is deleted: point_events and profiles.points keep their history, so the decision can be undone.
-- What stops: earning points (the triggers), and reading the points board (the functions).
drop trigger if exists posts_points_v2 on public.posts;
drop trigger if exists post_likes_points on public.post_likes;
drop trigger if exists ride_requests_points on public.ride_requests;
drop trigger if exists point_events_award on public.point_events;

revoke execute on function public.leaderboard(text, text) from public, anon, authenticated;
revoke execute on function public.my_points_history() from public, anon, authenticated;
revoke execute on function public.set_hide_rank(boolean) from public, anon, authenticated;
revoke all on public.point_events from anon, authenticated;

-- the home screen's "الترتيب" button now opens the honor board: the old "leaderboard" switch goes
update public.app_config set value = (value::jsonb #- '{features,leaderboard}')::text
where key = 'app_content' and value::jsonb #> '{features,leaderboard}' is not null;
