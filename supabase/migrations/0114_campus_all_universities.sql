-- REVIEW BEFORE APPLYING. Every university's campus map for every student.
--
-- 1) 24 rows registered to the University of Jordan sit inside Princess Sumaya University for Technology's campus
--    outline (and outside UJ's): they are PSUT's colleges and places and showed on UJ's map. Nothing references them
--    (rooms, posts, presence, aliases: 0), so they move as they are. Guarded: only rows still on UJ move.
-- 2) campus_pins(university): any signed-in student can browse another university's map (the switcher on the map).
--    It returns only what the map draws: buildings (name, code, point) and approved places (kind, name, point). No
--    people, no pending suggestions, no rooms. A student's own university keeps reading the tables directly (RLS).

do $$
declare
  uj uuid := (select id from universities where slug = 'ju');
  psut uuid := (select id from universities where slug = 'psut');
  nb int; np int;
begin
  update buildings set university_id = psut where university_id = uj and id in (select x from (values
  ('e3a8fdd3-e76f-4a20-8e68-2d1efc96db2b'::uuid), -- كلية الملك الحسين لعلوم الحوسبة
  ('208ce3c9-23bd-40c4-9b9a-4764bf2b5650'::uuid), -- مختبرات كلية الملك عبدالله الثاني للهندسة
  ('51463080-2bf0-4ea3-b464-ef8d2a5959d4'::uuid), -- عمادة شؤون الطلبة
  ('d8dc081f-f683-4dcd-9206-f4c695da5073'::uuid), -- كلية الملك طلال لتكنولوجيا الأعمال
  ('7fd527d9-1b3f-47f9-a1aa-c011f1f413de'::uuid), -- عمادة القبول والتسجيل
  ('1bdb333c-5f8d-4e7b-934f-6cda0d687743'::uuid), -- كلية الملك عبدالله الثاني للهندسة
  ('a26e2903-b246-4d5c-8ec2-8a15ff59008c'::uuid), -- King Abdullah I School of Graduate Studies & Scientific Research
  ('6b14a647-f0ea-4e07-bbc0-9eb09630ce99'::uuid), -- رئاسة الجامعة
  ('74fde9cc-e2db-4db0-b622-ed1b56b16f86'::uuid) -- كلية الملك طلال لتكنولوجيا الأعمال
  ) v(x));
  get diagnostics nb = row_count;
  update places set university_id = psut where university_id = uj and id in (select x from (values
  ('b792dc62-483d-4c10-83ba-6b661fb05c67'::uuid), -- كافتيريا
  ('9ae9d7be-bea2-4289-8bec-cef434d61d86'::uuid), -- صراف آلي
  ('854be74c-7efe-4d80-8547-e4e935b3e8b6'::uuid), -- Blue Fig Cafe
  ('e154020e-dcbc-44a3-b3c0-3f486e0c7ce7'::uuid), -- مدرج الصداقة
  ('ce5fe7c0-c93a-4686-8a21-538e58ad76bc'::uuid), -- مدرج لؤي شموط
  ('94a82d25-d934-43e1-a026-38ef66f55bc0'::uuid), -- موقف سيارات
  ('f826f124-c95b-4044-9864-372ebef930dd'::uuid), -- IT Park
  ('3149dd2b-707f-44f6-bdf1-32f345330786'::uuid), -- مكتبة الحسن
  ('9ecde3b9-87f6-4161-8e21-3ae9632cf68e'::uuid), -- موقف سيارات
  ('4844d044-51c1-4dc8-88b1-4231ed7617c3'::uuid), -- موقف سيارات
  ('f6bf8965-8e1a-4074-afca-ad7528f9fdd5'::uuid), -- موقف سيارات
  ('1cb56bb1-5311-4bd8-8db8-b924afdece7f'::uuid), -- موقف سيارات
  ('5391af5f-e931-426a-8e2b-af54ea912692'::uuid), -- ملعب
  ('178a6655-4a6b-44ef-bd89-13404552d0c0'::uuid), -- ملعب
  ('e4750950-a9e1-473c-9378-a37005bc3fc5'::uuid) -- موقف سيارات
  ) v(x));
  get diagnostics np = row_count;
  raise notice 'moved to PSUT: % buildings, % places', nb, np;
end $$;

create or replace function public.campus_pins(p_university uuid)
returns table (id uuid, kind text, name_ar text, name_en text, sub text, lat float8, lng float8, advertiser_id uuid)
language sql stable security definer set search_path = public as $$
  select b.id, 'building', b.name_ar, b.name_en, b.code, b.lat, b.lng, null::uuid
    from buildings b where auth.uid() is not null and b.university_id = p_university and b.lat is not null
  union all
  select p.id, p.kind::text, p.name_ar, p.name_en, p.description, p.lat, p.lng, p.advertiser_id
    from places p where auth.uid() is not null and p.university_id = p_university and p.state = 'approved';
$$;
revoke all on function public.campus_pins(uuid) from public, anon;
grant execute on function public.campus_pins(uuid) to authenticated;
