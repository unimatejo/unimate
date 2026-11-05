-- Defence in depth on table rights (row rules already block all of this; now the rights are gone too):
-- visitors who aren't signed in can only read what the row rules allow, and report a client error.
-- Nobody using the app can empty a table, add triggers or reference tables directly.
-- Also removes user_badges(): the badges row was taken out of the app.

do $$ declare r record; begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
    execute format('revoke insert, update, delete, truncate, trigger, references on public.%I from anon', r.relname);
    execute format('revoke truncate, trigger, references on public.%I from authenticated', r.relname);
  end loop;
end $$;
grant insert on public.client_errors to anon;

-- the same for tables made later
alter default privileges in schema public revoke insert, update, delete, truncate, trigger, references on tables from anon;
alter default privileges in schema public revoke truncate, trigger, references on tables from authenticated;

drop function if exists public.user_badges(uuid);
