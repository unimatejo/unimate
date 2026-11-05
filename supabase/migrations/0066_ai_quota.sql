-- Schedule photo reading uses a paid AI model: one account can't run it without limit (15 per day; admins unlimited).
create table if not exists private.quota_log (
  user_id uuid not null, kind text not null, at timestamptz not null default now()
);
create index if not exists quota_log_idx on private.quota_log(user_id, kind, at desc);

create or replace function public.take_ai_quota(p_kind text default 'schedule_import')
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is null then return false; end if;
  if is_admin() then return true; end if;
  select count(*) into n from private.quota_log where user_id = auth.uid() and kind = p_kind and at > now() - interval '1 day';
  if n >= 15 then return false; end if;
  insert into private.quota_log(user_id, kind) values (auth.uid(), p_kind);
  delete from private.quota_log where at < now() - interval '7 days';
  return true;
end $$;
revoke all on function public.take_ai_quota(text) from public, anon;
grant execute on function public.take_ai_quota(text) to authenticated;
