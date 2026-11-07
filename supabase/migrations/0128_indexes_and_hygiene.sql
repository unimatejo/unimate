-- UniMate · 0128 indexes for every foreign key, keys for the two log tables, fixed search paths
--
-- 80 foreign keys had no index on their column (advisor: unindexed_foreign_keys). Each one makes a join or filter on
-- that column read the whole table, and deleting a profile (account deletion cascades) scan every child table.
-- Created only where missing, named <table>_<column>_fk_idx. The tables are small today, so building them is instant.

do $$
declare r record; n int := 0;
begin
  for r in
    select c.conrelid::regclass as t, (select relname from pg_class where oid = c.conrelid) as tn, a.attname as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1])
  loop
    execute format('create index if not exists %I on %s (%I)', left(r.tn || '_' || r.col, 56) || '_fk_idx', r.t, r.col);
    n := n + 1;
  end loop;
  raise notice 'foreign-key indexes created: %', n;
end $$;

-- the two log tables had no primary key (advisor: no_primary_key)
alter table private.alert_log add column if not exists id bigint generated always as identity;
alter table private.alert_log add primary key (id);
alter table private.quota_log add column if not exists id bigint generated always as identity;
alter table private.quota_log add primary key (id);

-- functions whose search path could be changed by the caller (advisor: function_search_path_mutable)
alter function private.looks_personal set search_path = '';
alter function private.osm_stage_guard set search_path = '';
