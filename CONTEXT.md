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

## Status quo (Phase 1 complete)

- `media/usage-logger.js` — the status-line hook script. Reads stdin JSON, prints a
  null-safe one-line status bar (model, context %, 5h %, 7d %), and appends a
  snapshot to `~/.claude/team-usage/local-log.jsonl` when `five_hour_pct`,
  `seven_day_pct`, or `cost.total_cost_usd` changes since the last snapshot (tracked
  in `~/.claude/team-usage/last.json`). Wrapped in try/catch throughout — logging
  failures never blank the status bar.
- `sample-status.json` — sample payload matching Claude Code's real status-line
  schema, for offline testing: `cat sample-status.json | node media/usage-logger.js`.

Not yet built: the VS Code extension shell, Supabase sync, and the admin dashboard.
