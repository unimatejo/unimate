-- Crash and error reports sent by the app, so problems on real phones can be diagnosed.
create table if not exists client_errors (
  id         bigint generated always as identity primary key,
  user_id    uuid references profiles(id) on delete set null default auth.uid(),
  fatal      boolean not null default false,
  message    text not null check (char_length(message) <= 2000),
  stack      text check (char_length(stack) <= 8000),
  screen     text,
  platform   text,
  app_version text,
  created_at timestamptz not null default now()
);
alter table client_errors enable row level security;
create policy "errors report" on client_errors for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());
create policy "errors admin" on client_errors for select using (is_admin());
grant insert on client_errors to anon, authenticated;
