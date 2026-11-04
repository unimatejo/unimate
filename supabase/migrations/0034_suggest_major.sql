-- "My major isn't listed": a student adds it (unverified until an admin checks it), and it gets its group.
-- no foreign key: a second link between profiles and majors would make PostgREST embeds ambiguous
alter table public.majors add column if not exists created_by uuid;
alter table public.majors add column if not exists created_at timestamptz not null default now();
create or replace function public.add_my_major(col uuid, major_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare uni uuid; mid uuid; nm text := btrim(regexp_replace(major_name, '\s+', ' ', 'g'));
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if char_length(nm) < 3 or char_length(nm) > 90 then raise exception 'bad_name'; end if;
  select university_id into uni from colleges where id = col;
  if uni is null or uni is distinct from (select university_id from profiles where id = auth.uid()) then raise exception 'not_your_university'; end if;
  select id into mid from majors where college_id = col and lower(name_ar) = lower(nm);
  if mid is not null then return mid; end if;
  if (select count(*) from majors where created_by = auth.uid() and created_at > now() - interval '1 day') >= 3 then raise exception 'too_many'; end if;
  insert into majors (university_id, college_id, name_ar, verified, created_by) values (uni, col, nm, false, auth.uid()) returning id into mid;
  insert into communities (university_id, kind, college_id, major_id, name, description) values (uni, 'major', col, mid, nm, 'طلاب التخصص');
  return mid;
end $$;
revoke execute on function public.add_my_major(uuid, text) from public, anon;
grant execute on function public.add_my_major(uuid, text) to authenticated;
