with c as (select c.id, c.university_id from colleges c join universities u on u.id=c.university_id where u.slug='hu' and c.name_ar='الكلية التقنية'),
ins as (
  insert into majors (university_id, college_id, name_ar, name_en, degree)
  select c.university_id, c.id, v.ar, v.en, 'diploma' from c, (values
    ('التغذية السريرية والحميات','Clinical Nutrition and Dietetics'),
    ('تحليل البيانات الضخمة','Big Data Analysis'),
    ('الطباعة ثلاثية الأبعاد والمواد المستدامة','3D Printing and Sustainable Materials'),
    ('مختبرات وفحوصات الهندسة المدنية','Civil Engineering Laboratories and Testing')) v(ar, en)
  where not exists (select 1 from majors m where m.college_id = c.id and m.name_ar = v.ar)
  returning id, university_id, college_id, name_ar
)
insert into communities (university_id, kind, college_id, major_id, name, description)
select university_id, 'major', college_id, id, name_ar, 'طلاب التخصص' from ins;
