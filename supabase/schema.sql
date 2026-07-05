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
--
-- `order by s.recorded_at, s.id` (not recorded_at alone): two snapshots for the same
-- session can share an identical recorded_at (sub-millisecond status-line renders).
-- `id` is an always-increasing identity column, so it breaks the tie in insertion
-- order — matching the extension's stable Array.sort, which preserves file order on
-- an equal timestamp. Without this, a tied pair could be ordered differently here than
-- in usage.ts, giving the extension and the dashboard different numbers for that one
-- interval.
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
      lag(s.cost_usd) over (partition by s.session_id order by s.recorded_at, s.id) as prior_cost_usd
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
      when lag(s.cost_usd) over (partition by s.session_id order by s.recorded_at, s.id) is null
        then s.cost_usd
      else greatest(
        s.cost_usd - lag(s.cost_usd) over (partition by s.session_id order by s.recorded_at, s.id),
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

-- Phase 7: multi-Room data model. A Room = account_email (the Claude account org
-- email). Applied directly to project htrxdxtbrkdabrrqbpyr via the Supabase MCP tool
-- (migration `phase7_multiroom_schema`). Kept here as source of truth / for manual
-- re-application. Phase 3's insert-only anon policy and session_cost_deltas() are
-- untouched by this phase.

alter table public.usage_snapshots
  add column if not exists account_email text;

create index if not exists usage_snapshots_account_email_recorded_at_idx
  on public.usage_snapshots (account_email, recorded_at desc);

-- One-time backfill: the pre-Phase-7 rows have no email. Replace with your Room's
-- real Claude account email if re-applying this file from scratch.
update public.usage_snapshots
set account_email = 'rashid@iocod.com'
where account_email is null;

-- Room registry: one row per Room (Claude account email), holding its display name.
-- No anon/authenticated access - dashboard server route reads/writes with service_role.
create table if not exists public.rooms (
  claude_email text primary key,
  room_name text,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
revoke all on public.rooms from anon, authenticated;
grant select, insert, update, delete on public.rooms to service_role;

-- Admin allowlist for the dashboard's Room switcher. No anon/authenticated access.
create table if not exists public.admins (
  email text primary key
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant select, insert, update, delete on public.admins to service_role;

insert into public.admins (email) values ('rashid@iocod.com')
on conflict (email) do nothing;

-- Room-scoped window summary: identical shape/logic to get_team_window_summary(),
-- filtered to one Room. session_id -> account_email is looked up via a per-session
-- mapping (distinct on session_id) rather than joining session_cost_deltas() back to
-- usage_snapshots row-for-row on (session_id, recorded_at) - two snapshots in the same
-- session can share a recorded_at (sub-ms status-line renders), which would fan out
-- and double-count. account_email is account-wide and invariant within a session, so
-- joining on session_id alone is safe. session_cost_deltas() itself is untouched -
-- this only maps its output to a Room after the fact.
create or replace function public.get_room_window_summary(p_email text)
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
    where account_email = p_email
      and (five_hour_pct is not null or seven_day_pct is not null)
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
  session_accounts as (
    select distinct on (session_id) session_id, account_email
    from public.usage_snapshots
    where session_id is not null
    order by session_id, recorded_at desc, id desc
  ),
  deltas_in_window as (
    select scd.user_name, scd.cost_delta
    from public.session_cost_deltas() scd
    join session_accounts sa on sa.session_id = scd.session_id
    cross join window_bounds wb
    where sa.account_email = p_email
      and scd.recorded_at >= wb.window_start and scd.recorded_at <= wb.window_end
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

revoke all on function public.get_room_window_summary(text) from public, anon, authenticated;
grant execute on function public.get_room_window_summary(text) to service_role;

-- Both dashboard views are recreated here Room-aware: they now carry account_email so
-- a caller (the Nuxt server route) can filter to one Room. Session cost is still read
-- exclusively through session_cost_deltas() - no delta logic is reimplemented, only
-- the session_id -> account_email mapping needed to attribute each delta to a Room.
create or replace view public.latest_per_user as
select distinct on (user_name) *
from public.usage_snapshots
order by user_name, recorded_at desc;

drop view if exists public.daily_usage;

create view public.daily_usage as
with session_accounts as (
  select distinct on (session_id) session_id, account_email
  from public.usage_snapshots
  where session_id is not null
  order by session_id, recorded_at desc, id desc
),
delta_days as (
  select
    scd.user_name,
    scd.cost_delta,
    sa.account_email,
    (scd.recorded_at at time zone 'Asia/Kolkata')::date as day
  from public.session_cost_deltas() scd
  join session_accounts sa on sa.session_id = scd.session_id
),
day_costs as (
  select account_email, user_name, day, sum(cost_delta) as total_cost_usd
  from delta_days
  group by account_email, user_name, day
),
session_days as (
  select distinct account_email, user_name, session_id, (recorded_at at time zone 'Asia/Kolkata')::date as day
  from public.usage_snapshots
  where session_id is not null
),
session_counts as (
  select account_email, user_name, day, count(*) as session_count
  from session_days
  group by account_email, user_name, day
),
daily_peaks as (
  select
    account_email,
    user_name,
    (recorded_at at time zone 'Asia/Kolkata')::date as day,
    max(five_hour_pct) as peak_5h,
    max(seven_day_pct) as peak_7d
  from public.usage_snapshots
  group by account_email, user_name, (recorded_at at time zone 'Asia/Kolkata')::date
)
select
  dp.account_email,
  dp.user_name,
  dp.day,
  dp.peak_5h,
  dp.peak_7d,
  coalesce(dc.total_cost_usd, 0) as total_cost_usd,
  coalesce(sc.session_count, 0) as session_count
from daily_peaks dp
left join day_costs dc on dc.account_email = dp.account_email and dc.user_name = dp.user_name and dc.day = dp.day
left join session_counts sc on sc.account_email = dp.account_email and sc.user_name = dp.user_name and sc.day = dp.day;

revoke all on public.latest_per_user from anon, authenticated;
revoke all on public.daily_usage from anon, authenticated;
grant select on public.latest_per_user to service_role;
grant select on public.daily_usage to service_role;

-- Admin Room switcher: one row per Room derived from usage_snapshots (a Room exists
-- once its first row arrives - no room_id/invite flow), left-joined to rooms for name.
create or replace function public.list_rooms()
returns table (
  claude_email text,
  room_name text,
  member_count bigint,
  last_active timestamptz,
  five_hour_pct numeric
)
language sql
security definer
set search_path = public
as $$
  with room_stats as (
    select
      account_email,
      count(distinct user_name) as member_count,
      max(recorded_at) as last_active
    from public.usage_snapshots
    where account_email is not null
    group by account_email
  ),
  latest_rate_limit as (
    select distinct on (account_email) account_email, five_hour_pct
    from public.usage_snapshots
    where account_email is not null and five_hour_pct is not null
    order by account_email, recorded_at desc
  )
  select
    rs.account_email as claude_email,
    r.room_name,
    rs.member_count,
    rs.last_active,
    lrl.five_hour_pct
  from room_stats rs
  left join public.rooms r on r.claude_email = rs.account_email
  left join latest_rate_limit lrl on lrl.account_email = rs.account_email
  order by rs.last_active desc;
$$;

revoke all on function public.list_rooms() from public, anon, authenticated;
grant execute on function public.list_rooms() to service_role;

-- Optional (item 7): non-sensitive Room-name lookup for the extension. Returns only
-- room_name for the given email - no usage/cost data. Tradeoff accepted: anyone with
-- the anon key can probe "does a Room with this email exist, and what's it called."
create or replace function public.get_room_name(p_email text)
returns text
language sql
security definer
set search_path = public
as $$
  select room_name from public.rooms where claude_email = p_email;
$$;

revoke all on function public.get_room_name(text) from public, authenticated;
grant execute on function public.get_room_name(text) to anon;

-- Phase 13 / edge case 13 (see DATA_SOURCES.md): token accounting was never
-- delta-based, unlike cost — get_team_window_summary()/get_room_window_summary()
-- returned each user's *latest snapshot's cumulative* total_input_tokens/
-- total_output_tokens, which both double-counts across a member's multiple parallel
-- sessions (whichever session's snapshot lands last silently overwrites the others)
-- and mis-attributes a session's pre-window tokens into the current window, exactly
-- the two bugs session_cost_deltas() was already built to avoid for cost. Applied
-- directly to project htrxdxtbrkdabrrqbpyr via the Supabase MCP tool (migration
-- `phase13_token_deltas_and_session_context`).

alter table public.usage_snapshots
  add column if not exists context_used_pct numeric;

-- Token counterpart to session_cost_deltas(). Same shape (one row per snapshot, same
-- sort key `(recorded_at, id)`, same null-session_id exclusion), kept as a SEPARATE
-- function rather than folded into session_cost_deltas() so cost and token accounting
-- stay two parallel, independently verifiable functions — identical reasoning to the
-- extension's sessionCostDeltas()/sessionTokenDeltas() split in usage.ts.
--
-- input_token_delta and output_token_delta are each computed from their OWN filtered
-- lag() window (rows where that specific field is non-null) rather than one shared
-- window over all session_id-not-null rows. This matters: if a stray snapshot has a
-- null input_tokens between two real readings, a shared window's lag() would see that
-- null as "the previous reading" and wrongly treat the next real reading as a fresh
-- session start (full value counted, not the true delta since the last real reading).
-- Filtering nulls out of each field's own window first (matching session_cost_deltas()'s
-- `where cost_usd is not null` pattern) means lag() always skips straight back to the
-- last real reading for that field — exactly mirroring the extension's
-- sessionTokenDeltas(), which only updates its "previous value" tracker on snapshots
-- that actually carry a numeric reading for that field. Verified live: readings
-- `1000 -> (null) -> 1400` produce deltas `1000, 0, 400` (sum 1400), not `1000, 1400`
-- (which would double-count the gap).
create or replace function public.session_token_deltas()
returns table (
  user_name text,
  session_id text,
  recorded_at timestamptz,
  input_token_delta numeric,
  output_token_delta numeric
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
      s.input_tokens as raw_input_tokens,
      lag(s.input_tokens) over (partition by s.session_id order by s.recorded_at, s.id) as prior_input_tokens
    from public.usage_snapshots s
    where s.session_id is not null and s.input_tokens is not null
  loop
    if anomaly.prior_input_tokens is not null and anomaly.raw_input_tokens < anomaly.prior_input_tokens then
      raise warning 'usage_snapshots session %: input_tokens dropped from % to % (known Claude Code resumed-session bug, github.com/anthropics/claude-code#13088) — ignoring the decrease',
        anomaly.session_id, anomaly.prior_input_tokens, anomaly.raw_input_tokens;
    end if;
  end loop;

  for anomaly in
    select
      s.session_id,
      s.output_tokens as raw_output_tokens,
      lag(s.output_tokens) over (partition by s.session_id order by s.recorded_at, s.id) as prior_output_tokens
    from public.usage_snapshots s
    where s.session_id is not null and s.output_tokens is not null
  loop
    if anomaly.prior_output_tokens is not null and anomaly.raw_output_tokens < anomaly.prior_output_tokens then
      raise warning 'usage_snapshots session %: output_tokens dropped from % to % (known Claude Code resumed-session bug, github.com/anthropics/claude-code#13088) — ignoring the decrease',
        anomaly.session_id, anomaly.prior_output_tokens, anomaly.raw_output_tokens;
    end if;
  end loop;

  return query
  with input_deltas as (
    select
      s.id,
      case
        when lag(s.input_tokens) over (partition by s.session_id order by s.recorded_at, s.id) is null
          then s.input_tokens
        else greatest(
          s.input_tokens - lag(s.input_tokens) over (partition by s.session_id order by s.recorded_at, s.id),
          0
        )
      end as input_token_delta
    from public.usage_snapshots s
    where s.session_id is not null and s.input_tokens is not null
  ),
  output_deltas as (
    select
      s.id,
      case
        when lag(s.output_tokens) over (partition by s.session_id order by s.recorded_at, s.id) is null
          then s.output_tokens
        else greatest(
          s.output_tokens - lag(s.output_tokens) over (partition by s.session_id order by s.recorded_at, s.id),
          0
        )
      end as output_token_delta
    from public.usage_snapshots s
    where s.session_id is not null and s.output_tokens is not null
  )
  select
    s.user_name,
    s.session_id,
    s.recorded_at,
    coalesce(id_.input_token_delta, 0) as input_token_delta,
    coalesce(od.output_token_delta, 0) as output_token_delta
  from public.usage_snapshots s
  left join input_deltas id_ on id_.id = s.id
  left join output_deltas od on od.id = s.id
  where s.session_id is not null;
end;
$$;

revoke all on function public.session_token_deltas() from public, anon, authenticated;

-- get_team_window_summary() and get_room_window_summary(text) now also return
-- window_input_tokens/window_output_tokens, summed from session_token_deltas() filtered
-- by the same window_bounds already used for cost — a separate aggregation, not a join
-- against session_cost_deltas(), since a snapshot can carry tokens without cost (or vice
-- versa) and the two delta functions independently decide which rows they emit for.
-- Adding output columns requires DROP + CREATE (CREATE OR REPLACE cannot change a
-- function's return shape) — grants are re-issued below since DROP revokes them.
drop function if exists public.get_team_window_summary();

create function public.get_team_window_summary()
returns table (
  user_name text,
  window_cost_usd numeric,
  window_input_tokens numeric,
  window_output_tokens numeric,
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
  cost_by_user as (
    select scd.user_name, sum(coalesce(scd.cost_delta, 0)) as window_cost_usd
    from public.session_cost_deltas() scd
    cross join window_bounds wb
    where scd.recorded_at >= wb.window_start and scd.recorded_at <= wb.window_end
    group by scd.user_name
  ),
  tokens_by_user as (
    select
      std.user_name,
      sum(coalesce(std.input_token_delta, 0)) as window_input_tokens,
      sum(coalesce(std.output_token_delta, 0)) as window_output_tokens
    from public.session_token_deltas() std
    cross join window_bounds wb
    where std.recorded_at >= wb.window_start and std.recorded_at <= wb.window_end
    group by std.user_name
  ),
  users as (
    select user_name from cost_by_user
    union
    select user_name from tokens_by_user
  )
  select
    u.user_name,
    coalesce(cbu.window_cost_usd, 0) as window_cost_usd,
    coalesce(tbu.window_input_tokens, 0) as window_input_tokens,
    coalesce(tbu.window_output_tokens, 0) as window_output_tokens,
    lrl.five_hour_pct as account_five_hour_pct,
    lrl.seven_day_pct as account_seven_day_pct,
    lrl.five_hour_resets_at,
    lrl.seven_day_resets_at
  from users u
  left join cost_by_user cbu on cbu.user_name = u.user_name
  left join tokens_by_user tbu on tbu.user_name = u.user_name
  cross join latest_rate_limits lrl;
$$;

revoke all on function public.get_team_window_summary() from public;
revoke all on function public.get_team_window_summary() from authenticated;
grant execute on function public.get_team_window_summary() to anon;

drop function if exists public.get_room_window_summary(text);

create function public.get_room_window_summary(p_email text)
returns table (
  user_name text,
  window_cost_usd numeric,
  window_input_tokens numeric,
  window_output_tokens numeric,
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
    where account_email = p_email
      and (five_hour_pct is not null or seven_day_pct is not null)
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
  session_accounts as (
    select distinct on (session_id) session_id, account_email
    from public.usage_snapshots
    where session_id is not null
    order by session_id, recorded_at desc, id desc
  ),
  cost_by_user as (
    select scd.user_name, sum(coalesce(scd.cost_delta, 0)) as window_cost_usd
    from public.session_cost_deltas() scd
    join session_accounts sa on sa.session_id = scd.session_id
    cross join window_bounds wb
    where sa.account_email = p_email
      and scd.recorded_at >= wb.window_start and scd.recorded_at <= wb.window_end
    group by scd.user_name
  ),
  tokens_by_user as (
    select
      std.user_name,
      sum(coalesce(std.input_token_delta, 0)) as window_input_tokens,
      sum(coalesce(std.output_token_delta, 0)) as window_output_tokens
    from public.session_token_deltas() std
    join session_accounts sa on sa.session_id = std.session_id
    cross join window_bounds wb
    where sa.account_email = p_email
      and std.recorded_at >= wb.window_start and std.recorded_at <= wb.window_end
    group by std.user_name
  ),
  users as (
    select user_name from cost_by_user
    union
    select user_name from tokens_by_user
  )
  select
    u.user_name,
    coalesce(cbu.window_cost_usd, 0) as window_cost_usd,
    coalesce(tbu.window_input_tokens, 0) as window_input_tokens,
    coalesce(tbu.window_output_tokens, 0) as window_output_tokens,
    lrl.five_hour_pct as account_five_hour_pct,
    lrl.seven_day_pct as account_seven_day_pct,
    lrl.five_hour_resets_at,
    lrl.seven_day_resets_at
  from users u
  left join cost_by_user cbu on cbu.user_name = u.user_name
  left join tokens_by_user tbu on tbu.user_name = u.user_name
  cross join latest_rate_limits lrl;
$$;

revoke all on function public.get_room_window_summary(text) from public, anon, authenticated;
grant execute on function public.get_room_window_summary(text) to service_role;
