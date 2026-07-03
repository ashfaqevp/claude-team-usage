-- Phase 3: Supabase sync for claude-team-usage.
-- Applied directly to project htrxdxtbrkdabrrqbpyr via the Supabase MCP tool.
-- Kept here as the source of truth / for manual re-application if ever needed.

create table if not exists public.usage_snapshots (
  id bigint generated always as identity primary key,
  user_name text not null,
  machine text,
  session_id text,
  cost_usd numeric,
  five_hour_pct numeric,
  five_hour_resets_at timestamptz,
  seven_day_pct numeric,
  seven_day_resets_at timestamptz,
  model text,
  input_tokens numeric,
  output_tokens numeric,
  recorded_at timestamptz not null,
  inserted_at timestamptz not null default now()
);

create index if not exists usage_snapshots_user_recorded_idx
  on public.usage_snapshots (user_name, recorded_at desc);

create index if not exists usage_snapshots_session_idx
  on public.usage_snapshots (session_id);

alter table public.usage_snapshots enable row level security;

-- Anon (the extension, via the publishable/anon key) may INSERT only. No SELECT/UPDATE/DELETE.
revoke all on public.usage_snapshots from anon;
grant insert on public.usage_snapshots to anon;

create policy "anon can insert usage snapshots"
  on public.usage_snapshots
  for insert
  to anon
  with check (true);

-- Aggregates-only RPC for the extension's team view. SECURITY DEFINER so it can read
-- raw rows (owned by postgres, which bypasses RLS) while anon itself never can.
-- Returns one row per user_name for the CURRENT 5-hour window (derived from the most
-- recent five_hour_resets_at seen across all rows), plus the latest account-wide
-- five_hour_pct / seven_day_pct / reset timestamps repeated on every row.
create or replace function public.get_team_window_summary()
returns table (
  user_name text,
  window_cost_usd numeric,
  account_five_hour_pct numeric,
  account_seven_day_pct numeric,
  five_hour_resets_at timestamptz,
  seven_day_resets_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  with latest_rate_limits as (
    select five_hour_pct, seven_day_pct, five_hour_resets_at, seven_day_resets_at
    from public.usage_snapshots
    where five_hour_pct is not null or seven_day_pct is not null
    order by recorded_at desc
    limit 1
  ),
  window_bounds as (
    select
      five_hour_resets_at - interval '5 hours' as window_start,
      five_hour_resets_at as window_end
    from latest_rate_limits
    where five_hour_resets_at is not null
  ),
  latest_per_session as (
    select distinct on (session_id)
      s.user_name, s.session_id, s.cost_usd, s.recorded_at
    from public.usage_snapshots s
    where s.session_id is not null
    order by s.session_id, s.recorded_at desc
  )
  select
    lps.user_name,
    sum(coalesce(lps.cost_usd, 0)) as window_cost_usd,
    lrl.five_hour_pct as account_five_hour_pct,
    lrl.seven_day_pct as account_seven_day_pct,
    lrl.five_hour_resets_at,
    lrl.seven_day_resets_at
  from latest_per_session lps
  cross join latest_rate_limits lrl
  cross join window_bounds wb
  where lps.recorded_at >= wb.window_start and lps.recorded_at <= wb.window_end
  group by lps.user_name, lrl.five_hour_pct, lrl.seven_day_pct, lrl.five_hour_resets_at, lrl.seven_day_resets_at;
$$;

revoke all on function public.get_team_window_summary() from public;
revoke all on function public.get_team_window_summary() from authenticated;
grant execute on function public.get_team_window_summary() to anon;

-- Dashboard-only views (service_role reads these with the secret key). No grants to
-- anon/authenticated — these expose one row per user, which is more than the
-- aggregates-only RPC returns to the extension.
create or replace view public.latest_per_user as
select distinct on (user_name) *
from public.usage_snapshots
order by user_name, recorded_at desc;

create or replace view public.daily_usage as
with per_session as (
  select distinct on (user_name, session_id)
    user_name,
    session_id,
    cost_usd,
    recorded_at,
    (recorded_at at time zone 'Asia/Kolkata')::date as day
  from public.usage_snapshots
  where session_id is not null
  order by user_name, session_id, recorded_at desc
),
daily_peaks as (
  select
    user_name,
    (recorded_at at time zone 'Asia/Kolkata')::date as day,
    max(five_hour_pct) as peak_5h,
    max(seven_day_pct) as peak_7d
  from public.usage_snapshots
  group by user_name, (recorded_at at time zone 'Asia/Kolkata')::date
)
select
  dp.user_name,
  dp.day,
  dp.peak_5h,
  dp.peak_7d,
  coalesce(sum(ps.cost_usd), 0) as total_cost_usd,
  count(ps.session_id) as session_count
from daily_peaks dp
left join per_session ps on ps.user_name = dp.user_name and ps.day = dp.day
group by dp.user_name, dp.day, dp.peak_5h, dp.peak_7d;

revoke all on public.latest_per_user from anon, authenticated;
revoke all on public.daily_usage from anon, authenticated;
grant select on public.latest_per_user to service_role;
grant select on public.daily_usage to service_role;
