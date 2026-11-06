-- UniMate · 0097 the blue check is for the owner and the university's leaders only (president, vice president, dean,
-- vice dean) and anyone the owner picks by hand. Doctors and other titles keep their own coloured title badge, without
-- the blue check.
create or replace function private.is_vip_title(t text) returns boolean language sql immutable set search_path = '' as $$
  select t in ('president', 'vice_president', 'dean', 'vice_dean')
$$;
select set_config('unimate.system', 'on', true);
update profiles set is_verified = false
where is_verified and not blue_manual and not (title_verified and private.is_vip_title(academic_title));
