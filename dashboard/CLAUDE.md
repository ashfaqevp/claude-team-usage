# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

The **Claude Room** dashboard: a Nuxt 4 app where a Room owner signs in with GitHub and
sees only their own Room (a Room = a Claude account, identified by its org email). It
shows each member's estimated slice of the account-wide 5-hour/7-day rate limit, their
window cost/tokens/model, and a daily usage log. It's one of three pieces in the parent
repo (`../extension/` is the VS Code extension that logs and syncs usage; `../supabase/`
is the shared schema); read `../CONTEXT.md` and `../CLAUDE_ROOM_BUILD_GUIDE.md` for the
full system design before making changes here — they explain the per-device slice
formula, the session cost delta aggregation rule, and the multi-Room model this
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
SUPABASE_PUBLISHABLE_KEY=...
```
`SUPABASE_URL`/`SUPABASE_SECRET_KEY`/`SUPABASE_PUBLISHABLE_KEY` are the env-var names
`@nuxtjs/supabase` falls back to (see the module's defaults) — the secret key lands in
server-only `runtimeConfig.supabase.secretKey`, never `runtimeConfig.public`, and the
module enforces that split; only `SUPABASE_PUBLISHABLE_KEY` reaches the browser.

**Prerequisite (done outside this repo):** a GitHub OAuth App plus the GitHub provider
enabled in Supabase Dashboard → Authentication → Providers, so `auth.signInWithOAuth`
works. Supabase stores the provider's verified primary email as `auth.users.email` —
that's what the server routes match against.

## Design system & shell

- **Theme**: default-dark with an opt-in light theme (warm-paper). Tokens live in
  `app/assets/css/tailwind.css` — the design palette is defined once under `:root`
  (light) and `.dark` (dark), and the shadcn semantic tokens
  (`--background`/`--card`/`--primary`/`--border`…) are remapped onto it so the
  shadcn `ui/*` primitives inherit the look. The extra design tokens
  (`--surface`, `--ink-2/3`, `--accent-soft`, `--track`, `--mint/sky/clay/plum`,
  `shadow-card`) are exposed as Tailwind utilities via `@theme inline`. The SSR
  html carries `class="dark"`; an inline head script in `nuxt.config.ts` applies a
  saved `localStorage['cr-theme']` before first paint (no FOUC), and
  `composables/useTheme.ts` is the toggle's single source of truth. Chart.js can't
  read CSS vars, so `composables/useChartTheme.ts` feeds the charts theme-aware
  grid/tick/tooltip colors.
- **Fonts**: IBM Plex Sans (body/UI), IBM Plex Mono (`.mono` / `font-mono` —
  numbers & labels), Newsreader (`.serif` / `font-serif` — display & the wordmark),
  loaded once via the Google Fonts import at the top of `tailwind.css`.
- **Shell & routing**: authed owner pages use the `dashboard` layout
  (`app/layouts/dashboard.vue` = `AppSidebar` + `AppTopbar` + routed page). That
  layout owns the auth gate and 30s poll. Nav pages: `pages/dashboard.vue`
  (Overview), `pages/members.vue`, `pages/history.vue`, `pages/settings.vue` — each
  sets `definePageMeta({ layout: 'dashboard' })` and reads room data from
  `composables/useMyRoom.ts` (fixed `key: 'my-room'` → one shared request/payload).
  Derivations (member cards + colors, donut, timeline, daily rollup, 5h pace) live
  in `composables/useRoomModel.ts`, reused by every page and by `RoomView`. Auth
  pages (`login`, `reset-password`, `confirm`, `admin/login`) stay on a plain
  centered layout — no sidebar.
- **Admin shell IS the owner shell.** Both `AppSidebar` and `AppTopbar` are
  prop-driven, and the four page bodies are extracted into content components
  (`RoomView` = Overview, `MembersContent`, `HistoryContent`) that take a
  `MyRoomResponse` prop — so the owner pages and the admin room pages render the
  **exact same UI**, differing only in the data source. `app/layouts/admin.vue`
  feeds `AppSidebar` the identical Overview/Members/History/Settings nav, just
  pointed at `/admin/room/[id]/*`, plus an "All rooms" link back to the picker;
  on the `/admin` index it collapses to a rooms overview. `pages/admin/index.vue`
  lists every Room; `pages/admin/room/[id]/{index,members,history,settings}.vue`
  are the room-scoped views (Settings is read-only there — no admin rename
  endpoint). The `[id]` param is the account email base64url-encoded
  (`lib/adminRoom.ts`). Data: `composables/useAdminRooms.ts` (the list) and
  `composables/useAdminRoomData.ts` (the selected Room via `/api/admin/room?email=`),
  both shared-key so the layout, sidebar and pages dedupe to one request; the admin
  layout owns the admin auth gate (401/403 → `/admin/login`) + 30s poll.

## Architecture

- **Auth**: `@nuxtjs/supabase` (wraps `@supabase/ssr`), configured with `redirect:
  false` in `nuxt.config.ts` — there's no separate `/login` route; `app/pages/index.vue`
  renders `SignInScreen.vue` itself when `useSupabaseUser()` is null. Sign-in calls
  `supabase.auth.signInWithOAuth({ provider: 'github', options: { redirectTo:
  window.location.origin } })`; the browser client's `detectSessionInUrl` (on by
  default) exchanges the `?code=` GitHub sends back for a session automatically, no
  dedicated callback page needed. `app/types/database.types.ts` is generated schema
  typing (via the Supabase MCP tool's `generate_typescript_types`) so
  `serverSupabaseServiceRole()` calls are properly typed — regenerate it after any
  schema change.
- **`server/api/my-room.get.ts`** and **`server/api/room-name.post.ts`** are the only
  two places the secret key is used (via the `serverSupabaseServiceRole()` composable
  the module provides). Both read the caller's identity with `serverSupabaseUser(event)`
  and use its **verified `email` claim, lowercased**, as the Room key — never a
  client-supplied value, so an owner can only ever reach their own Room. `my-room` calls
  `get_room_window_summary(email)`, reads the `rooms`/`admins` tables, and reads
  `daily_usage` filtered to `account_email = email`.
  - It deliberately does **not** read `public.latest_per_user`: that view is `distinct
    on (user_name)` across *all* rooms, so it only shows a member if their single most
    recent snapshot anywhere belongs to this room — a member idling here while active
    in another room (or a run of `account_email = null` rows from a stale extension
    build) silently drops out. Instead it queries `usage_snapshots` directly with the
    `account_email` filter applied first (order by `recorded_at desc`, `limit(500)`),
    then reduces to one row per `user_name` in JS. Keep this filter-before-reduce order
    if you touch this route — reordering it re-introduces the cross-room bleed bug.
  - The old, single-Room `server/api/team-summary.get.ts` (no auth, no Room scoping,
    read the *global* `get_team_window_summary()`/views) was deleted in Phase 8 — it
    would have been an unauthenticated cross-tenant read once multiple Rooms exist.
- **`app/pages/index.vue`** is the public marketing landing (own scoped warm-paper
  palette); it forwards an OAuth return to `/dashboard`. The **auth gate + 30s poll**
  now live in the `dashboard` layout, not a page.
- **`app/components/RoomView.vue`** is the Overview content (shell-agnostic): given the
  `/api/my-room` payload it renders the 5h pace strip + 7d card (`PaceHero`), the member
  grid (`MemberCard` — slice/cost/tokens/model/context, dimmed if idle >30 min), the
  share donut + stacked daily chart, and a recent-history table + slice-estimate
  footnote. It emits `rename` (owner only; POSTs `/api/room-name`) — `pages/dashboard.vue`
  handles it, and `/admin` reuses `RoomView` with `:allow-rename="false"`, feeding it
  `/api/admin/room?email=...`. Heavier derivations sit in `useRoomModel`, so the
  dedicated `members`/`history` pages compute the same numbers without duplicating logic.
- **Empty vs error vs first-login-naming** are distinct states in `RoomView`:
  no history at all (or a brand-new Room) shows the "No usage yet" empty card; a fetch
  failure shows a separate error card with retry; a Room with history but no
  `rooms.room_name` yet shows a "Name your Room" prompt banner.
- shadcn-vue components live in `app/components/ui/` (Tailwind v4 + reka-ui under the
  hood, via `components.json`). Import them explicitly (`import { Button } from
  '@/components/ui/button'`) rather than relying on Nuxt's component auto-import —
  each `ui/*` folder's `index.ts` barrel and its `.vue` file both auto-register under
  the same component name, which Nuxt warns about and can resolve ambiguously.
- All cost figures must stay labeled "API-equivalent" in the UI — this is a Max plan
  account, so these numbers are not real spend.
- The window-cost aggregation this dashboard displays (`daily_usage`,
  `get_room_window_summary`) is computed Supabase-side by
  `public.session_cost_deltas()` in `../supabase/schema.sql`. Do not reimplement that
  delta/attribution logic here — if the numbers look wrong, the fix belongs in the
  shared SQL function, not in this app's display code (see `../DATA_SOURCES.md` for
  the edge cases that logic already accounts for).
