-- UniMate · 0099 two titles only the owner can give: "مؤسس يونيميت" (founder) and "مسؤول يونيميت" (UniMate team).
-- They are never requested and never come from Microsoft or the staff list; the full title text can still be changed.
alter table profiles drop constraint if exists profiles_academic_title_check;
alter table profiles add constraint profiles_academic_title_check check (academic_title = any (array[
  'prof','assoc_prof','asst_prof','doctor','lecturer','teacher_assistant','dean','vice_dean','head','president','vice_president','staff',
  'founder','team']));
create or replace function public.title_label(p text) returns text language sql immutable set search_path = public as $$
  select case p when 'prof' then 'أستاذ دكتور' when 'assoc_prof' then 'أستاذ مشارك' when 'asst_prof' then 'أستاذ مساعد'
    when 'doctor' then 'دكتور' when 'lecturer' then 'محاضر' when 'teacher_assistant' then 'مساعد تدريس'
    when 'dean' then 'عميد' when 'vice_dean' then 'نائب عميد' when 'head' then 'رئيس قسم'
    when 'president' then 'رئيس الجامعة' when 'vice_president' then 'نائب رئيس الجامعة' when 'staff' then 'موظف'
    when 'founder' then 'مؤسس يونيميت' when 'team' then 'مسؤول يونيميت' else p end;
$$;

-- founder / team titles don't change what kind of account it is (a student stays a student)
do $$
declare src text;
begin
  select pg_get_functiondef('public.admin_set_title'::regproc) into src;
  if position('''founder''' in src) = 0 then
    execute replace(src, 'when p_title is null then account_type when p_title = ''staff''',
                         'when p_title is null or p_title in (''founder'', ''team'') then account_type when p_title = ''staff''');
  end if;
end $$;
