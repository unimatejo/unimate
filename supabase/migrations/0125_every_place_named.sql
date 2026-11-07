-- Every place on a campus can be told apart: one OSM left nameless («بوابة», «موقف سيارات»…) takes the name of the
-- building or named place next to it («بوابة قرب كلية الهندسة»), within 300 m, else a number. Only rows nobody named (imported, no creator, no
-- advertiser). The map pipeline runs it after each import; buildings get their labels in the 3D file itself.
create or replace function public.campus_label_places(p_university uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  -- the nearest building or named place within 300 m («بوابة قرب كلية الهندسة»)
  with a as (
    select b.name_ar n, b.lat, b.lng from buildings b
    where b.university_id = p_university and b.state = 'approved' and b.lat is not null and b.name_ar ~ '[ء-ي]'
    union all
    select x.name_ar, x.lat, x.lng from places x
    where x.university_id = p_university and x.state = 'approved' and x.name_ar ~ '[ء-ي]'
      and x.name_ar not in ('موقف سيارات','بوابة','حديقة','ملعب','صراف آلي','كافتيريا','مطعم','خدمة','موقف باص','مسجد','كشك','بنك','محل','عيادة','صيدلية','طباعة وقرطاسية','مكتبة') and x.name_ar !~ ' (قرب|[0-9]+$)'
  ), g as (
    select p.id, p.name_ar, (
      select trim(regexp_replace(split_part(split_part(a.n, '،', 1), ' - ', 1), '\s*\(.*$', '')) from a
      where a.lat between p.lat - 0.003 and p.lat + 0.003 and a.lng between p.lng - 0.0036 and p.lng + 0.0036
        and 111000 * sqrt(power(a.lat - p.lat, 2) + power((a.lng - p.lng) * cos(radians(p.lat)), 2)) < 300
      order by power(a.lat - p.lat, 2) + power((a.lng - p.lng) * cos(radians(p.lat)), 2) limit 1) a
    from places p
    where p.university_id = p_university and p.state = 'approved' and p.created_by is null and p.advertiser_id is null
      and p.name_ar in ('موقف سيارات','بوابة','حديقة','ملعب','صراف آلي','كافتيريا','مطعم','خدمة','موقف باص','مسجد','كشك','بنك','محل','عيادة','صيدلية','طباعة وقرطاسية','مكتبة')
  )
  update places p set name_ar = g.name_ar || ' قرب ' || g.a from g where p.id = g.id and length(g.a) > 1;
  get diagnostics n = row_count;
  -- nothing named near it: numbered, north to south, so each still has a name of its own («موقف سيارات 3»)
  with r as (
    select id, name_ar, row_number() over (partition by name_ar order by lat desc, lng) k from places
    where university_id = p_university and state = 'approved' and created_by is null and advertiser_id is null
      and name_ar in ('موقف سيارات','بوابة','حديقة','ملعب','صراف آلي','كافتيريا','مطعم','خدمة','موقف باص','مسجد','كشك','بنك','محل','عيادة','صيدلية','طباعة وقرطاسية','مكتبة')
  )
  update places p set name_ar = r.name_ar || ' ' || r.k from r where p.id = r.id;
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke all on function public.campus_label_places(uuid) from public, anon, authenticated;
grant execute on function public.campus_label_places(uuid) to service_role;

-- Yarmouk, after the owner's review (2026-11-07): the official plan counts as confirmation. What it names and we lacked
-- is added at the spot the fitted plan puts it (the 3D file links each to the building outline there), with the plan's
-- code; the two buildings it names differently take its name; the two English names are translated.
do $$
declare yu uuid := '1444f1f4-5b74-410a-be0a-9c1a9bd88744';
begin
  update buildings set state = 'approved', name_en = name_ar, name_ar = 'كلية السياحة والفندقة (مبنى ابن خلدون)', code = 'BD1' where id = '67f97a89-28ea-4d41-85de-80ecad2cb141' and university_id = yu;
  update buildings set state = 'approved', name_en = name_ar, name_ar = 'المقصف الرئيسي (مبنى الفارابي)', code = 'AA7' where id = 'd322dd28-3ef1-4dfc-9237-d87c55b151de' and university_id = yu;
  delete from places where university_id = yu and name_ar = 'المقصف الرئيسي (مبنى الفارابي)' and created_by is null and osm_id is null; -- added in 0124, the building now carries it
  update buildings set name_en = name_ar, name_ar = 'مبنى الصيانة' where id = '19b98624-c993-4a6f-b65f-0e18f1eeb8ec' and university_id = yu and name_ar = 'fixing bulding';
  update buildings set name_en = name_ar, name_ar = 'مكتب المشاغل الهندسية' where id = 'd328d885-c942-4f0c-892b-19e1c35cede0' and university_id = yu and name_ar = 'work office';
  update places set name_ar = 'ملاعب كرة السلة واليد الخارجية' where id = '546e0fa5-6d1b-497b-934b-df36f993e93e' and university_id = yu and name_ar = 'ملعب';
  update places set name_ar = 'ملعب كرة القدم والستاد' where id = '38427a21-1e35-4884-b462-2617aa55d6c8' and university_id = yu and name_ar = 'ملعب';

  insert into buildings (university_id, name_ar, code, lat, lng, state)
  select yu, n, c, la, ln, 'approved' from (values
    ('مبنى البوابة الرئيسية (الحراسة والاستعلامات)', 'AD7', 32.541131, 35.853046),
    ('وحدة انتاج النتروجين السائل', 'AD5', 32.54069, 35.852521),
    ('مراسم الجيولوجيا', 'AA9', 32.541394, 35.853729),
    ('مبنى المسكوكات', 'CD5', 32.535421, 35.854104),
    ('الخزان الأرضي الشمالي', 'CD3', 32.534317, 35.853778),
    ('المطبخ الرئيسي', 'CD1', 32.534641, 35.85453),
    ('مستودع القرطاسية والتجهيزات المدرسية', 'CC1', 32.534969, 35.855877),
    ('هنجر الزراعة والحدائق', 'CC2', 32.534875, 35.855591),
    ('مستودعات الصيانة (إصلاح كراسي)', 'CB1', 32.535536, 35.857365),
    ('هنجر مستودعات كيميائية', 'CB3', 32.535573, 35.856663),
    ('هنجر مستودعات قرطاسية', 'CB4', 32.535574, 35.856433),
    ('هنجر مستودعات أثاث', 'CB5', 32.536825, 35.856154),
    ('محطة المحروقات', 'CA1', 32.535683, 35.858045),
    ('المنجرة', 'CA3', 32.537059, 35.857215),
    ('البيت الزجاجي', 'CA7', 32.536362, 35.857427),
    ('مركز التصميم الأردني', 'CA9', 32.536838, 35.857709),
    ('مركز الملكة رانيا العبدالله', 'HA2', 32.530501, 35.861753)
  ) v(n, c, la, ln) where not exists (select 1 from buildings b where b.university_id = yu and b.name_ar = v.n);

  insert into places (university_id, kind, name_ar, lat, lng, state)
  select yu, k::place_kind, n, la, ln, 'approved' from (values
    ('gate', 'بوابة الملاعب', 32.541765, 35.856253),
    ('gate', 'بوابة العلاقات العامة', 32.539464, 35.851827),
    ('gate', 'بوابة المدرسة النموذجية مخرج سيارات', 32.533523, 35.852649),
    ('gate', 'بوابة المدرسة النموذجية', 32.533012, 35.855638),
    ('gate', 'البوابة الجنوبية الداخلية', 32.534846, 35.855969),
    ('sports', 'ملعب رملي', 32.541206, 35.856185)
  ) v(k, n, la, ln) where not exists (select 1 from places p where p.university_id = yu and p.name_ar = v.n);
end $$;

-- and now for every campus
select public.campus_label_places(id) from universities;
