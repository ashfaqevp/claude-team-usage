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

-- Shared helper: one row PER SNAPSHOT (not per session), each carrying only the
-- increase over that session's previous snapshot, clamped to zero on drops. Claude
-- Code has a known bug where a resumed session's cost.total_cost_usd can reset to a
-- value lower than an earlier snapshot in the same session
-- (https://github.com/anthropics/claude-code/issues/13088); a warning is logged
-- (visible in Postgres logs) whenever a drop is detected and ignored, without blocking
-- the rest of the query.
--
-- Returning per-snapshot deltas (rather than one pre-summed total per session) lets
-- callers filter/group by each delta's own recorded_at — e.g. by 5-hour window or by
-- calendar day — so a session that spans a window or day boundary gets its cost split
-- correctly between them, instead of dumping its entire lifetime total into whichever
-- bucket its latest snapshot happens to land in. Both get_team_window_summary and
-- daily_usage read session cost through this function so the two stay consistent.
--
-- Rows with a null session_id are deliberately excluded (see `where session_id is not
-- null` below) rather than each treated as its own one-off session — the extension
-- side does the same (sessionCostDeltas() in usage.ts), after an earlier version there
-- gave each one a synthetic key and double-counted. Excluding is a safe undercount;
-- synthesizing a key is not. Keep both sides matching if this ever changes.
create or replace function public.session_cost_deltas()
returns table (
  user_name text,
  session_id text,
  recorded_at timestamptz,
  cost_delta numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  anomaly record;
begin
  for anomaly in
    select
      s.session_id,
      s.cost_usd as raw_cost_usd,
      lag(s.cost_usd) over (partition by s.session_id order by s.recorded_at) as prior_cost_usd
    from public.usage_snapshots s
    where s.session_id is not null and s.cost_usd is not null
  loop
    if anomaly.prior_cost_usd is not null and anomaly.raw_cost_usd < anomaly.prior_cost_usd then
      raise warning 'usage_snapshots session %: cost_usd dropped from % to % (known Claude Code resumed-session bug, github.com/anthropics/claude-code#13088) — ignoring the decrease',
        anomaly.session_id, anomaly.prior_cost_usd, anomaly.raw_cost_usd;
    end if;
  end loop;

  return query
  select
    s.user_name,
    s.session_id,
    s.recorded_at,
    case
      when lag(s.cost_usd) over (partition by s.session_id order by s.recorded_at) is null
        then s.cost_usd
      else greatest(
        s.cost_usd - lag(s.cost_usd) over (partition by s.session_id order by s.recorded_at),
        0
      )
    end as cost_delta
  from public.usage_snapshots s
  where s.session_id is not null and s.cost_usd is not null;
end;
$$;

revoke all on function public.session_cost_deltas() from public, anon, authenticated;

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
  deltas_in_window as (
    select scd.user_name, scd.cost_delta
    from public.session_cost_deltas() scd
    cross join window_bounds wb
    where scd.recorded_at >= wb.window_start and scd.recorded_at <= wb.window_end
  )
  select
    diw.user_name,
    sum(coalesce(diw.cost_delta, 0)) as window_cost_usd,
    lrl.five_hour_pct as account_five_hour_pct,
    lrl.seven_day_pct as account_seven_day_pct,
    lrl.five_hour_resets_at,
    lrl.seven_day_resets_at
  from deltas_in_window diw
  cross join latest_rate_limits lrl
  group by diw.user_name, lrl.five_hour_pct, lrl.seven_day_pct, lrl.five_hour_resets_at, lrl.seven_day_resets_at;
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
with delta_days as (
  select
    scd.user_name,
    scd.cost_delta,
    (scd.recorded_at at time zone 'Asia/Kolkata')::date as day
  from public.session_cost_deltas() scd
),
day_costs as (
  select user_name, day, sum(cost_delta) as total_cost_usd
  from delta_days
  group by user_name, day
),
-- Distinct (user, session, day) combos a session had any activity in, so a session
-- spanning multiple days counts toward each day it was actually active — consistent
-- with cost now being split the same way, rather than only counting on the day of its
-- latest snapshot.
session_days as (
  select distinct user_name, session_id, (recorded_at at time zone 'Asia/Kolkata')::date as day
  from public.usage_snapshots
  where session_id is not null
),
session_counts as (
  select user_name, day, count(*) as session_count
  from session_days
  group by user_name, day
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
  coalesce(dc.total_cost_usd, 0) as total_cost_usd,
  coalesce(sc.session_count, 0) as session_count
from daily_peaks dp
left join day_costs dc on dc.user_name = dp.user_name and dc.day = dp.day
left join session_counts sc on sc.user_name = dp.user_name and sc.day = dp.day;

revoke all on public.latest_per_user from anon, authenticated;
revoke all on public.daily_usage from anon, authenticated;
grant select on public.latest_per_user to service_role;
grant select on public.daily_usage to service_role;
