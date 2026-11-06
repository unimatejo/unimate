-- The owner's decisions on the personal-names list (26 names, 2026-11-06). Hidden as `rejected`, never deleted.
--
-- 1) Hidden: a student's name with his Facebook (TTU), and five private student housings off campus (Yarmouk ×4,
--    Mutah ×1). «سكن نسيبة المازنية للطالبات» (TTU) is 606 m from the centre, past every TTU building (TTU has no OSM
--    outline, so "on campus" is the reach of its buildings): off campus, hidden from the campus map.
-- 2) «رئاسة الجامعه الرئيس الحالى مأمون القرعان ابو همام» → «رئاسة الجامعة»: no current officials' names on buildings.
-- 3) The private housings are kept as candidates for a future housing section, in a private table the app can't
--    read (schema `private`: no API access). Nothing shows them today.

create table if not exists private.housing_candidates (
  id           uuid primary key default gen_random_uuid(),
  university_id uuid not null references public.universities(id) on delete cascade,
  building_id  uuid references public.buildings(id) on delete set null,
  place_id     uuid references public.places(id) on delete set null,
  name         text not null,
  for_whom     text check (for_whom in ('male', 'female', 'any')),
  lat          float8, lng float8,
  source       text not null default 'osm',
  created_at   timestamptz not null default now()
);
revoke all on private.housing_candidates from public, anon, authenticated;

insert into private.housing_candidates (university_id, building_id, place_id, name, for_whom, lat, lng)
select b.university_id, b.id, null, b.name_ar, case when b.name_ar ~ 'طالبات|الطالبة' then 'female' when b.name_ar ~ 'طلاب' then 'male' end, b.lat, b.lng
  from buildings b
  where b.id in ('ed8b2267-20ea-4071-9c9a-08a65af3ff6e', 'c61a7091-c1bd-45e1-b3f7-108c21c31a28', '5ea56f6f-c37b-481b-92d5-44434a1942ee',
                 'c3e99e73-a79e-433f-8a53-afb078ae945a', '8c384dc5-f37a-41a3-8382-7aa0fc861635', 'd79749d3-560e-4244-8412-0e9697bdb40f')
    and not exists (select 1 from private.housing_candidates h where h.building_id = b.id)
union all
select p.university_id, null, p.id, p.name_ar, 'female', p.lat, p.lng
  from places p
  where p.id = 'a61c54cf-8df4-460b-a005-da5d80c9be39' and not exists (select 1 from private.housing_candidates h where h.place_id = p.id);

update buildings set state = 'rejected' where state = 'approved' and id in (
  '94b10929-1c29-4089-b3a0-1a442d4e76d6',  -- هنا درس عمار ابو الخير … facebook (الطفيلة)
  '8c384dc5-f37a-41a3-8382-7aa0fc861635',  -- سكن الراشد (مؤتة)
  'c3e99e73-a79e-433f-8a53-afb078ae945a',  -- بيت الطالبة الجامعية - سكن طالبات اربد
  '5ea56f6f-c37b-481b-92d5-44434a1942ee',  -- سكن العمري للطلاب
  'c61a7091-c1bd-45e1-b3f7-108c21c31a28',  -- سكن الفاروق للطلاب
  'ed8b2267-20ea-4071-9c9a-08a65af3ff6e'); -- سكن ايفريست للطالبات
update places set state = 'rejected' where state = 'approved' and id = 'a61c54cf-8df4-460b-a005-da5d80c9be39'; -- سكن نسيبة المازنية للطالبات

update buildings set name_ar = 'رئاسة الجامعة'
  where id = 'e5365817-dfd7-414b-a36b-7b8f71294d8b' and name_ar like 'رئاسة الجامعه الرئيس%';
