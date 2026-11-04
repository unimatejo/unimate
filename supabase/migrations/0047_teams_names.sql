-- UniMate · 0047 smarter Teams names: "عملي تطبيقات ذكاء-شعبة2عملي-5 نظري-خميس12:30-2:30" is the course
-- "تطبيقات ذكاء", section 2 — not a course called all of that.
create or replace function import_teams(teams jsonb)
returns int language plpgsql security definer set search_path = public as $$
declare t jsonb; nm text; code text; sec text; n int := 0;
begin
  for t in select * from jsonb_array_elements(coalesce(teams, '[]'::jsonb)) loop
    nm := translate(coalesce(t->>'displayName', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789');
    if nm ~* '(staff|موظف|عمادة|club|نادي|general|عام للطلبة)' then continue; end if;
    code := substring(nm from '\m([A-Za-z]{2,5}\s?[0-9]{3,4}|[0-9]{6,9})\M');
    if code is not null then nm := replace(nm, code, ' '); end if;
    -- the first section number wins ("شعبة2عملي-5" → 2), digits may touch Arabic letters
    sec := substring(nm from '(?:شعبة|شعبه|[Ss]ec(?:tion)?\.?|\m[Ss])\s*[:#-]?\s*([0-9]{1,3})(?![0-9])');
    nm := regexp_replace(nm, '(شعبة|شعبه|[Ss]ec(tion)?\.?|\m[Ss])\s*[:#-]?\s*[0-9]{1,3}(?![0-9])', ' ', 'g');
    -- times, days and lab/theory tags are not part of the course name
    nm := regexp_replace(nm, '[0-9]{1,2}[:.][0-9]{2}(\s*-\s*[0-9]{1,2}([:.][0-9]{2})?)?', ' ', 'g');
    nm := regexp_replace(nm, '(السبت|الأحد|الاحد|احد|الاثنين|الإثنين|اثنين|الثلاثاء|ثلاثاء|الأربعاء|الاربعاء|اربعاء|الخميس|خميس)', ' ', 'g');
    nm := regexp_replace(nm, '(عملي|نظري|مختبر|lab|Lab|LAB)', ' ', 'g');
    nm := regexp_replace(nm, '-\s*[0-9]{1,3}(?=\s|-|$)', ' ', 'g'); -- "عملي-5" style leftovers; "تفاضل وتكامل 1" keeps its 1
    nm := regexp_replace(nm, '[-_/|]+', ' ', 'g');
    nm := clean_course_name(nm);
    if char_length(nm) < 2 then nm := coalesce(t->>'displayName', ''); end if;
    if enroll_in(nm, replace(code, ' ', ''), sec, null, t->>'id', 'microsoft') is not null then n := n + 1; end if;
  end loop;
  return n;
end $$;
grant execute on function import_teams(jsonb) to authenticated;
