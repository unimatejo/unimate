-- University of Jordan, after the owner's review (2026-11-07):
-- 1. Buildings OSM named in English get their Arabic name; the English stays as a search alias.
-- 2. What the official map and a second source didn't agree on stays hidden until a UJ student confirms it through
--    «اقترح مكان»: the old admissions building (the map puts admissions by the medicine gate, where the new one is) and
--    a second «Northern Gate» in the north-east corner that the map doesn't show. Rejected, not deleted.
do $$
declare ju uuid := '49569f3c-5c69-479f-8f67-7ee0552db5ae';
begin
  insert into place_aliases (university_id, building_id, alias, state)
  select ju, b.id, b.name_ar, 'approved' from buildings b
  where b.university_id = ju and b.id in ('15292eab-2e54-470f-8b61-47aa724484a0', 'c42bfc42-486b-4044-ba03-a8c3690311a3', 'c0b34cf1-3cc8-46e1-9a02-d432c8c4fc11')
    and not exists (select 1 from place_aliases a where a.university_id = ju and a.alias = b.name_ar);
  update buildings set name_en = name_ar, name_ar = v.n from (values
    ('15292eab-2e54-470f-8b61-47aa724484a0'::uuid, 'الدائرة المالية'),
    ('c42bfc42-486b-4044-ba03-a8c3690311a3'::uuid, 'قسم نظم المعلومات الإدارية'),
    ('c0b34cf1-3cc8-46e1-9a02-d432c8c4fc11'::uuid, 'مركز دراسات المرأة')
  ) v(id, n) where buildings.id = v.id and buildings.university_id = ju and buildings.name_ar !~ '[ء-ي]';

  update buildings set state = 'rejected' where university_id = ju and state = 'approved' and id = '99a3f0a3-7870-424e-bdf5-bdc1d5df445a';
  update places set state = 'rejected' where university_id = ju and state = 'approved' and id = '8d9e036c-28e9-4f57-a505-1a7d7203266b';
end $$;
