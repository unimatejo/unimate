-- UniMate · 0127 row-level security that asks "who is this?" once per query, not once per row
--
-- Every policy that calls auth.uid(), auth.jwt(), auth.role(), my_university(), is_admin() or is_owner() directly makes
-- Postgres run that call for each row it looks at (advisor: auth_rls_initplan, 123 policies). Written as
-- (select auth.uid()) the planner runs it once and reuses the answer (an "initPlan"). Same rule, same result, a
-- fraction of the work on big tables (messages, posts, notifications…).
-- Only calls without arguments are wrapped: a call that takes a row's column (is_member(conversation_id, …)) has to
-- run per row by nature. Nothing is loosened: each policy keeps exactly its own condition.

create or replace function pg_temp.once(e text) returns text language plpgsql immutable as $$
declare s text := e;
begin
  if s is null then return null; end if;
  -- already wrapped ones are put aside first, so nothing is wrapped twice
  s := regexp_replace(s, '\(\s*SELECT\s+(auth\.(uid|jwt|role)\(\)|my_university\(\)|is_admin\(\)|is_owner\(\))(\s+AS\s+\w+)?\s*\)', '⟦\1⟧', 'gi');
  s := regexp_replace(s, '(auth\.(uid|jwt|role)\(\)|my_university\(\)|is_admin\(\)|is_owner\(\))', '(select \1)', 'g');
  s := regexp_replace(s, '⟦([^⟧]*)⟧', '(select \1)', 'g');
  return s;
end $$;

do $$
declare r record; q text; c text; n int := 0;
begin
  for r in select schemaname, tablename, policyname, cmd, qual, with_check from pg_policies where schemaname = 'public' loop
    q := pg_temp.once(r.qual); c := pg_temp.once(r.with_check);
    if q is not distinct from r.qual and c is not distinct from r.with_check then continue; end if;
    execute format('alter policy %I on %I.%I', r.policyname, r.schemaname, r.tablename)
      || case when q is not null then format(' using (%s)', q) else '' end
      || case when c is not null then format(' with check (%s)', c) else '' end;
    n := n + 1;
  end loop;
  raise notice 'policies rewritten: %', n;
end $$;
