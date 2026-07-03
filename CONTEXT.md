# Context for future sessions

## Goal

Per-device usage tracking on one shared Claude Max account, used by 3 developers
across 3 separate Macs. Each developer should be able to see their own share of the
account's 5-hour and 7-day rate limits.

## Data source

Claude Code's status-line JSON, delivered on stdin to the status-line hook script
(`media/usage-logger.js`), on every render.

Never parse `~/.claude/projects/*.jsonl` — its token counts are known-buggy
placeholders (input tokens are written as a streaming placeholder and are
100x+ too low). The status-line `cost` and token totals are the accurate source.

## Two numbers, one account-wide, one per-device

- `rate_limits.five_hour.used_percentage` / `rate_limits.seven_day.used_percentage`
  are **account-wide**: identical on every machine at any given instant.
- `cost.total_cost_usd` is **per-device, per-session**, and **cumulative within a
  session** (it grows as the session continues, it is not a delta).

## Per-device slice formula

```
device_slice = (device_window_cost / total_window_cost) * account_5h_pct
```

`device_window_cost` and `total_window_cost` are computed from snapshots inside the
current 5-hour window (see aggregation rule below).

## Aggregation rule

Never sum raw `cost_usd` rows directly — it's cumulative within a session, so summing
every row would massively overcount. Instead, walk each session's snapshots in time
order and convert them to **per-snapshot deltas**: each snapshot contributes
`max(0, cost_usd - previous cost_usd for this session)` (the session's first snapshot
counts in full, since there's no earlier reading to diff against).

Two things this buys, both required — see DATA_SOURCES.md for the full edge-case
writeup and the concrete test cases that caught each one:

1. **Resume-cost-reset protection.** Claude Code has a known bug where a resumed
   session's `cost.total_cost_usd` can reset to a value lower than an earlier snapshot
   in the same session (https://github.com/anthropics/claude-code/issues/13088). The
   `max(0, ...)` clamp means a drop contributes zero (logged as a one-line warning)
   instead of corrupting the total. This is deliberately delta-based rather than
   "clamp to the highest cost_usd seen so far" (a simpler running-max approach that
   was tried and replaced) — running-max hides real spend that accrues between a reset
   and the point the total climbs back past its old peak: readings `[5, 8, 2, 4, 6, 9]`
   should total **15** (every real increase), not **9** (the running max).
2. **Correct window/day attribution.** Each delta must be attributed to the
   window/day of the snapshot it actually happened at — NOT to whichever bucket the
   session's *latest* snapshot lands in. A session spanning a 5-hour window or a
   calendar day boundary must have its cost split between the buckets it actually
   occurred in. (An earlier version of this fix computed one pre-summed total per
   session and attributed all of it to the latest snapshot's bucket — that was caught
   as still wrong: a session with $5 spent before a window opened and $4 inside it
   reported $9 for the window, not $4.)

Implemented identically in two places, which must be kept in sync:
- Extension: `extension/src/usage.ts`, `sessionCostDeltas()` — returns one event per
  snapshot; callers (`summarizeCurrentWindow`, `dailyPeaks`) filter/group events by
  their own timestamp.
- Supabase: `public.session_cost_deltas()` (`supabase/schema.sql`) — same shape, one
  row per snapshot. Both `get_team_window_summary()` and `daily_usage` read session
  cost through it — no other function/view should reimplement this independently.

## Privacy

Only aggregate numbers are ever meant to leave a machine: cost, tokens,
percentages, timestamps, model, session_id, machine, user name. Never prompts,
code, or file contents.

## Layout

Repo root: `extension/` (the VS Code extension), `dashboard/` (the Nuxt admin
dashboard), `supabase/` (shared schema, sibling to both), `CONTEXT.md`,
`BUILD_GUIDE.md`.

- The status-line hook (`extension/media/usage-logger.js`) logs locally only — no
  network calls.
- The VS Code extension (`extension/`) owns wiring the hook into
  `~/.claude/settings.json`, reads the local log, and shows the developer their own
  usage. Later (Phase 3+) it also syncs aggregates to Supabase.
- The admin dashboard (`dashboard/`, a later phase) reads from Supabase, not from
  any single machine's local log.

## Status quo (Phase 2 complete)

- `media/usage-logger.js` — the status-line hook script. Reads stdin JSON, prints a
  null-safe one-line status bar (model, context %, 5h %, 7d %), and appends a
  snapshot to `~/.claude/team-usage/local-log.jsonl` when `five_hour_pct`,
  `seven_day_pct`, or `cost.total_cost_usd` changes since the last snapshot (tracked
  in `~/.claude/team-usage/last.json`). Wrapped in try/catch throughout — logging
  failures never blank the status bar.
- `sample-status.json` — sample payload matching Claude Code's real status-line
  schema, for offline testing: `cat sample-status.json | node media/usage-logger.js`.
- VS Code extension (`src/extension.ts`, `src/usage.ts`) — on activation, copies
  `media/usage-logger.js` into `~/.claude/team-usage/` and points
  `~/.claude/settings.json`'s `statusLine` at the copied file (asking first, and
  backing up to `settings.json.bak`, if a different `statusLine` is already
  configured). Shows a status bar item (account 5h % + the developer's own cost this
  window, refreshed every 30s from the local log only) and a
  "Claude Usage: Show my usage" command that opens a webview with 5h/7d progress
  bars, the developer's cost/tokens this window, and a table of daily peaks — all
  computed from the local log.

## Status quo (Phase 3 complete)

- Supabase project `htrxdxtbrkdabrrqbpyr` (region ap-southeast-1) holds
  `public.usage_snapshots` (schema in `supabase/schema.sql`, applied directly via the
  Supabase MCP tool — that file is kept as source of truth / for manual
  re-application). RLS is enabled: `anon` can INSERT only (`with check (true)`), never
  SELECT. `public.session_cost_deltas()` is a SECURITY DEFINER helper (not grantable to
  anon/authenticated) that returns one delta per snapshot, keyed by `session_id` and
  `recorded_at` (see Aggregation rule above). `public.get_team_window_summary()` is a
  SECURITY DEFINER RPC granted to `anon`, built on top of `session_cost_deltas()`
  (filtering deltas by window before summing), that returns aggregates only (one row
  per user_name: window_cost_usd, plus the latest account-wide
  five_hour_pct/seven_day_pct/reset timestamps) — no raw rows, no prompt/content data
  ever leave via this path. `public.latest_per_user` and `public.daily_usage` views are
  for the future admin dashboard, granted to `service_role` only; `daily_usage` also
  reads session cost through `session_cost_deltas()` (filtering deltas by day).
- `src/identity.ts` resolves a per-developer label (config override → git global
  email/name → generated `~/.claude/team-usage/device-id.txt`) for labeling only —
  no login, no auth. Cached in memory once per extension session.
- `src/supabaseClient.ts` / `src/sync.ts` / `src/team.ts` — the extension's 30s timer
  (in `src/extension.ts`) now also uploads unsynced `local-log.jsonl` lines to
  `usage_snapshots` (cursor tracked in `globalState`, only advanced on HTTP success)
  and calls `get_team_window_summary()` to show "you ≈ X% of the shared 5h limit
  (team at Y%)" in the status bar and panel. Sync is additive and silent: if
  `claudeUsage.supabaseUrl` / `claudeUsage.supabaseAnonKey` are unset, or the RPC is
  unreachable, everything falls back to the Phase 2 local-only display — the local
  log stays the source of truth.
- New settings: `claudeUsage.supabaseUrl`, `claudeUsage.supabaseAnonKey`,
  `claudeUsage.userNameOverride`. `supabaseUrl`/`supabaseAnonKey` default to the
  shared team project's URL and publishable/anon key (safe to ship — insert-only,
  aggregates-only RPC) so the extension works with zero manual setup out of the box;
  `userNameOverride` defaults to empty (auto-derived from git identity). Setting
  either of the first two to an empty string disables sync entirely.

Not yet built: the admin dashboard (Phase 4+), which will read `latest_per_user` /
`daily_usage` with the service_role key.
