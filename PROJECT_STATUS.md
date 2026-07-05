# Claude Team Usage — Project Status

**What this is:** a platform for anyone sharing a single Claude Max/Team account to
see how the shared 5-hour and 7-day usage limit is actually split among the people
using it, since Anthropic only exposes one combined number with no per-person
breakdown. A **Room** *is* a Claude account, identified by its org email — Rooms are
implicit (a Room exists the moment its first usage snapshot arrives), with no room
codes, no invite flow, and nothing to manually create. Each member installs a
lightweight VS Code extension — zero manual setup — that quietly reports their own
usage in the background. The **Room owner** signs in with GitHub (their verified
login email must match the Room's Claude email) and gets a live dashboard showing
every **Room member's** real-time share of the account's limits, plus daily history.
A separate `/admin` page (Supabase email/password login) lets a small set of known
operators list and open any Room.

**Purpose of this file:** a complete snapshot of what's built, tested, and still
open, meant to be uploaded as Project knowledge so a fresh conversation has full
context without re-explaining the history. This is the "where things actually
stand" document — `BUILD_GUIDE.md` (Phases 1–5) and `CLAUDE_ROOM_BUILD_GUIDE.md`
(Phases 6–10, in the repo) are the "how each phase was built" reference, and
`CONTEXT.md` / `DATA_SOURCES.md` (also in the repo) hold the architectural decisions
and data-source specifics.

---

## The goal, in one paragraph

This started as a personal tool (one owner, 2 developers, 1 shared Claude Max
account, 3 Macs) and the single-Room version of it is fully built and verified. It
has since grown into a proper multi-tenant product (Phases 6–10, below): any Claude
account is automatically its own **Room**, split apart from every other Room with
zero setup — no Room creation, no invite flow — and an owner just signs in with
GitHub to see their own Room's live split. The single-Room version (below) is the
proven foundation the multi-Room product was built on top of; see "Open items" for
what's still genuinely open (hardening, not the core product).

## Status: single-Room core engine built, tested, and working (v1)

### What's built, phase by phase

- **Phase 1 — Logger.** `media/usage-logger.js` runs as Claude Code's status-line
  hook. Reads the official `rate_limits` and `cost` data Claude Code exposes,
  writes changes to a local log (`~/.claude/team-usage/local-log.jsonl`). No
  network. Tested offline (sample JSON) and live (real Claude Code sessions).
- **Phase 2 — Extension shell.** VS Code extension (TypeScript) auto-installs the
  logger and wires the status-line hook into `~/.claude/settings.json` on first
  run — zero manual setup for members. Shows a status bar item + a webview panel
  with the person's own usage, entirely from the local log.
- **Phase 3 — Supabase sync.** Snapshots sync to a Supabase table
  (`usage_snapshots`). RLS locks the publishable/anon key to insert-only — it can
  never read raw rows. A `get_team_window_summary()` RPC returns aggregates only.
  Identity resolution (see below) is automatic, no login required (real login was
  added later, for the owner/admin dashboards only — see the Phase 6-10 section).
- **Phase 4 — Dashboard.** Built in **Nuxt 4** (`dashboard/`), not static HTML —
  the Supabase **secret** key lives server-side only (Nitro `runtimeConfig`,
  never sent to the browser). Shows per-member slices, sorted, color-coded, plus a
  daily-peaks table. At this phase it was still a single hardcoded Room (the real
  team); multi-Room support was added later (Phase 8, see below).
- **Phase 5 — Packaging.** Real `.vsix` built and installed via "Install from
  VSIX" (not just F5 dev mode) — confirmed it activates cleanly, wires the
  status-line hook automatically, and works with zero configuration (URL/key are
  baked into `package.json` defaults, since the publishable key is safe to ship).

### Phase 6-10 — Claude Room multi-user product

- **Phase 6 — Extension captures the Claude account email (the Room key).** The
  extension reads `oauthAccount.emailAddress` from `~/.claude.json`
  (`extension/src/claudeAccount.ts`) on its existing 30s sync timer and stamps every
  synced snapshot with `account_email`, falling back to `'unknown'` if the file/field
  can't be read — that bucket is never mixed into a real Room.
- **Phase 7 — Supabase multi-Room schema.** Added `public.rooms` (`claude_email`,
  `room_name`) and `public.admins` (`email`), both `service_role`-only. Added
  Room-scoped RPCs: `get_room_window_summary(p_email)` (per-member window stats for
  one Room), `list_rooms()` (one row per Room for the admin switcher), and
  `get_room_name(p_email)` (the one RPC granted to `anon`, so the extension can show
  a Room's display name without exposing usage data). `usage_snapshots`,
  `latest_per_user`, and `daily_usage` all carry `account_email`.
- **Phase 8 — Dashboard: owner GitHub login + Room-scoped UI.** `/` (`pages/index.vue`)
  requires GitHub login via Supabase Auth and redirects a signed-in user to
  `/dashboard`; `server/api/my-room.get.ts` resolves the Room strictly from the
  caller's own verified session email (401 if signed out) and delegates to the shared
  `getRoomPayload()` (`server/utils/roomData.ts`), which calls
  `get_room_window_summary`, reads `usage_snapshots`/`daily_usage` filtered by
  `account_email`, and reads the Room's name/admin flag — a client can never request
  another Room. `RoomView.vue` renders the Room header (name, tracked email, 5h/7d
  bars + reset countdowns), a member grid (slice, cost, tokens, model, last-seen,
  active/idle), an insights strip, and a daily activity table.
- **Phase 9 — Admin page.** A separate `/admin` (`pages/admin/login.vue`, Supabase
  email/password — not GitHub) lists every Room via `server/api/admin/rooms.get.ts`
  and opens any one via `server/api/admin/room.get.ts` (the one route where an
  `?email=` query param is trusted, only after the admin check passes), reusing the
  same `RoomView` component the owner sees. `server/utils/adminAuth.ts`'s
  `requireAdminEmail()` is called independently by every `/api/admin/*` route and
  returns a single 403 for every failure mode (not signed in, not in `admins`, or a
  lookup error) — never revealing which.
- **Phase 10 — Extension UI/UX polish.** The webview panel was rewritten to a
  theme-aware design (VS Code `--vscode-*` variables), shows the Room name (via
  `get_room_name`) or falls back to the tracked email, and adds a pace indicator
  (`computePaceStatus` in `extension.ts`, "ahead of pace" / "on pace" / "within pace")
  comparing elapsed window time against usage progress. The dashboard gained matching
  chart components (`ShareDonutCard.vue`'s "your share" donut, `UsageTimelineCard.vue`,
  `ActivityHeatmapCard.vue`).

**Not yet verified end-to-end:** unlike Phase 3/7's Supabase-side changes (each
confirmed live above with real or rolled-back-transaction test data), there's no
recorded confirmation of an actual live sign-in for either login flow — e.g. a real
GitHub account whose verified email matches a real Room's `account_email`
successfully reaching `/dashboard`, or the admin credential reaching `/admin`. The
authorization logic (verified-session-email-only Room scoping, independent per-route
admin re-checks) has been read and reviewed, not exercised against a live login.

### The core calculation

Anthropic's `rate_limits.five_hour.used_percentage` is the **exact, real, shared**
total — same value on every machine at any instant. It cannot be split by
Anthropic; there's no per-person field. The split is **derived** on our side:

```
your_slice ≈ (your window_cost / everyone's window_cost) × account_five_hour_pct
```

Cost (not raw tokens) is used because it's model-aware — Opus costs more per token
than Sonnet, and cost already reflects that; raw token counts wouldn't.

**Cost is delta-based, not cumulative-snapshot-based**, per session: we track each
session's last-known cost and only count the *increase* since last check. This
matters because `cost.total_cost_usd` is cumulative per session — summing whole
snapshots instead of deltas would double/triple count, and would also mis-attribute
a session's entire history to whichever window it happens to be checked in if it
spans a 5-hour reset boundary.

### Identity resolution (no login required, for the single-Room version)

Priority order, resolved once per extension activation:
1. `userNameOverride` setting (manual, optional)
2. `git config --global user.email` / `user.name`
3. Random device ID, generated once and cached locally

(Claude account email from `~/.claude.json` was floated here originally as a possible
future identity source, but Phase 6 ended up building it for a different purpose —
the **Room key** (`account_email`), not a per-member identity fallback. Member
identity within a Room still resolves via steps 1-3 above, unchanged.)

This is **identity for labeling, not authentication** — nothing verifies it's
really that person. Acceptable tradeoff for proving out the single-Room version;
real identity verification is exactly what the multi-Room upgrade (GitHub OAuth
login, now built — see the Phase 6-10 section above) is for.

### 5 real bugs found and fixed (verified with actual before/after test output, not just review)

1. **Null `session_id` handling** — extension was double-counting (fake key +
   real key both counted), Supabase was silently dropping these rows entirely
   (undercounting). Fixed: exclude null-session_id rows on both sides; the real
   session's first reading naturally captures full cost once a real ID appears.
2. *(same fix, both sides confirmed to agree)*
3. **Malformed timestamp** — a bad `ts` was falling back to epoch-0, scrambling
   delta ordering for that session. Fixed: exclude malformed timestamps, log a
   distinct warning (not the misleading "resume bug" warning).
4. **Unsafe "no window yet" default** — before any rate-limit data arrives, cost
   was defaulting to "counted in current window" (over-reports). Fixed: defaults
   to excluded (under-reports until real data arrives) — the safer failure
   direction.
5. **Timezone mismatch in daily bucketing** — extension bucketed by each Mac's own
   OS timezone; Supabase hardcoded Asia/Kolkata. Fixed: extension now also buckets
   in Asia/Kolkata explicitly, so a late-night session lands on the same calendar
   day in both views.
   Also fixed as part of this round: SQL `ORDER BY` tiebreak now uses
   `(recorded_at, id)` instead of `recorded_at` alone, to match the extension's
   stable sort on identical timestamps.

Additionally investigated and found to be **structural, shared, accepted
limitations** (not bugs, documented in `DATA_SOURCES.md`):
- A single delta *interval* can still straddle a reset boundary (small, bounded
  error — not the whole-session error the original design had).
- A "valid but wrong" timestamp (e.g. accidental epoch date) can't be caught by
  type validation on either side — optional future hardening: reject timestamps
  implausibly far from now.
- Claude.ai web chat usage draws from the same shared pool but is invisible to
  this tool (no status line involved) — the account total still reflects it
  correctly; it just won't be attributed to any member's card.
- Clock skew across machines isn't actively checked.
- Multiple parallel sessions per person (two terminal tabs) should work by design
  but hasn't been explicitly stress-tested.

### Verified end-to-end
- Real cross-identity test: temporarily swapped `git config --global` to a second
  identity, confirmed the dashboard showed two separate cards with slices summing
  toward the real account %, cleaned up test data afterward.
- Real `.vsix` install (not dev mode) confirmed working with zero configuration.
- Dashboard confirmed to never expose the Supabase secret key to the browser
  (checked Network tab + page source with real data flowing).
- Automation used a Claude Code session with its own scoped Supabase MCP access
  (project ref `htrxdxtbrkdabrrqbpyr`) to apply migrations and run live
  verification queries directly, rather than manual SQL editor copy-pasting.

---

## Repo structure
```
claude-team-usage/
  extension/          VS Code extension (Phases 1-2-3, packaged in Phase 5; Room
                      email capture in Phase 6, UI polish in Phase 10)
    src/               TypeScript source (claudeAccount.ts reads the Room-key email)
    media/usage-logger.js   the status-line hook script
    scripts/verify-edge-cases.js   regression tests for the fixed bugs
  dashboard/          Nuxt 4 app (Phase 4; owner login + Room UI in Phase 8,
                      separate /admin page in Phase 9)
    server/api/        holds the Supabase secret key, server-side only
      admin/           admin-only routes (server/utils/adminAuth.ts gates these)
    pages/
      admin/           separate /admin login + Room-switcher page (Phase 9)
  supabase/schema.sql  source of truth for the DB schema, RLS, RPC, views
  CONTEXT.md           architectural decisions, kept updated across build sessions
  DATA_SOURCES.md      exact data fields used/ignored + edge case documentation
  BUILD_GUIDE.md       phase-by-phase build guide for Phases 1-5 (Claude Code prompts)
  CLAUDE_ROOM_BUILD_GUIDE.md   phase-by-phase build guide for Phases 6-10
```
Package manager: **pnpm** (not npm). Git history preserved through the
extension/dashboard reorganization via `git mv`.

---

## Open items / not yet done

The multi-Room product described above (Phases 6-10) is built — the items below are
the deferred hardening from `CLAUDE_ROOM_BUILD_GUIDE.md`'s "Future hardening" section,
not the core product:

1. **Authenticated, Room-scoped inserts.** Writes still use the shipped
   publishable/anon key against an unauthenticated `with check (true)` insert
   policy — anyone with that key could inject rows into any Room. Not tightened yet;
   an accepted tradeoff while usage is a handful of internal devs.
2. **Google login.** Only GitHub is wired up as an owner-login provider so far;
   Google (many Claude accounts are Google-based) would use the identical
   email-match logic via another Supabase Auth provider.
3. **`CLAUDE_CONFIG_DIR` guidance for dual-account users.** Not yet documented for
   end users. Lower-stakes than it used to be: since a Room is now keyed by account
   email, a member's personal Claude account already routes to its own separate Room
   automatically — this would only be belt-and-suspenders, not required.
4. **Timestamp plausibility check.** Insert-time (`mapToRow()`) still accepts any
   parseable timestamp, including implausible ones (e.g. an accidental epoch date) —
   see `DATA_SOURCES.md` edge cases 10 and 12. Would catch the realistic
   epoch/zero-value case; the theoretical "valid but wrong date" gap can't be closed
   by any type system.
5. **Hard account filter (only if ever wanted).** Deliberately not built — routing
   by `account_email` already keeps Rooms clean without exclusion logic, and an
   active filter would be a riskier default (a Claude Code update nulling the email
   field would zero out a whole Room, instead of just landing rows in `'unknown'`).
6. **Invite / approval / expiry.** Not needed for the current implicit, email-keyed
   Room model — only relevant if Rooms ever need to be private beyond "you must
   control the matching email."
7. **Re-verify `oauthAccount.emailAddress` on future Claude Code updates.** It's
   undocumented internal storage (see `DATA_SOURCES.md`); a future release could move
   or rename it. `readClaudeAccountEmail()` already degrades to `null` /
   `account_email = 'unknown'` if that happens, so no data is lost — just re-check
   the field after upgrading Claude Code.

**Not yet verified end-to-end** (see the Phase 6-10 section above): the
GitHub-owner-login and admin email/password login flows are implemented but have no
recorded confirmation of a real, live sign-in.

## Working style / preferences established in this build

- Wants **real test output** (literal numbers, printed results) for any claim of
  "fixed" or "verified" — summary language like "all good" or "held up under
  review" without shown output is explicitly not sufficient, and has been pushed
  back on before.
- Prefers **pnpm** over npm.
- Prefers building via **Claude Code** with copy-paste prompts, tested step by
  step, git-committed at checkpoints — not large speculative jumps.
- Wants technical explanations **in plain/simple terms** with concrete examples,
  as someone newer to VS Code extension development specifically (though
  experienced in Nuxt/Vue/TypeScript/Supabase generally).
- Values catching edge cases and being told about tradeoffs plainly, including
  being pushed back on when a claim wasn't actually substantiated.
- Terminology: **Room** (not "workspace" or "pool"), **Room owner**, **Room
  member** — not "juniors" or "team," since the product is meant for anyone, not
  just this specific team.
