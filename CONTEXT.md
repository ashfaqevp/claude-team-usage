# Context for future sessions

> **Where this stands:** the multi-user product ("Claude Room") is built — Phases 1–10
> per CLAUDE_ROOM_BUILD_GUIDE.md are all implemented. The single-Room engine (Phases
> 1–5) is the proven foundation it's built on. This model supersedes the earlier
> "room_id + invite flow" sketch, which was never built:
> - A **Room is a Claude account**, identified by its org email
>   (`oauthAccount.emailAddress` from `~/.claude.json`), stored as `account_email` on
>   each snapshot. **No room_id, no room codes, no invite flow** — Rooms are implicit
>   (a Room exists once its first row arrives).
> - **Member identity within a Room** is still the git/device label (unchanged).
> - **Owner access** = GitHub, Google, or email/password login on `/` (all three via
>   Supabase Auth); the verified login email must equal the Room's Claude email —
>   that match is the whole authorization, identically for all three methods.
> - **Admin access** = a separate `/admin` page, Supabase email/password login (not
>   GitHub), listing every Room and opening any one in the same Room-view an owner sees.
> - Reads are locked server-side to the caller's own Room (owner) or an admin-selected
>   Room (admin, re-checked against `public.admins` on every `/api/admin/*` route);
>   writes stay insert-only (tighten later). See the build guide's "Future hardening"
>   for deferred items.
> - Phase 6: extension reads `oauthAccount.emailAddress` on its 30s timer and
>   stamps every synced row with `account_email` (falls back to `'unknown'` if unreadable).
> - Phases 7–10: Supabase multi-Room schema (`rooms`, `admins`,
>   `get_room_window_summary`, `list_rooms`, `get_room_name`), the dashboard's owner
>   login + Room-scoped UI (`/`) and separate admin page (`/admin`), and the extension's
>   redesigned, theme-aware webview panel (Room name, usage-pace indicator).
> - **Not yet verified end-to-end:** unlike Phases 3/7 below (each confirmed live with
>   real or rolled-back-transaction test data), there's no recorded confirmation of an
>   actual GitHub sign-in whose verified email matches a real Room, or of the admin
>   credential reaching `/admin` — the authorization code has been reviewed, not
>   exercised with a live login.

## Goal

A **Room** is a Claude Max account shared by a group of people, each on their own
device. Anyone should be able to create a Room, invite others into it as **Room
members**, and see how the account's 5-hour and 7-day rate limits are split across
the Room. The current build hardcodes a single Room shared by 3 Room members across
3 separate Macs — each Room member can see their own share of the account's 5-hour
and 7-day rate limits.

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
  `~/.claude/settings.json`, reads the local log, and shows the Room member their own
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
  configured). Shows a status bar item (account 5h % + the Room member's own cost this
  window, refreshed every 30s from the local log only) and a
  "Claude Usage: Show my usage" command that opens a webview with 5h/7d progress
  bars, the Room member's cost/tokens this window, and a table of daily peaks — all
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
- `src/identity.ts` resolves a per-Room-member label (config override → git global
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
  shared Room's Supabase project URL and publishable/anon key (safe to ship — insert-only,
  aggregates-only RPC) so the extension works with zero manual setup out of the box;
  `userNameOverride` defaults to empty (auto-derived from git identity). Setting
  either of the first two to an empty string disables sync entirely.

## Status quo (Phase 7 complete)

- `public.usage_snapshots` now carries `account_email` (indexed with `recorded_at
  desc`), backfilled on the existing rows to the one real Room's account
  (`rashid@iocod.com`) so history isn't orphaned. Phase 3's insert-only anon policy
  (`with check (true)`) is unchanged — rows now simply also carry `account_email`.
- `public.rooms` (`claude_email` primary key, `room_name`, `created_at`) and
  `public.admins` (`email` primary key) hold the Room registry and admin allowlist.
  Both have RLS enabled with no policies and no anon/authenticated grants — only
  `service_role` (used server-side by the dashboard) can read/write them. Seeded
  `rashid@iocod.com` as the placeholder admin.
- `public.get_room_window_summary(p_email text)` is `get_team_window_summary()`'s
  Room-scoped counterpart: same per-member `window_cost_usd` + latest account-wide
  `five_hour_pct`/`seven_day_pct`/reset timestamps, filtered to one Room throughout.
  SECURITY DEFINER, granted to `service_role` only (not `anon`) — the future dashboard
  server route is the only caller, passing a verified owner email.
- `public.latest_per_user` and `public.daily_usage` now carry `account_email` (still
  `service_role`-only) so a caller can filter to one Room. Both still read session cost
  exclusively through `session_cost_deltas()` — attributing a delta to a Room uses a
  `session_id -> account_email` lookup (a session's account is invariant), never a
  reimplementation of the delta math itself.
- `public.list_rooms()` (SECURITY DEFINER, `service_role` only) returns one row per
  Room (`claude_email`, `room_name`, `member_count`, `last_active`, `five_hour_pct`) —
  derived from distinct `account_email` values actually present in `usage_snapshots`,
  left-joined to `rooms` for the name. Feeds the future admin Room switcher.
- `public.get_room_name(p_email text)` (SECURITY DEFINER, granted to `anon`) returns
  only `rooms.room_name` for an email — no usage/cost data. Included after confirming
  the tradeoff (anon can probe "does a Room with this email exist") is acceptable for
  internal use.
- Applied directly to project `htrxdxtbrkdabrrqbpyr` via the Supabase MCP tool
  (migration `phase7_multiroom_schema`) and verified live: inserted 6 test rows across
  two fake Rooms, confirmed `get_room_window_summary()` returns only each Room's own
  members, confirmed `list_rooms()` shows all Rooms with correct member counts, and
  confirmed (as `anon`, via `set local role anon` in a rolled-back transaction) that
  `anon` still cannot `SELECT` raw `usage_snapshots` rows or `EXECUTE`
  `get_room_window_summary` (both `42501 permission denied`), while its Phase 3
  insert-only access and the new `get_room_name` grant still work. Test rows deleted
  afterward. `supabase/schema.sql` updated to match.

Built since (see the header above): the admin dashboard (Phase 9) and the
owner-login/Room-scoped UI (Phase 8), both reading Room data with the service_role key
via `server/utils/roomData.ts`'s shared `getRoomPayload()`.

## Bug fix (2026-07-05): token accounting was never delta-based (edge case 13)

- `context_window.total_input_tokens` / `total_output_tokens` are cumulative per
  session, exactly like `cost.total_cost_usd`, but were only ever read as the latest
  snapshot's raw value — never delta'd. This double-counted-by-omission across a
  member's multiple parallel sessions (whichever session rendered last silently
  overwrote the others' token numbers) and mis-attributed a session's pre-window
  tokens into the current window. Full writeup, including the double-fix's null-gap
  subtlety and the literal verified test output on both sides, is edge case 13 in
  DATA_SOURCES.md — read that before touching either delta function again.
- Fixed by adding `sessionTokenDeltas()` (extension, `usage.ts`) and
  `public.session_token_deltas()` (Supabase, `schema.sql`) as **parallel, separate**
  functions mirroring `sessionCostDeltas()` / `session_cost_deltas()` — deliberately
  not merged into the cost delta function, so the two stay independently verifiable.
  `summarizeCurrentWindow()` / `get_team_window_summary()` / `get_room_window_summary()`
  now sum both delta streams independently within the same window bounds already used
  for cost, exposed as `windowInputTokens`/`windowOutputTokens` (extension) and
  `window_input_tokens`/`window_output_tokens` (Supabase RPCs — required a DROP +
  CREATE of both RPCs since adding output columns changes their return shape).
- Added a second, structurally distinct concept that didn't exist before: **per-session
  context usage** (`context_window.used_percentage`, now persisted as
  `context_used_pct` end to end — `Snapshot.context_used_pct` → `usage-logger.js` →
  `sync.ts` → `usage_snapshots.context_used_pct`). This is a per-conversation
  memory-fullness gauge, not a volume metric — never summed/averaged across a member's
  sessions. Shown as a short per-session list (e.g. "Session abc123: 62% context") in
  the extension's status-bar tooltip and webview panel, and in the dashboard member
  card (`RoomView.vue`) as a new "Context usage" line, replacing the old "Context
  tokens" label that showed the latest snapshot's cumulative token counts and read as
  if it were a volume/total metric — that label/behavior is gone, not just renamed.
- Dashboard: `server/utils/roomData.ts` (not `server/api/team-summary.get.ts`, which
  no longer exists — see the dashboard's own CLAUDE.md on the Phase 8 rename to
  `my-room`/`getRoomPayload`) now also selects `session_id` and `context_used_pct` from
  its existing `usage_snapshots` query (no new round trip) and reduces them to one
  latest-known-value row per `session_id` (not per user), returned as a new
  `sessionContexts` array on `MyRoomResponse` alongside the existing `latestPerUser`.
  `RoomView.vue`'s member cards now source "Tokens this window" from
  `roomWindowSummary`'s new windowed fields instead of `latestPerUser`'s raw snapshot
  totals.
- Applied directly to project `htrxdxtbrkdabrrqbpyr` via the Supabase MCP tool
  (migration `phase13_token_deltas_and_session_context`) and verified live in
  transactions rolled back afterward — see DATA_SOURCES.md edge case 13 for the literal
  before/after numbers on both the extension and Supabase sides, plus confirmation that
  real data (1777 rows) was undisturbed and a real query against the live Room
  (`rashid@iocod.com`) returns correct non-zero windowed token totals.
- `dashboard/app/types/database.types.ts` regenerated via the Supabase MCP tool's
  `generate_typescript_types` to match (new `context_used_pct` column, new
  `session_token_deltas` function, new `window_input_tokens`/`window_output_tokens`
  RPC return columns) — regenerate this again after any further schema change, per the
  dashboard's own CLAUDE.md.

## Room owner email/password login added (2026-07-06)

- Additive third login option on `/` (`app/pages/index.vue` + `app/components/
  SignInScreen.vue`) alongside the existing GitHub/Google OAuth buttons — same page,
  not a separate one. Entirely unrelated to `/admin`: no admin file, the `admins`
  table, or the admin login flow were touched.
- Open signup (unlike `/admin`, which is a fixed allowlist): `supabase.auth.signUp()`
  with `emailRedirectTo` pointing at a new `/confirm` page (never `/admin/confirm`).
  Because "Confirm email" is on, `signUp()` never returns a session — the UI shows a
  "check your email" message and does not log the user in.
- Room resolution is unchanged and needs no new code: `server/api/my-room.get.ts`
  keys everything off `serverSupabaseUser(event)`'s verified, lowercased email — that
  logic has never branched on login provider, so an email/password account resolves
  to a Room exactly like a GitHub/Google one, as long as its `auth.users.email`
  matches the Room's `account_email`.
- `/confirm`: calls `getSession()` on load; if a session exists (link was valid),
  redirects to `/dashboard`; otherwise shows "link expired or invalid" with a
  `supabase.auth.resend({ type: 'signup', email })` button.
- Login failure specifically due to an unconfirmed email is detected via
  `error.code === 'email_not_confirmed'` (not a message-string match) and shows
  "Please confirm your email first" with the same resend option.
- `/reset-password`: listens for the `PASSWORD_RECOVERY` event via
  `supabase.auth.onAuthStateChange`, shows a new-password form (with password
  confirmation) once fired, calls `supabase.auth.updateUser({ password })`, then
  redirects to `/dashboard`. Forgot-password entry point on `/` always shows the same
  "if that email is registered, a reset link was sent" message regardless of outcome
  — verified live (see below) that Supabase's `resetPasswordForEmail`/`recover`
  endpoint already returns an identical response for a registered vs. unregistered
  email, so the UI copy doesn't have to hide anything the API would otherwise leak.
- **Identity-linking behavior, verified live against the real project (not assumed),
  disposable test users deleted immediately after**: `supabase.auth.signUp()` does
  **not** auto-link into an existing account under the same email, regardless of
  that account's original provider (GitHub/Google/email). Calling `signUp()` with an
  email that already has a confirmed account returns **HTTP 200 with an obfuscated
  decoy user object** — a *different*, non-existent `id`, `role: ""`, and, critically,
  `identities: []` (empty) — never an error, so no enumeration signal leaks either. No
  new identity is attached to the real account. Practical effect: a Room owner who
  already uses GitHub/Google and tries to sign up with email/password under the same
  address sees the identical generic "check your email" message as a brand-new
  signup (correct, no leak) but will not end up with a working password login on that
  account — they should keep using their original method. This is standard, current
  Supabase Auth anti-enumeration behavior, not a gap introduced by this feature.
  Real, already-existing accounts in the project were read once (email + OAuth
  provider only, via the admin users list) to sanity-check this against live data;
  that read incidentally returned every user's record instead of the one intended
  filter — flagged to the user directly, no data was altered.
- Config prerequisite (dashboard-only, not code): `http://localhost:3000/confirm` and
  `/reset-password`, plus their prod equivalents, must be added under Supabase
  Dashboard → Authentication → URL Configuration → Redirect URLs, or the emailed
  links fall back to the Site URL and silently miss these pages.
- **Not yet verified end-to-end**: no real browser click-through of an emailed
  confirmation or reset-password link has been performed (no inbox/browser access in
  this environment) — see PROJECT_STATUS.md for the exact manual steps to confirm
  this live.
