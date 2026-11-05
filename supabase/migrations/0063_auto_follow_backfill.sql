-- UniMate · 0063 existing accounts also follow the founder (owner's request; unfollow works as usual)
do $$ declare founder uuid := 'a7390ccc-d877-41bf-bb73-b368d590bade'; n int; begin
  perform set_config('unimate.system', 'on', true);
  insert into follows(follower_id, followee_id, status)
  select p.id, founder, 'accepted' from profiles p
  where p.id <> founder and p.deletion_requested_at is null
    and not exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = founder)
  on conflict do nothing;
  get diagnostics n = row_count;
  update follows set status = 'accepted' where followee_id = founder and status <> 'accepted';
  perform set_config('unimate.system', 'off', true);
  raise notice 'added %', n;
end $$;
