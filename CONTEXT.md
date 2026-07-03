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

Group snapshots by `session_id` and take the **latest** snapshot per session before
summing anything. Never sum raw rows — since `cost_usd` is cumulative within a
session, summing every row for a session would massively overcount.

## Privacy

Only aggregate numbers are ever meant to leave a machine: cost, tokens,
percentages, timestamps, model, session_id, machine, user name. Never prompts,
code, or file contents.

## Layout

- The status-line hook (`usage-logger.js`) logs locally only — no network calls.
- The VS Code extension owns wiring the hook into `~/.claude/settings.json`, reads
  the local log, and shows the developer their own usage. Later (Phase 3+) it also
  syncs aggregates to Supabase.
- The admin dashboard (a later phase) reads from Supabase, not from any single
  machine's local log.

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
  SELECT. `public.get_team_window_summary()` is a SECURITY DEFINER RPC granted to
  `anon` that returns aggregates only (one row per user_name: window_cost_usd, plus
  the latest account-wide five_hour_pct/seven_day_pct/reset timestamps) — no raw
  rows, no prompt/content data ever leave via this path. `public.latest_per_user` and
  `public.daily_usage` views are for the future admin dashboard, granted to
  `service_role` only.
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
