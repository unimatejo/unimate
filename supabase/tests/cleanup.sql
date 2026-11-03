select set_config('request.jwt.claims', '', false);
delete from auth.users where id in ('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333');
delete from universities where id in ('00000000-0000-0000-0000-00000000aaaa','00000000-0000-0000-0000-00000000bbbb');
select (select count(*) from universities) as universities_left, (select count(*) from profiles) as profiles_left;
