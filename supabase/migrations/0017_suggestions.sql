-- People you may know: same university, ranked by same major, cohort, college, and mutual follows.
create or replace function suggested_people(lim int default 15)
returns table (id uuid, full_name text, username text, avatar_url text, is_verified boolean, major_ar text, major_en text, reason text)
language sql stable security definer set search_path = public as $$
  with me as (select * from profiles where id = auth.uid()),
  mine as (select followee_id from follows where follower_id = auth.uid()),
  cand as (
    select p.*, 
      (case when p.major_id = me.major_id then 4 else 0 end)
      + (case when p.entry_year = me.entry_year and p.college_id = me.college_id then 3 else 0 end)
      + (case when p.college_id = me.college_id then 1 else 0 end)
      + (select count(*) from follows f where f.follower_id = p.id and f.followee_id in (select followee_id from mine)) as score,
      case when p.major_id = me.major_id and p.entry_year = me.entry_year then 'cohort'
           when p.major_id = me.major_id then 'major'
           when p.college_id = me.college_id then 'college' else 'university' end as why
    from profiles p, me
    where p.university_id = me.university_id and p.id <> me.id and p.status = 'active' and p.onboarded
      and p.id not in (select followee_id from mine)
      and not is_blocked_between(me.id, p.id)
  )
  select c.id, c.full_name, c.username, c.avatar_url, c.is_verified, m.name_ar, m.name_en, c.why
  from cand c left join majors m on m.id = c.major_id
  order by c.score desc, (c.avatar_url is not null) desc, c.created_at desc
  limit lim;
$$;
grant execute on function suggested_people(int) to authenticated;
