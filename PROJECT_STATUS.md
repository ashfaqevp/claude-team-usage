# Claude Team Usage — Project Status

**What this is:** a platform for anyone sharing a single Claude Max/Team account to
see how the shared 5-hour and 7-day usage limit is actually split among the people
using it, since Anthropic only exposes one combined number with no per-person
breakdown. Any user can create a **Room** tied to their login, then invite others to
join it. Each member installs a lightweight VS Code extension — zero manual setup —
that quietly reports their own usage in the background. The **Room owner** gets a
live dashboard showing every **Room member's** real-time share of the account's
limits, plus daily history.

**Purpose of this file:** a complete snapshot of what's built, tested, and still
open, meant to be uploaded as Project knowledge so a fresh conversation has full
context without re-explaining the history. This is the "where things actually
stand" document — `BUILD_GUIDE.md` (in the repo) is the "how each phase was built"
reference, and `CONTEXT.md` / `DATA_SOURCES.md` (also in the repo) hold the
architectural decisions and data-source specifics.

---

## The goal, in one paragraph

This started as a personal tool (one owner, 2 developers, 1 shared Claude Max
account, 3 Macs) and the single-Room version of it is fully built and verified. The
real goal is the next level: a proper multi-tenant product where **anyone** can
create a **Room**, invite others into it, and see a live split of that Room's shared
usage — not hardcoded to one specific team. The single-Room version (below) is the
proven foundation; the multi-Room product (Open Items) is what's being built next.

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
  Identity resolution (see below) is automatic, no login required (yet — see Open
  Items for the planned real-login upgrade).
- **Phase 4 — Dashboard.** Built in **Nuxt 4** (`dashboard/`), not static HTML —
  the Supabase **secret** key lives server-side only (Nitro `runtimeConfig`,
  never sent to the browser). Shows per-member slices, sorted, color-coded, plus a
  daily-peaks table. This is currently the Room-owner-only view for one hardcoded
  Room (the real team); multi-Room support is not yet built.
- **Phase 5 — Packaging.** Real `.vsix` built and installed via "Install from
  VSIX" (not just F5 dev mode) — confirmed it activates cleanly, wires the
  status-line hook automatically, and works with zero configuration (URL/key are
  baked into `package.json` defaults, since the publishable key is safe to ship).

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
2. *(Not yet implemented — see Open Items)* Claude account email from `~/.claude.json`
3. `git config --global user.email` / `user.name`
4. Random device ID, generated once and cached locally

This is **identity for labeling, not authentication** — nothing verifies it's
really that person. Acceptable tradeoff for proving out the single-Room version;
real identity verification is exactly what the multi-Room upgrade (GitHub OAuth
login) is for — see Open Items.

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
  extension/          VS Code extension (Phases 1-2-3, packaged in Phase 5)
    src/               TypeScript source
    media/usage-logger.js   the status-line hook script
    scripts/verify-edge-cases.js   regression tests for the 5 fixed bugs
  dashboard/          Nuxt 4 app (Phase 4)
    server/api/        holds the Supabase secret key, server-side only
    pages/
  supabase/schema.sql  source of truth for the DB schema, RLS, RPC, views
  CONTEXT.md           architectural decisions, kept updated across build sessions
  DATA_SOURCES.md      exact data fields used/ignored + edge case documentation
  BUILD_GUIDE.md       phase-by-phase build guide with Claude Code prompts
```
Package manager: **pnpm** (not npm). Git history preserved through the
extension/dashboard reorganization via `git mv`.

---

## Open items / not yet done — the multi-Room product

The single-Room version above is the proven foundation. Turning it into the real
product means:

1. **Multi-Room data model** — every table needs a `room_id`; RLS scoped so a Room
   only ever sees its own data. Currently everything is one hardcoded Room.
2. **Real login (GitHub OAuth via Supabase Auth)** — replaces the current
   git-config/device-id identity guess with verified identity. Confirmed necessary:
   Claude account email is NOT programmatically retrievable (multiple open
   Anthropic GitHub feature requests confirm `/status` only works interactively,
   no env var, no accessible non-interactive command) — so GitHub login is the
   right anchor, not Claude account email.
3. **Room creation + auto-join** — a user creates a Room, is automatically added
   as its owner/first member.
4. **Invite flow** — owner generates an invite link; joiner signs in with GitHub
   and is added as a Room member. Strict approval/expiry can be skipped for now
   (testing), tightened later.
5. **Room-scoped dashboard** — an owner only ever sees their own Room's members
   and data, not other Rooms.
6. **Claude account email as a secondary identity source** — found that
   `~/.claude.json` contains the logged-in account's email in plain text
   (confirmed via `grep`/`find`; a safe field-path lookup script was written but
   not yet turned into reader code). This is undocumented internal storage, not a
   stable public API — even if implemented, it should stay a nice-to-have
   auto-fill, not something the product depends on, and must degrade gracefully to
   git config if the field disappears in a future Claude Code update. GitHub OAuth
   (item 2) is the real identity backbone, not this.
7. **Personal Claude account bleed-through** — if a member logs into a personal
   Claude account using the *same* `~/.claude` config dir, this tool cannot
   distinguish that from Room usage (confirmed: no account identifier exists
   anywhere accessible). Recommended mitigation: members use a separate
   `CLAUDE_CONFIG_DIR` for any personal account. Needs to go in end-user docs once
   the product has real onboarding.
8. **Optional hardening**: a plausibility check on timestamps (reject values
   implausibly far from now), to catch the "valid but wrong timestamp" class of
   bug in practice, even though it can't be closed theoretically.

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
