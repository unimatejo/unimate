-- Nothing a student made is lost for good: every deleted row of the important tables (including rows
-- removed by a cascade) is copied here first. Only the server can read it; admins restore from it.
-- Chat messages are left out on purpose: people send them on the promise that they vanish.
create schema if not exists archive;
revoke all on schema archive from public, anon, authenticated;

create table if not exists archive.deleted_rows (
  id bigserial primary key,
  tbl text not null,
  row_id text,
  row jsonb not null,
  deleted_at timestamptz not null default now(),
  deleted_by uuid
);
create index if not exists deleted_rows_tbl on archive.deleted_rows (tbl, row_id);
create index if not exists deleted_rows_owner on archive.deleted_rows ((row->>'author_id'), (row->>'user_id'), (row->>'id'));

create or replace function archive.keep_row() returns trigger language plpgsql security definer set search_path = public, archive as $$
begin
  insert into archive.deleted_rows (tbl, row_id, row, deleted_by)
  values (tg_table_name, coalesce(to_jsonb(old)->>'id', to_jsonb(old)->>'user_id'), to_jsonb(old), auth.uid());
  return old;
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','profile_private','posts','post_media','comments','post_likes','post_saves','stories','highlights','highlight_items',
    'follows','close_friends','blocks','enrollments','personal_meetings','meeting_changes','section_meetings','sections','courses','academic_events','reminders',
    'communities','community_members','conversations','conversation_members','colleges','majors','universities','buildings','places','place_aliases','rooms',
    'notification_prefs','admins','advertisers','ad_campaigns','support_tickets','swap_requests','study_requests','study_intents'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists keep_deleted on public.%I', t);
      execute format('create trigger keep_deleted before delete on public.%I for each row execute function archive.keep_row()', t);
    end if;
  end loop;
end $$;

-- the logins themselves (email, Microsoft link) too
create or replace function archive.keep_auth_user() returns trigger language plpgsql security definer set search_path = public, archive, auth as $$
begin
  insert into archive.deleted_rows (tbl, row_id, row) values ('auth.users', old.id::text,
    jsonb_build_object('id', old.id, 'email', old.email, 'created_at', old.created_at, 'raw_user_meta_data', old.raw_user_meta_data,
      'identities', (select jsonb_agg(jsonb_build_object('provider', i.provider, 'provider_id', i.provider_id, 'email', i.identity_data->>'email')) from auth.identities i where i.user_id = old.id)));
  return old;
end $$;
drop trigger if exists keep_deleted on auth.users;
create trigger keep_deleted before delete on auth.users for each row execute function archive.keep_auth_user();
