do $$
declare uju uuid := (select id from universities where slug='ju');
  uyu uuid := (select id from universities where slug='yu');
  ubau uuid := (select id from universities where slug='bau');
  uaabu uuid := (select id from universities where slug='aabu');
  keep uuid; old uuid;
begin
  update colleges set name_ar='كلية العلوم الأساسية والبحرية والتمريض - فرع العقبة', name_en='Faculty of Basic and Marine Sciences and Nursing - Aqaba' where university_id=uju and name_ar='كلية العلوم الأساسية والبحرية - فرع العقبة' returning id into keep;
  select id into old from colleges where university_id=uju and name_ar='كلية التمريض - فرع العقبة';
  if keep is not null and old is not null then
    update profiles set college_id=keep where college_id=old;
    begin update majors set college_id=keep where college_id=old; exception when others then null; end;
    begin delete from colleges where id=old; exception when others then null; end;
  end if;
  insert into colleges (university_id,name_ar,name_en) select uyu,'الكلية التقنية','Technical College' where not exists (select 1 from colleges where university_id=uyu and name_ar='الكلية التقنية');
  insert into colleges (university_id,name_ar,name_en) select ubau,'كلية السلط التقنية','Salt Technical College' where not exists (select 1 from colleges where university_id=ubau and name_ar='كلية السلط التقنية');
  update colleges set name_ar='كلية السلط للعلوم التربوية والإنسانية' where university_id=ubau and name_ar='كلية السلط للعلوم الإنسانية';
  insert into colleges (university_id,name_ar,name_en) select uaabu,'كلية التربية البدنية وعلوم الرياضة','Faculty of Physical Education and Sport Sciences' where not exists (select 1 from colleges where university_id=uaabu and name_ar like 'كلية التربية البدنية%');
  update colleges set name_ar='كلية الأعمال', name_en='Faculty of Business' where university_id=uaabu and name_ar='كلية الاقتصاد والعلوم الادارية';
  update colleges set name_ar='كلية الحقوق' where university_id=uaabu and name_ar='كلية القانون';
  update colleges set name_ar='كلية الأميرة سلمى بنت عبدالله للتمريض' where university_id=uaabu and name_ar='كليه الاميره سلمى للتمريض';
  update colleges set name_ar='كلية علوم الأرض والبيئة' where university_id=uaabu and name_ar='معهد علوم الارض و البيئة';
end $$;
