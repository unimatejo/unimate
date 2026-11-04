insert into communities (university_id, kind, name, description)
select u.id, 'university', u.name_ar, 'مجتمع كل طلاب الجامعة' from universities u
where not exists (select 1 from communities m where m.university_id = u.id and m.kind = 'university');
insert into communities (university_id, kind, college_id, name, description)
select c.university_id, 'college', c.id, c.name_ar, 'طلاب الكلية' from colleges c
where not exists (select 1 from communities m where m.college_id = c.id and m.kind = 'college');
update communities m set name = c.name_ar from colleges c where m.college_id = c.id and m.kind = 'college' and m.name <> c.name_ar;
