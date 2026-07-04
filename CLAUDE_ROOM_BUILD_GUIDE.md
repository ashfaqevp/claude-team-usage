# Claude Room — Build Guide (Phases 6–10, the multi-user product)

This continues `BUILD_GUIDE.md`. Phases 1–5 built and proved the single-Room engine
(logger → local log → Supabase → dashboard → packaged `.vsix`). This guide turns that
proven foundation into the real multi-user product, now named **Claude Room** in the UI.

Same working style as before: each phase is a **PROMPT** you paste into Claude Code
inside the repo, a **TEST** you run before moving on, and a **CHECKPOINT** commit.
Prompts use **pnpm**, tell Claude Code to read `CONTEXT.md` first, and ask for **real
printed output** on any "verified" claim — not summaries.

---

## The Claude Room model — in plain words

Everything below rests on one simple idea:

> **A Room *is* a Claude account.** The Room's identity is the Claude account's
> organization email (`oauthAccount.emailAddress` in `~/.claude.json`).

From that, everything else falls out:

- **The extension checks nothing and asks for nothing.** On the 30-second timer it
  already runs, it reads the Claude account email off the device, stamps every usage
  snapshot with it (`account_email`), and syncs. Whatever account the device is logged
  into, that's the Room the data lands in. Members install the extension and usage just
  flows — nothing to type, no code to paste, no "join" step.
- **A Room "exists" the moment the first row for that email arrives.** You never create
  a Room; it appears. There are no Room codes and no invite flow.
- **Who's who *inside* a Room** is still the member's **git name/email from their
  device** (or their `userNameOverride`), exactly as in Phase 3. The email groups people
  into a Room; the git identity splits them apart within it.
- **The Room owner logs into the dashboard** with GitHub. The verified email GitHub
  returns is matched against Room emails. **If the owner's login email equals a Room's
  Claude email, they see that Room.** That match is the entire authorization — no owner
  records, no permissions table.

### Why this is cleaner than filtering

Earlier we worried about "personal-account bleed-through" — a member accidentally on
their *own* Claude account. In this model there is nothing to filter. If a member
switches to a personal Claude account, their device now reports a **different email**,
so their usage flows into a **different Room** (their personal one), which only they
could ever open. The shared Room's numbers stay clean automatically, with zero
exclusion logic.

### One consequence worth internalizing

Because a Room *is* an email, **membership and "account match" are the same thing**.
Everyone whose data is in a Room was, by definition, on that Room's account — there is
no "member showing up in the wrong Room" state to warn about inside the dashboard. The
"which account am I on right now?" self-check lives in the **extension** (so a member
can notice they've drifted onto a personal account), not as a per-member ✓/⚠ badge on
the owner's dashboard. Don't build a mismatch indicator on the dashboard — it can't
happen there.

---

## The one load-bearing assumption (put this on the login screen and in the README)

> **The owner's dashboard login email must equal their Claude account email.**

For developers this is almost always true — the same work/Google email backs both their
Claude plan and their GitHub. But it's the single thing the whole product hangs on, so:

- Match on the **verified** email GitHub returns (its verified primary email), so nobody
  can impersonate an email they don't control.
- Say it plainly at login: *"Log in with the GitHub account whose email matches your
  Claude account."*
- If someone's Claude email has no matching login, they can't open their Room. Accepted,
  documented.

## Accepted risks (documented on purpose — not building around them now)

1. **`oauthAccount.emailAddress` is undocumented internal storage.** A Claude Code
   update could rename or move it. This is the *same class of risk* as cost-per-token
   values changing on an update — we already accept that. We read it best-effort and
   store the value against the Room. If the field ever can't be read, see the "unknown"
   rule in Phase 6 — we never let those rows land in a real Room.
2. **Writes are unauthenticated** (the shipped publishable key inserts rows). Someone
   with that key could inject junk into a Room. Fine for internal use. Tightening to
   authenticated, Room-scoped inserts is in **Future hardening**.
3. **Reads are the part we *do* lock down now** (see Phase 7/8): the dashboard only ever
   returns the logged-in owner's own Room, enforced server-side from their verified
   session email — never from a value the browser supplies.

Confirmed on the reference machine: `oauthAccount.emailAddress` → the account email, and
`oauthAccount.organizationName` → `"<email>'s Organization"`. Phase 6 re-confirms this
across all machines before any code depends on it.

---

## Design language for Claude Room (dashboard + extension share this)

The brief: **modern, standard, legible — an industry-grade internal product**, not a
marketing page and not a barebones tool. Both surfaces use the same product name
("Claude Room"), the same accent colour, and the same vocabulary so they feel like one
thing.

**Dashboard** — Nuxt 4 + **shadcn-vue** (the Vue port of shadcn; *not* React shadcn).
If a shadcn-vue registry/MCP tool is available in the Claude Code session, use it to add
components; otherwise use the shadcn-vue CLI.

**Two separate entry points, two separate audiences — not one page with a badge:**

- **`/` — the owner page.** GitHub login only. Verified login email must match a
  Room's Claude email. An owner only ever sees their own Room here. No admin concept
  exists on this page at all.
- **`/admin` — the admin page.** Supabase email/password login (not GitHub — the
  admin isn't proving they own a Room, they're a fixed, known operator). Lists every
  Room and opens any of them in the same Room-view component the owner sees. Reached
  only by its own URL, never surfaced on `/`.

Owner page (`/`) layout:

- **Top bar:** "Claude Room" wordmark, the signed-in user, a sign-out control.
- **Room header:** the Room name (inline-editable by the owner), the tracked Claude
  account email, live **5-hour** and **7-day** account bars with **reset countdowns**,
  and total window cost clearly labelled **"API-equivalent (Max plan — not real spend)."**
- **Member grid:** one card per member — display name, their **slice of the 5h limit**
  (the headline number), window cost, tokens in/out, current/last model, **last-seen**
  as relative time, and an **active/idle** dot (active if a snapshot landed in the last
  few minutes; card dimmed if idle > 30 min). Sort by slice descending; colour the slice
  cool → amber → red by level.
- **Insights strip** (all from data we already store): **top user this window**, **most
  active today**, total sessions, peak day.
- **Daily activity:** the `daily_usage` table (per-day peak 5h/7d, cost, session count),
  presented as a clean table or small timeline.
- **Empty vs broken must look different:** a brand-new Room shows *"No usage yet for
  {Room} — data appears here once a Room member runs Claude Code,"* not the same blank
  as a failed fetch.
- **Auto-refresh every 30s.**

**Admin page (`/admin`):** its own login screen (email/password), then a Room switcher
listing every Room with a couple of at-a-glance stats; picking one renders the *exact
same* Room view an owner sees on `/`.

**Extension webview** — plain HTML/CSS/JS (no shadcn here), but bring it up to the same
standard:

- Use VS Code's own theme CSS variables (`--vscode-*`) so the panel matches the editor's
  light/dark theme natively — this is the cheap move that makes it feel first-class.
- **Header:** "Claude Room" + the Room name (or the tracked email if unnamed) + a line
  showing the account currently being tracked. If the email couldn't be read, show a
  quiet warning instead (see Phase 6).
- **The member's own stats:** their slice ("you ≈ X% of the shared 5h limit"), the
  account 5h/7d bars with reset countdowns, their window cost + tokens, their model.
- **Recent activity:** a compact daily-peaks list.
- **Empty/error states** written out, never a blank panel.

---

## Features & insights we're including (and why they're cheap)

Everything here is derivable from data the logger *already* captures — no new
collection, no new privacy surface:

| Feature                                  | Comes from                                              |
| ---------------------------------------- | ------------------------------------------------------- |
| Account 5h % / 7d % + reset countdowns   | `five_hour_pct` / `seven_day_pct` / `*_resets_at` |
| Per-member slice of 5h limit             | existing slice formula                                  |
| Per-member window cost (API-equivalent)  | `cost_usd` deltas (unchanged)                         |
| Per-member tokens in/out                 | `input_tokens` / `output_tokens`                    |
| Per-member current/last model            | `model`                                               |
| Active / idle + last-seen                | compare`recorded_at` to now                           |
| Top user this window / most active today | aggregate existing cost                                 |
| Total sessions                           | distinct`session_id`                                  |
| Daily peaks / activity timeline          | `daily_usage` view                                    |
| Room name + tracked account              | new`rooms` table + `account_email`                  |

Deliberately **not** now: authenticated inserts, Google login, invite/approval flows,
hard exclusion filtering, `CLAUDE_CONFIG_DIR` enforcement, timestamp plausibility checks.
All captured in **Future hardening** so the project stays legible for later.

---

# Phase 6 — Extension captures the Claude account email (the Room key)

**Goal:** every snapshot the extension syncs is stamped with the Claude account email it
came from, so Supabase can group snapshots into Rooms. Plus a minimal "tracking
{email}" line in the existing panel. No schema or dashboard work yet.

### Simpler notes

- The email is **not** in the status-line JSON the logger receives — so the logger keeps
  logging locally as-is. The **extension** (which already runs code on a timer) is what
  reads `~/.claude.json` directly and attaches the email when it syncs.
- Read it on the **30-second timer you already have**. Reading a tiny local file every
  30s is effectively free, and it means a mid-session account switch is picked up within
  30s. No file-timestamp cleverness needed.
- **Null rule (decide once, it's one branch):** if the email can't be read, tag those
  rows `account_email = 'unknown'` and sync them anyway. They form an "unknown" bucket
  that only an admin can ever see — they are **never** mixed into a real Room. This never
  loses data and never contaminates a real Room's numbers. (Alternative, if you'd rather:
  hold unsynced until readable — but that risks losing data if the field ever disappears
  for good. Recommended default is tag-`'unknown'`.)

### PRE-FLIGHT (run these first — do not write code until they pass)

Ask Claude Code (or run yourself) on **each** Mac, since they may run different Claude
Code versions:

```bash
# 1. Exact JSON path holding the account email:
cat ~/.claude.json | jq -r 'paths(scalars) as $p | select(getpath($p)|tostring|test("@")) | ($p|join("."))'
# expect: oauthAccount.emailAddress   (and oauthAccount.organizationName)

# 2. Read it directly and confirm it's the logged-in account's email:
cat ~/.claude.json | jq -r '.oauthAccount.emailAddress'
```

Then confirm by hand:

- It **survives** log out → log back in (same path, same value).
- It's the **same path on all 3 Macs**.
- Logging into a **different** Claude account **changes** the value (this is the proof
  that routing-by-email works at all).

If the path differs across machines or vanishes on re-login, stop and reconsider —
fall back to a label-only Room (owner names it, no email capture). If it holds, continue.

### PROMPT (paste into Claude Code)

```
Read CONTEXT.md. This is Phase 6 of the Claude Room product. Keep everything from
Phases 1-5 working (the local log stays the source of truth; the status-line logger is
unchanged — it does NOT read the email). Do only Phase 6.

Background: a "Room" is identified by the Claude account's organization email, stored
in ~/.claude.json at oauthAccount.emailAddress (confirmed). The extension must stamp
every synced snapshot with this email so the backend can group snapshots into Rooms.
The extension does NO filtering or access control - it only reads and attaches the email.

1. Add src/claudeAccount.ts:
   - Export readClaudeAccountEmail(): string | null. It reads ~/.claude.json
     (os.homedir() + '/.claude.json'), JSON.parses it, and safely returns
     oauthAccount.emailAddress. Every step in try/catch; ANY failure (file missing,
     bad JSON, path missing) returns null - never throws. Add a one-line comment that
     this is undocumented internal Claude Code storage read best-effort, and may need
     updating if a future Claude Code release moves the field.
   - Cache the value in memory, re-read it on the same 30s sync tick the extension
     already runs (so a mid-session account switch is picked up within 30s). Do NOT read
     it on every render or set up any file watcher.

2. In the sync path (src/sync.ts / wherever rows are mapped for upload), add an
   account_email field to every row before POSTing to Supabase:
   - If readClaudeAccountEmail() returns a non-empty string, use it.
   - If it returns null/empty, set account_email to the literal string "unknown".
     (Deliberate: these rows go to an 'unknown' bucket, never into a real Room. This
     preserves data without contaminating any Room's numbers.)
   Note: usage_snapshots does not have this column yet (that's Phase 7) - the POST will
   just include an extra field the table ignores for now, which is fine. Do not change
   the local log format.

3. In the webview panel (src/extension.ts webview HTML), add ONE line near the top:
   "Tracking Claude account: <email>" using readClaudeAccountEmail(), or if it's null,
   a quiet warning line "Couldn't read your Claude account email - usage is still being
   tracked as 'unknown'." Keep it minimal for now; the full panel redesign is Phase 10.

4. Add a small script scripts/print-claude-email.js that runs readClaudeAccountEmail()'s
   logic standalone and prints the result, so I can verify it from the terminal:
   `node scripts/print-claude-email.js` -> prints the email or "null".

Null-safe throughout. Do not send prompts/code/file contents - only the numeric columns
already synced, plus the new account_email string.
```

### TEST

```bash
node scripts/print-claude-email.js      # prints your real Claude account email
```

- Print it, and confirm it matches `jq -r '.oauthAccount.emailAddress' ~/.claude.json`.
- Temporarily rename `~/.claude.json` aside, run the script again → prints `null`
  (proving the null path is safe). Put it back.
- Launch the Extension Development Host (F5), open the panel → confirm the "Tracking
  Claude account: {email}" line shows.
- Have Claude Code print the exact row object it would POST (one sample), and confirm it
  now carries `account_email`. Ask for the **printed object**, not a description.

### CHECKPOINT

`git commit -am "Phase 6: extension stamps snapshots with Claude account email (Room key)" && git tag v1.1-room-key`

---

# Phase 7 — Supabase: the multi-Room data model

**Goal:** the database groups snapshots into Rooms by `account_email`, stores a Room
name, knows who the admins are, and exposes **Room-scoped** reads that only ever return
one Room's data. Writes stay insert-only (now carrying `account_email`).

### Simpler notes

- One new **column** on the existing table (`account_email`) + two tiny **tables**
  (`rooms`, `admins`). That's the whole schema change — nothing heavier.
- The sensitive read functions (per-member window summary, daily usage) become
  **`service_role`-only** and **take a Room email as a parameter**. The Nuxt server route
  (Phase 8) is the only caller — it passes the *verified* owner's email, so a browser can
  never ask for a Room that isn't theirs.
- **Backfill:** the existing single-Room rows have no email — set them all to your real
  Room email in the same migration so history isn't orphaned.
- Optional nice-to-have: a tiny anon-safe `get_room_name(email)` so the **extension** can
  show the Room name. Tradeoff, stated plainly: granting this to anon lets anyone with
  the key probe "does a Room with this email exist, and what's it called." Negligible for
  internal use, but if you'd rather not, skip it and the extension just shows the email.

### PROMPT (paste into Claude Code)

```
Read CONTEXT.md. This is Phase 7 of the Claude Room product. My Supabase project ID is
htrxdxtbrkdabrrqbpyr. If you have a connected Supabase tool that can reach it, apply
these migrations directly AND verify them with real queries (show me the output) - do
not just write SQL and stop. If you don't have tool access, write the SQL to
supabase/schema.sql and tell me exactly what to paste. Keep Phase 3's insert-only anon
policy and the session_cost_deltas() delta logic intact.

A "Room" is identified by account_email (the Claude account org email). Do only Phase 7.

1. Alter public.usage_snapshots: add column account_email text. Add an index on
   (account_email, recorded_at desc). Backfill: UPDATE all existing rows to set
   account_email = 'rashid@iocod.com' (the existing single Room's account) so history
   isn't orphaned. The anon INSERT policy stays with check (true) for now - rows now
   simply also carry account_email.

2. Create public.rooms:
   - claude_email text primary key
   - room_name text
   - created_at timestamptz default now()
   Enable RLS; no anon access. (The dashboard reads/writes it via the secret key
   server-side.)

3. Create public.admins:
   - email text primary key
   Enable RLS; no anon access. Seed my email as an admin (INSERT my email - I'll tell
   you which; use 'rashid@iocod.com' as the placeholder admin for now).

4. Room-scoped read function public.get_room_window_summary(p_email text): identical in
   shape to get_team_window_summary() from Phase 3 (per-member window_cost via
   session_cost_deltas() filtered to the current 5-hour window, plus the latest account
   five_hour_pct / seven_day_pct / *_resets_at) BUT filtered to WHERE account_email =
   p_email throughout. SECURITY DEFINER. Grant EXECUTE to service_role ONLY (NOT anon) -
   the server route is the only caller and passes a verified email.

5. Make the daily/summary views Room-aware: public.daily_usage and
   public.latest_per_user must include account_email (so a caller can filter by Room).
   Keep them granted to service_role only. Continue reading session cost through
   session_cost_deltas() - do not reimplement the delta logic anywhere.

6. Admin-facing: public.list_rooms() (SECURITY DEFINER, service_role only) returns one
   row per Room: claude_email, room_name (from rooms, may be null), member_count
   (distinct user_name), last_active (max recorded_at), and current five_hour_pct. This
   feeds the admin Room switcher.

7. OPTIONAL (ask me if unsure): public.get_room_name(p_email text) returns text -
   just rooms.room_name for that email, SECURITY DEFINER, grantable to anon, so the
   extension can display the Room name. Non-sensitive (name only, no usage). If you'd
   rather not expose it to anon, leave it out and note that.

If applied directly, VERIFY with real output before finishing:
- Insert 3 test rows for account_email 'roomA@example.com' and 3 for
  'roomB@example.com' (different user_names, cost, recent recorded_at, with rate_limits).
- Call get_room_window_summary('roomA@example.com') and show it returns ONLY roomA's
  members - print the rows.
- Call get_room_window_summary('roomB@example.com') and show it returns ONLY roomB's.
- Call list_rooms() and show both Rooms appear with sensible member_count/last_active.
- Confirm anon still cannot SELECT raw usage_snapshots rows (RLS), and cannot EXECUTE
  get_room_window_summary (service_role only) - show how you confirmed it.
- Delete the test rows afterward and confirm they're gone (print count).
```

### TEST

If Claude Code applied and verified directly, review the printed output: two Rooms,
each summary returning only its own members, `list_rooms()` showing both, anon blocked
from raw rows and from the scoped RPC. If it wrote `schema.sql` instead, run it in the
SQL editor and reproduce those checks by hand. Confirm the backfill set your existing
rows' `account_email` (query a couple).

### CHECKPOINT

`git commit -am "Phase 7: multi-Room schema (account_email, rooms, admins, scoped reads)" && git tag v1.2-multiroom-db`

---

# Phase 8 — Dashboard: owner login + the Claude Room UI

**Goal:** an owner signs in with GitHub, and sees **only their own Room** (matched by
email), in a modern shadcn-vue interface with the member cards, insights, timeline, and
empty states from the design section. Owner can name their Room on first login.

**Scope note:** this phase builds `/` (the owner page) only. There is no admin logic,
badge, or switcher anywhere in this phase — that's entirely Phase 9's `/admin` page,
built separately so the two audiences never share a login screen or a code path.

### Simpler notes

- **Login = identity only.** GitHub OAuth (via Supabase Auth) just tells us *who is
  logged in and their verified email*. It does **not** hand data to the browser.
- **The server route is the gatekeeper.** It reads the authenticated user server-side,
  gets their **verified email**, then uses the **secret key** to fetch *that email's*
  Room via `get_room_window_summary`. The browser never names a Room — scoping comes
  from the verified session, so one owner physically cannot request another's Room.
- **Room naming:** on first login, if the owner's email matches a Room that has rows but
  no name yet, prompt them to name it (writes to `rooms` via the server route).
- **shadcn-vue, not React shadcn.** If a shadcn-vue registry/MCP tool is available, use
  it to add components; else use the shadcn-vue CLI. Follow shadcn-vue's current Nuxt
  setup (Tailwind + Reka UI under the hood).

### Setup (do this yourself first)

Your `dashboard/.env` from Phase 4 already holds `SUPABASE_URL` / `SUPABASE_SECRET_KEY`.
Add your GitHub OAuth app credentials (create a GitHub OAuth App, callback pointing at
your dashboard's Supabase Auth callback) and enable the GitHub provider in the Supabase
dashboard (Authentication → Providers → GitHub). Keep all secrets in `.env`, never in
the repo.

### PROMPT (paste into Claude Code, pointing at dashboard/)

```
Read ../CONTEXT.md. Phase 8 of the Claude Room product: turn the Phase 4 Nuxt dashboard
into the multi-Room, logged-in owner dashboard. Product name in the UI is "Claude Room".
Keep the secret key server-only (never sent to the browser). Do only Phase 8.

Model recap: a Room = a Claude account email. An owner sees their Room if their VERIFIED
GitHub login email equals a Room's account_email. Scoping is enforced server-side from
the verified session - never from a client-supplied value.

1. Auth: add GitHub login via Supabase Auth to the Nuxt app (use the standard Nuxt +
   Supabase Auth approach - @nuxtjs/supabase or @supabase/ssr, your call, but the SECRET
   key must stay server-only; login uses the publishable/anon key + Supabase Auth). A
   logged-out visitor sees a clean "Sign in with GitHub" screen that states plainly:
   "Log in with the GitHub account whose email matches your Claude account."

2. Server route server/api/my-room.get.ts (Nitro, secret key, the ONLY place the secret
   key is used):
   - Read the authenticated user from the request server-side; get their verified email.
     If not logged in, return 401.
   - Look up whether that email is in admins (for later; for now non-admins only see
     their own Room).
   - Call get_room_window_summary(<verified email>) + pull daily_usage / latest_per_user
     for that same email (filtered by account_email) using the secret key. Also fetch the
     rooms row (name) for that email.
   - Return combined JSON: room name, tracked email, account 5h/7d + resets, per-member
     rows (window_cost, tokens, model, last recorded_at), daily rows. NEVER return raw
     snapshot rows or anything but these aggregates.
   IMPORTANT: the email comes from the verified session, NOT a query param, so a user can
   only ever get their own Room.

3. Server route server/api/room-name.post.ts: lets the logged-in owner set/rename their
   Room (upserts rooms(claude_email = their verified email, room_name)). Verified email
   only - an owner can only name their own Room.

4. UI with shadcn-vue (Vue port of shadcn - NOT React shadcn; if a shadcn-vue
   registry/MCP tool is available use it to add components, else use the shadcn-vue CLI;
   follow shadcn-vue's Nuxt setup). Build pages/index.vue to the following, fetching
   /api/my-room via useFetch (client never touches Supabase directly):
   - Top bar: "Claude Room" wordmark, signed-in user, sign out.
   - Room header: editable Room name (calls /api/room-name), the tracked Claude account
     email, 5h and 7d account progress bars with live reset countdowns, and total window
     cost labelled "API-equivalent (Max plan - not real spend)".
   - Member grid: a card per member - display name, their slice of the 5h limit
     (headline, = their window_cost / sum of window_cost * account_5h_pct), window cost,
     tokens in/out, current/last model, last-seen relative time, and an active/idle dot
     (active = recorded_at within last ~5 min; dim the card if idle > 30 min). Sort by
     slice descending; colour the slice cool -> amber -> red.
   - Insights strip: top user this window, most active today, total sessions, peak day
     (derive from the returned rows - no new endpoints).
   - Daily activity: a table from daily_usage (per day: peak 5h, peak 7d, cost, sessions).
   - Empty state (Room has rows but nothing in window / brand new): "No usage yet for
     {room} - data appears here once a Room member runs Claude Code." Make this visually
     DISTINCT from an error/failed-fetch state.
   - First-login naming: if the matched Room has usage but rooms.room_name is null,
     prompt the owner to name it.
   - Auto-refresh every 30s.
   Modern, legible, standard product styling - use shadcn-vue components (cards, badges,
   progress, table, dialog for renaming). This is an industry-grade internal product.

Keep it in the same repo as extension/, its own Nuxt app. Secret key server-only -
we'll verify that in the test.
```

### Seed a fake Room for controllable UI testing (do this once, before the TEST below)

Real data from `rashid@iocod.com` is genuine but not controllable — you can't easily
force "5 members, one near the 5h limit, one idle for days" on demand. For testing the
UI's visual states (crowded grid, near-limit colours, idle/dimmed cards, empty state),
seed a disposable fake Room instead. Ask Claude Code:

```
Write scripts/seed-test-room.js (dev-only, not shipped, not referenced by the extension
or dashboard). Using the Supabase JS client with the SERVICE ROLE key (read from
env/.env, never hardcoded), insert a handful of usage_snapshots rows for
account_email = 'test-room@example.com': 4 distinct user_names, varied cost_usd /
five_hour_pct (one near 90%, one near 10%), varied recorded_at (some in the last few
minutes = "active", one a few hours old = "idle"), all sharing a recent
five_hour_resets_at / seven_day_resets_at so they fall in the same window. Also add a
delete-test-room.js counterpart that deletes every row where account_email =
'test-room@example.com', for cleanup. Print counts before/after so I can confirm.
```

Run `node scripts/seed-test-room.js`, then view `test-room@example.com` via the admin
page (Phase 9) once it exists — or temporarily point `/api/my-room` at it while testing
Phase 8 in isolation. Run `delete-test-room.js` when done so it doesn't linger as a
stray Room in `list_rooms()`.

### TEST

- `pnpm install && pnpm dev` in `dashboard/`. Sign in with GitHub using the account whose
  email matches your Claude Room email → confirm you see **your** Room, named, with
  member cards, insights, and the daily table populated from real synced data.
- **Secret-key check (do this every dashboard phase):** DevTools → Network → reload →
  inspect the `/api/my-room` response and the page source. The secret key must appear
  **nowhere** the browser can see.
- **Isolation check:** sign in (or simulate) with an email that matches a *different*
  Room's `account_email` → confirm you get that Room only, never the first. Confirm a
  logged-out request to `/api/my-room` returns 401.
- Rename the Room in the UI → confirm `rooms.room_name` updated and the header reflects it.
- Confirm slices across members roughly sum toward the account 5h % in the header.

### CHECKPOINT

`git commit -am "Phase 8: Claude Room dashboard - GitHub login, Room-scoped owner view" && git tag v1.3-room-dashboard`

---

# Phase 9 — Admin page: separate login, list every Room, open any one

**Goal:** a dedicated `/admin` page, with its own Supabase email/password login (not
GitHub), where an admin lists every Room and opens any one of them, seeing exactly what
that Room's owner would see on `/`.

### Simpler notes

- **Why a different login method here, and not GitHub:** GitHub-plus-email-match exists
  to answer "does this person genuinely control the Claude account this Room is named
  after?" — the right question for an *owner*, who has no other credential. An admin
  isn't proving they own any particular Room; they're a small, fixed set of known
  operators (you). A plain Supabase email/password account is the right tool for that —
  simpler, and it doesn't force an admin's personal GitHub email to match anything.
- **`/admin` is a fully separate page and route tree from `/`.** Different login screen,
  different session check, no shared "Admin badge" logic living inside the owner page.
  An owner visiting `/` never sees any hint that `/admin` exists.
- **Create the admin login in Supabase first** (do this once, outside any prompt):
  Supabase Dashboard → **Authentication → Users → Add User** → enter your email
  (`ashfaqevp@gmail.com`) and a password → check **"Auto Confirm User"** so it doesn't
  wait on an email you'd have to click. This is a real login credential, separate from
  the `admins` table you seeded in Phase 7 — that table is *authorization* (who's allowed
  through once logged in), this user is *authentication* (proving it's you). Make sure
  the same email exists in both: if Phase 7 seeded a placeholder
  (`rashid@iocod.com`), update it:
  ```sql
  insert into public.admins (email) values ('ashfaqevp@gmail.com')
  on conflict (email) do nothing;
  ```
- The admin route is the *one* place a Room email is allowed to come from the client (an
  `?email=` param) — and it's only ever trusted after the server independently confirms
  the logged-in session's email is in `admins`. The client cannot self-declare adminhood.

### PROMPT (paste into Claude Code, pointing at dashboard/)

```
Read ../CONTEXT.md. Phase 9 of Claude Room: build a SEPARATE /admin page with its own
Supabase email/password login (NOT GitHub - that's for the owner page at / only). An
admin lists every Room and can open any of them, reusing the same Room-view component
the owner sees at /, but reached only via /admin. Do only Phase 9.

I have already created a Supabase Auth user with email/password for myself
(ashfaqevp@gmail.com) via the Supabase dashboard, and confirmed that email exists in
the admins table. Assume that setup is done.

1. pages/admin/login.vue: a plain email/password sign-in form using Supabase Auth's
   password grant (NOT the GitHub OAuth flow used on /). On success, redirect to
   /admin. On failure, show a clear error. This page and / must not share a login
   component - keep them visually and structurally separate (this is a distinct
   operator tool, not a variant of the owner page).

2. Server route server/api/admin/rooms.get.ts (secret key, server-only): read the
   authenticated session server-side, get its email, confirm it exists in admins
   (else 403 - do not reveal whether the email exists, just 403). Return list_rooms()
   (claude_email, room_name, member_count, last_active, current 5h %).

3. Server route server/api/admin/room.get.ts: takes ?email=<room email>, re-confirms
   the caller is an admin server-side (403 otherwise, checked independently on this
   route too - do not rely on the client having passed the rooms.get.ts check
   earlier), then returns the SAME combined payload /api/my-room (Phase 8) returns but
   for the requested email. The requested email is ONLY ever trusted after the admin
   check passes.

4. pages/admin/index.vue (route: /admin): requires a valid admin session (redirect to
   /admin/login if not authenticated or not in admins). Shows:
   - A simple top bar: "Claude Room — Admin", signed-in admin email, sign out.
   - A Room switcher: a table/list from /api/admin/rooms (Room name or email,
     member_count, last_active, current 5h %), sorted by last_active.
   - Selecting a Room renders the SAME Room-view component built in Phase 8 (Room
     header, member grid, insights, daily table, empty state) fed by
     /api/admin/room?email=..., so admin and owner see visually identical Room views.

5. Keep / (the owner page) completely untouched - no admin link, badge, or mention
   anywhere on it. The two are discovered only by URL.

Reuse the Phase 8 Room-view component rather than rebuilding it. Same secret-key-
server-only rule as every prior phase.
```

### TEST

- Visit `/admin` logged out → redirected to `/admin/login`. Log in with
  `ashfaqevp@gmail.com` → land on `/admin`, see the Room switcher listing every real
  Room (including `rashid@iocod.com`, and `test-room@example.com` if you seeded it in
  Phase 8) with sensible stats.
- Select `rashid@iocod.com` → confirm it renders the full Room view with real synced
  data, identical in layout to what an owner would see on `/`.
- Select `test-room@example.com` (if seeded) → confirm the varied member states (active/
  idle, near-limit colouring) render correctly — this is what the seed script was for.
- Try hitting `/api/admin/rooms` and `/api/admin/room?email=rashid@iocod.com` directly
  **without** being logged in as an admin → confirm both return **403** (show it).
- Confirm `/` (owner page) shows no trace of `/admin` anywhere.
- Repeat the Network-tab secret-key check on the `/admin` pages.

### CHECKPOINT

`git commit -am "Phase 9: separate /admin page - email/password login, list & open any Room" && git tag v1.4-admin`

---

# Phase 10 — Extension UI/UX polish (Claude Room panel)

**Goal:** bring the extension's webview up to the same industry standard as the
dashboard — full detail, modern, theme-aware — and show the Room name + tracked account.

### Simpler notes

- Webviews are plain HTML/CSS/JS (no shadcn), but using VS Code's `--vscode-*` theme
  variables makes the panel match the editor theme automatically — the single highest-
  value polish move.
- This is cosmetic + the Room-name display; the data plumbing from Phase 6 is unchanged.

### PROMPT (paste into Claude Code)

```
Read CONTEXT.md. Phase 10 of Claude Room: redesign the extension's webview panel to an
industry-standard, theme-aware UI, and show the Room name. Keep all Phase 6 data
behavior. Do only Phase 10.

1. Redesign the "Claude Usage: Show my usage" webview (rename its title to "Claude Room")
   as a clean, modern panel styled entirely with VS Code theme CSS variables (--vscode-*)
   so it matches the user's light/dark editor theme. Sections:
   - Header: "Claude Room" + the Room name if available (see step 2) + a line "Tracking
     Claude account: <email>" from readClaudeAccountEmail(). If the email is null, show a
     quiet warning: "Couldn't read your Claude account email - usage tracked as 'unknown'".
   - Your usage: your slice ("you ~= X% of the shared 5h limit (team at Y%)"), account
     5h and 7d progress bars with reset countdowns, your window cost + tokens in/out,
     your current model.
   - Recent activity: a compact daily-peaks list (from the local log, as today).
   - Empty/error states written out - never a blank panel (e.g. "Waiting for your first
     Claude Code session in this window").
   Use cards, subtle borders, good spacing, accessible contrast via the theme variables.

2. Room name in the extension: IF Phase 7 exposed get_room_name(email) to anon, fetch it
   with the extension's existing publishable key and the tracked email, and show it in the
   header. If that RPC wasn't exposed, just show the tracked email (no name) - degrade
   gracefully, don't error.

3. Also update the status bar item text/tooltip to reflect Claude Room naming for
   consistency (keep it terse).

Null-safe throughout. No new data leaves the machine beyond what Phases 3/6 already send.
```

### TEST

- F5 → open the "Claude Room" panel. Toggle VS Code between a light and dark theme and
  confirm the panel restyles to match (the `--vscode-*` variables working).
- Confirm the Room name shows (if you exposed `get_room_name`) or the tracked email shows
  (if you didn't), and that the null-email warning appears if `~/.claude.json` is
  temporarily moved.
- Confirm your slice, bars, countdowns, cost/tokens, model, and recent activity all
  render from the local log.

### CHECKPOINT

`git commit -am "Phase 10: Claude Room extension panel - modern, theme-aware, Room name" && git tag v1.5-room-extension`

---

## Future hardening (documented now, not built in this phase)

Kept here so the project stays legible and these are deliberate deferrals, not
oversights:

1. **Authenticated, Room-scoped inserts.** Replace the shipped-key `with check (true)`
   insert policy with authenticated writes (e.g. the extension signs in via VS Code's
   built-in GitHub auth API → Supabase session; RLS allows inserting only rows whose
   `user_id` is the caller and whose Room the caller belongs to). Closes the "anyone with
   the key can inject rows" gap. Not needed while usage is a handful of internal devs.
2. **Google login (and any provider whose verified email can match a Claude account).**
   Same email-match logic as GitHub; just another Supabase Auth provider. Lead with
   Google later since many Claude accounts are Google-based.
3. **`CLAUDE_CONFIG_DIR` guidance for dual-account users.** If a member genuinely runs a
   personal Claude account on the same machine, document using a separate
   `CLAUDE_CONFIG_DIR` for it, so the two never share `~/.claude.json`. (In the current
   model their personal usage already routes to a separate Room, so this is belt-and-
   suspenders, not required.)
4. **Timestamp plausibility check** (`mapToRow()` / insert): reject `recorded_at` values
   implausibly far from now (before install date, or in the future) to catch the
   "valid-but-wrong timestamp" class from `DATA_SOURCES.md` edge cases 10 & 12. Doesn't
   close the theoretical gap; catches the realistic epoch/zero-value case.
5. **Hard account filter (only if ever wanted).** Actively excluding non-matching
   sessions is unnecessary in this model (routing handles it) and dangerous as a default
   (a Claude Code update nulling the email field would zero out a whole Room). If ever
   built, it must fall back to "attribute by Room, don't zero out" on a systemic null.
6. **Invite / approval / expiry.** Only if Rooms ever need to be private beyond "you must
   control the matching email." Not needed for implicit, email-keyed Rooms.
7. **Re-verify `oauthAccount.emailAddress` on Claude Code updates**, same as the
   status-line schema re-test in the original guide's future-proofing checklist. If the
   field ever moves, update `readClaudeAccountEmail()`; the `'unknown'` bucket keeps data
   safe in the meantime.
