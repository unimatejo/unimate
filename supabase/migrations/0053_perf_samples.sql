-- UniMate · 0053 performance reports: how long key screens take to show data, and slow requests (> 2s).
create table if not exists public.perf_samples (
  id         bigserial primary key,
  user_id    uuid references profiles(id) on delete set null default auth.uid(),
  kind       text not null check (kind in ('screen', 'query')),
  name       text not null check (char_length(name) <= 80),
  ms         integer not null check (ms between 0 and 600000),
  platform   text check (char_length(platform) <= 20),
  app_version text check (char_length(app_version) <= 40),
  created_at timestamptz not null default now()
);
create index if not exists perf_samples_time_idx on perf_samples(created_at desc);
alter table perf_samples enable row level security;
drop policy if exists "perf insert own" on perf_samples;
create policy "perf insert own" on perf_samples for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "perf admins read" on perf_samples;
create policy "perf admins read" on perf_samples for select using (is_admin());

-- p50 / p90 per screen or request for the last N hours, plus the slowest single samples
create or replace function public.admin_perf_summary(hours int default 24)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform admin_require();
  select jsonb_build_object(
    'groups', coalesce((select jsonb_agg(g order by g->>'p90' desc) from (
      select jsonb_build_object('kind', kind, 'name', name, 'n', count(*),
        'p50', round(percentile_cont(0.5) within group (order by ms)), 'p90', round(percentile_cont(0.9) within group (order by ms))) g
      from perf_samples where created_at > now() - make_interval(hours => hours) group by kind, name) x), '[]'),
    'slowest', coalesce((select jsonb_agg(s) from (
      select jsonb_build_object('kind', kind, 'name', name, 'ms', ms, 'platform', platform, 'at', created_at) s
      from perf_samples where created_at > now() - make_interval(hours => hours) order by ms desc limit 15) y), '[]')
  ) into r;
  return r;
end $$;
grant execute on function public.admin_perf_summary(int) to authenticated;

do $$ begin perform cron.unschedule('purge-perf-samples'); exception when others then null; end $$;
select cron.schedule('purge-perf-samples', '23 4 * * *', $c$delete from public.perf_samples where created_at < now() - interval '30 days'$c$);
