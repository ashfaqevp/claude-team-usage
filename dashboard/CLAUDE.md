# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The admin dashboard for the Claude team usage project: a Nuxt 4 app that shows, for a
Claude Max plan account shared by 3 developers, each developer's estimated slice of
the account-wide 5-hour/7-day rate limit, their window cost/tokens/model, and a daily
usage log. It's one of three pieces in the parent repo (`../extension/` is the VS Code
extension that logs and syncs usage; `../supabase/` is the shared schema); read
`../CONTEXT.md` for the full system design before making changes here — it explains
the per-device slice formula and the session cost delta aggregation rule that this
dashboard's data ultimately depends on.

This directory is a separate pnpm project (own `package.json`) inside the parent git
repo — there is no root-level build tooling shared with `extension/`.

## Commands

Run from inside `dashboard/`:

- `pnpm install` — install dependencies
- `pnpm dev` — start the dev server (http://localhost:3000)
- `pnpm build` — production build
- `pnpm preview` — locally preview the production build
- `pnpm generate` — static generation

No test suite or lint script is configured.

## Configuration

`dashboard/.env` (gitignored, never commit) must set:
```
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
```
These are read into `nuxt.config.ts`'s `runtimeConfig` (server-only, not `public`) —
the secret/service-role key must never be exposed to the browser.

## Architecture

- `server/api/team-summary.get.ts` is the **only** place the Supabase secret key is
  used. It's a Nitro server route that calls Supabase's REST/RPC endpoints
  server-side with the service-role key: the `get_team_window_summary()` RPC, plus
  the `latest_per_user` and `daily_usage` views (both `service_role`-only — the
  dashboard is the sole consumer). It returns their combined result as one JSON
  payload.
- `app/pages/index.vue` is the entire UI. It calls `/api/team-summary` via
  `useFetch` — the client never talks to Supabase directly — and:
  - Computes each user's slice: `(user_window_cost / total_window_cost) *
    account_five_hour_pct`, sorted descending, colored cool/amber/red by thresholds
    tuned for a 3-developer team, dimmed if idle >30 min.
  - Renders 5h/7d countdowns and a daily-peaks table.
  - Polls `/api/team-summary` every 30s and ticks a local clock every 1s (for live
    countdowns) — both timers start in `onMounted` and are cleared in `onUnmounted`.
    The clock ref starts `null` so the first client render matches the server's SSR
    output and avoids a hydration mismatch.
- All cost figures must stay labeled "API-equivalent" in the UI — this is a Max plan
  account, so these numbers are not real spend.
- The window-cost aggregation this dashboard displays (`daily_usage`,
  `get_team_window_summary`) is computed Supabase-side by
  `public.session_cost_deltas()` in `../supabase/schema.sql`. Do not reimplement that
  delta/attribution logic here — if the numbers look wrong, the fix belongs in the
  shared SQL function, not in this app's display code (see `../DATA_SOURCES.md` for
  the edge cases that logic already accounts for).
