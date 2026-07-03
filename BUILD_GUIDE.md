# Claude Team Usage — Build Guide

A step-by-step guide to building the usage tracker **with Claude Code**, one phase
at a time. Each phase is a prompt you paste into Claude Code inside the repo, plus
how to test it before moving on.

Start at Phase 1 — nothing before this guide counts as done yet.

---

## How to use this guide

1. Keep this file (`BUILD_GUIDE.md`) in the repo root.
2. For each phase, paste the **PROMPT** block into your Claude Code session in this repo.
3. Run the **TEST** for that phase. Don't move on until it passes.
4. Commit at each **CHECKPOINT**.
5. Because Phase 2 creates `CONTEXT.md`, every later prompt starts by telling Claude
   Code to read it — so even a fresh session has the full picture.

---

## Architecture (4 lines)

- Each Mac: a status-line hook (`usage-logger.js`) captures accurate per-session
  data from Claude Code and appends it to a **local** log. No network here.
- A VS Code extension reads that local log, shows the junior their own usage, and
  (Phase 3+) pushes small aggregates to Supabase.
- Supabase stores snapshots. Juniors' key can only insert; a read-only RPC returns
  aggregates so a junior can see their own slice.
- A dashboard (service key) shows every junior's slice + who used most.

## The core calculation (read this before building)

Two numbers, only one is per-device:

- `rate_limits.five_hour.used_percentage` = **account-wide** shared %. Identical on
  all three Macs at any instant. This is the accurate *total* ("the 90%").
- `cost.total_cost_usd` = **per-session, per-device** consumption. This is where the
  *split* comes from.

Per-device slice of the 5-hour limit:

```
device_slice = (device_window_cost / total_window_cost) * account_five_hour_pct
```

Rules that matter:
- `cost.total_cost_usd` is **cumulative within a session**, so aggregate by
  `session_id` and take the **latest snapshot per session**. Never sum raw rows.
- The current 5-hour window ends at the latest `five_hour_resets_at` seen; window
  start = that minus 5 hours. A session counts if its latest `recorded_at` is inside
  the window. (Boundary attribution is approximate — acceptable for v1.)
- The account % is the same everywhere; take the most recent one seen from any machine.
- Do **not** measure from the JSONL transcript token counts — Claude Code currently
  writes input tokens as a streaming placeholder, so those sums are 100x+ too low.
  The status-line `cost` and token totals are the accurate source.

## Sample status-line payload (for offline testing)

Save this as `sample-status.json` in the repo. It's the shape Claude Code pipes to a
status-line script on stdin.

```json
{
  "hook_event_name": "Status",
  "session_id": "abc123-def456",
  "cwd": "/Users/junior1/projects/easify-app",
  "model": { "id": "claude-sonnet-4-6", "display_name": "Sonnet 4.6" },
  "workspace": { "current_dir": "/Users/junior1/projects/easify-app", "project_dir": "/Users/junior1/projects/easify-app" },
  "version": "1.2.80",
  "cost": { "total_cost_usd": 0.4821, "total_duration_ms": 452000, "total_api_duration_ms": 38000, "total_lines_added": 156, "total_lines_removed": 23 },
  "context_window": { "total_input_tokens": 15234, "total_output_tokens": 4521, "context_window_size": 200000, "used_percentage": 42.5, "remaining_percentage": 57.5 },
  "rate_limits": { "five_hour": { "used_percentage": 30, "resets_at": 1751520000 }, "seven_day": { "used_percentage": 12, "resets_at": 1751800000 } }
}
```

Note: `rate_limits` is null until Claude Code makes its first API call in a session,
and the field only exists in Claude Code v1.2.80+. Check `claude --version` on all
three Macs. Always code with null-safe fallbacks.

---

# Phase 1 — Repo + the logger script, tested offline

**Goal:** a real git repo, with the status-line logger script inside it, proven to
work using the sample payload — before it ever touches your real Claude Code install.

### Do this part yourself (not a Claude Code prompt)

```bash
mkdir claude-team-usage && cd claude-team-usage
git init
gh repo create claude-team-usage --public --source=. --remote=origin   # or --private
code .   # open in VS Code, start a Claude Code session in this folder
```

### PROMPT (paste into Claude Code, inside the new repo)

```
We're building a VS Code extension called "claude-team-usage" that tracks how much
of a SHARED Claude Max plan each developer uses (3 developers, 1 account, 3 Macs).
This is Phase 1 of a multi-phase build — do only Phase 1.

1. Create media/usage-logger.js — a Node script that will later run as Claude Code's
   status-line hook. It must:
   - Read JSON from stdin (Claude Code pipes session data to it on every render).
   - Print a plain one-line status bar to stdout: model display name, context %,
     rate_limits.five_hour.used_percentage, rate_limits.seven_day.used_percentage.
     All fields may be missing/null (a fresh session has no rate_limits yet) — never
     throw, fall back to "--".
   - Append a JSON snapshot to ~/.claude/team-usage/local-log.jsonl whenever the
     five_hour_pct, seven_day_pct, or cost.total_cost_usd differs from the last
     snapshot (track the last one in ~/.claude/team-usage/last.json so we don't write
     a row on every render). Snapshot fields: ts (ISO string), session_id, cost_usd,
     five_hour_pct, five_hour_resets_at, seven_day_pct, seven_day_resets_at, model,
     total_input_tokens, total_output_tokens.
   - Wrap everything in try/catch — logging must never blank the status bar.

2. Create sample-status.json in the repo root with realistic sample data matching
   Claude Code's real status-line schema (session_id, cwd, model.id/display_name,
   workspace, version, cost.total_cost_usd, context_window.*, rate_limits.five_hour.*,
   rate_limits.seven_day.*).

3. Create CONTEXT.md capturing these decisions for future sessions:
   - Goal: per-device usage tracking on one shared Claude Max account, 3 Macs.
   - Data source: Claude Code's status-line JSON on stdin only. Never parse
     ~/.claude/projects/*.jsonl — its token counts are known-buggy placeholders.
   - Two numbers: rate_limits.* is account-wide (identical on every machine); 
     cost.total_cost_usd is per-device, per-session, and CUMULATIVE within a session.
   - Per-device slice formula: (device_window_cost / total_window_cost) * account_5h_pct.
   - Aggregation rule: group by session_id, take the LATEST snapshot per session —
     never sum raw rows, since cost accumulates within a session.
   - Privacy: only aggregate numbers leave a machine (cost, tokens, percentages,
     timestamps, model, session_id, machine, user name). Never prompts, code, or
     file contents.
```

### TEST — do this before touching your real Claude Code install

```bash
cat sample-status.json | node media/usage-logger.js
cat ~/.claude/team-usage/local-log.jsonl
```
You should see a printed status line, and one JSON row in the log file. Edit a
percentage in `sample-status.json`, run the pipe again, confirm a **second** row
appends (proving the "only log on change" logic works) — then run it a third time
unchanged and confirm it does **not** append a duplicate row.

### Only once that passes — wire it into your real Claude Code

```bash
mkdir -p ~/.claude/team-usage
cp media/usage-logger.js ~/.claude/team-usage/usage-logger.js
```
Add to `~/.claude/settings.json` (merge if the file already has content):
```json
{ "statusLine": { "type": "command", "command": "node ~/.claude/team-usage/usage-logger.js" } }
```
Restart Claude Code, send it one real message, then check:
```bash
cat ~/.claude/team-usage/local-log.jsonl
```
A row with real data should appear. This confirms the logger works against your
actual Claude Code, not just the sample file.

### CHECKPOINT
`git add -A && git commit -m "Phase 1: logger script, tested offline and live" && git tag v0.0-logger`

---

# Phase 2 — Extension shell (fully local, no Supabase yet)

**Goal:** a VS Code extension that owns the logger, wires it into Claude Code
automatically, and shows the junior their own usage in the status bar — all from the
local log, before any sync exists.

### PROMPT (paste into Claude Code)

```
We're building a VS Code extension called "claude-team-usage" that tracks how much
of a SHARED Claude Max plan each developer uses. This is Phase 2 of a multi-phase
build. Do only Phase 2.

First, create CONTEXT.md in the repo root capturing these decisions, so future
sessions have context:
- Goal: on a shared Claude Max account used by 3 developers on separate Macs, show
  each developer their own share of the 5-hour and 7-day limits, and give the admin
  a dashboard of all three.
- Data source: Claude Code's status-line JSON on stdin. Accurate fields we use:
  session_id, model.display_name, cost.total_cost_usd (cumulative per session),
  rate_limits.five_hour.used_percentage + resets_at, rate_limits.seven_day.*.
  Do NOT parse ~/.claude/projects/*.jsonl token counts — they are buggy placeholders.
- Two numbers: rate_limits.* is account-wide (same on every machine); cost.total_cost_usd
  is per-device. Per-device slice = (device_window_cost / total_window_cost) * account_5h_pct.
- Aggregation rule: group by session_id, take the latest snapshot per session, because
  cost is cumulative within a session.
- Privacy: only aggregate numbers (cost, tokens, percentages, timestamps, model,
  session_id, machine, user name) ever leave a machine. Never prompts, code, or file
  contents.
- Layout: statusline hook logs locally (no network); extension reads local log, shows
  the user's own usage, and later syncs aggregates to Supabase; dashboard reads Supabase.

Then implement Phase 2:

1. Write the canonical status-line logger at media/usage-logger.js. It reads stdin
   JSON, prints a normal one-line status bar to stdout (model + context% + 5h% + 7d%),
   and appends a snapshot to ~/.claude/team-usage/local-log.jsonl. Append when the
   5h%, 7d%, OR cost.total_cost_usd changed since the last snapshot (track the last
   snapshot in ~/.claude/team-usage/last.json to avoid flooding). Snapshot fields:
   ts (ISO), session_id, cost_usd, five_hour_pct, five_hour_resets_at, seven_day_pct,
   seven_day_resets_at, model, total_input_tokens, total_output_tokens. Must never
   throw in a way that blanks the status bar — wrap everything in try/catch.

2. Scaffold a TypeScript VS Code extension (package.json, tsconfig.json, src/extension.ts).
   On activation:
   - Ensure ~/.claude/team-usage/ exists; copy media/usage-logger.js there.
   - Read ~/.claude/settings.json; if there is no statusLine, set it to
     { "type": "command", "command": "node \"<absolute path to the copied logger>\"" }.
     If a statusLine already exists and isn't ours, ask before replacing and back up
     the file to settings.json.bak. Use the ABSOLUTE path (os.homedir()), not "~".
   - Create a status bar item and update it every 30s from the local log ONLY.

3. Status bar logic (local-only for now): read local-log.jsonl, aggregate the current
   user's sessions in the current 5-hour window (group by session_id, latest per
   session, window from latest five_hour_resets_at minus 5h). Show:
   "$(pulse) 5h <account_pct>% team · you $<your_window_cost>". Tooltip: reset
   countdown, 7d %, your token totals, your session cost this window. Colour the item
   warning/error as account_pct crosses 50/80.

4. Add a command "Claude Usage: Show my usage" that opens a webview panel with two
   progress bars (5h and 7d account %), the user's own cost/tokens this window, and a
   small table of daily peaks computed from the local log.

Use null-safe access everywhere (rate_limits can be null). Do not add any network or
Supabase code in this phase. Keep everything in memory / local files.
```

### TEST

- `cat sample-status.json | node media/usage-logger.js` → prints a status line and
  writes a row to `~/.claude/team-usage/local-log.jsonl`. Edit the sample's cost and
  percentages, run again, confirm a new row appends.
- Press **F5** to launch the Extension Development Host. Confirm the status bar item
  appears and shows the account % + your cost from the local log.
- Run "Claude Usage: Show my usage" → the panel renders.
- Open `~/.claude/settings.json` → confirm the `statusLine` now points at the logger.

### CHECKPOINT
`git add -A && git commit -m "Phase 2: local-only extension + logger" && git tag v0.1-local`

---

# Phase 3 — Supabase (schema, insert-only key, read-only RPC, sync)

**Goal:** snapshots flow to Supabase; juniors can insert but not read raw rows; a
read-only RPC lets a junior see their own slice and the team total.

**Key naming note:** Supabase now calls these keys "publishable" and "secret" (older
projects/docs may still say "anon" and "service_role") — same two roles, same
behavior. Wherever this guide says "anon key," use your **publishable key**.
Wherever it says "service role key," use your **secret key**.

**Automation note:** if your Claude Code session has a Supabase MCP connection with
access to this project, tell it so in the prompt (project ID: your Supabase project
ref, visible in the dashboard URL) — it can apply the migration directly and verify
it with real queries, instead of you copy-pasting SQL into the web editor by hand.
The prompt below covers both paths.

### PROMPT (paste into Claude Code)

```
Read CONTEXT.md. This is Phase 3: add Supabase. Keep everything from Phase 2 working
(the local log stays the source of truth; sync is additive).

My Supabase project ID is: htrxdxtbrkdabrrqbpyr
If you have a connected Supabase tool that can reach this project ID, use it directly
to apply the migration and to verify it — don't just write a file and stop. If you
don't have Supabase tool access, write supabase/schema.sql instead and tell me
exactly what to paste into the Supabase SQL editor.

1. Migration (apply directly if you can, else write to supabase/schema.sql):
   - Table public.usage_snapshots (id bigint identity PK, user_name text not null,
     machine text, session_id text, cost_usd numeric, five_hour_pct numeric,
     five_hour_resets_at timestamptz, seven_day_pct numeric, seven_day_resets_at
     timestamptz, model text, input_tokens numeric, output_tokens numeric,
     recorded_at timestamptz not null, inserted_at timestamptz default now()).
   - Index on (user_name, recorded_at desc) and on (session_id).
   - Enable RLS. Revoke all from anon, then grant INSERT only. Add an insert policy
     for anon with check (true). Anon must NOT be able to select raw rows.
   - A SECURITY DEFINER function public.get_team_window_summary() that returns, for
     the CURRENT 5-hour window: one row per user_name with their window_cost (sum of
     the latest cost_usd per session_id whose latest recorded_at is within the window),
     plus the latest account five_hour_pct, seven_day_pct, five_hour_resets_at, and
     seven_day_resets_at seen across all rows. Grant EXECUTE to anon. This returns
     aggregates only — no raw rows, no prompt/content data.
   - A view public.latest_per_user (distinct on user_name, latest row) and a view
     public.daily_usage (per user_name, per day in Asia/Kolkata: peak_5h, peak_7d,
     sum of latest-per-session cost, session count). Grant select on these to
     service_role only (the dashboard uses the secret/service role key).

   If you applied this directly: immediately verify with real queries — insert one
   test row via execute_sql, call get_team_window_summary() and confirm it returns
   the row, then try to select raw rows from usage_snapshots AS IF you were the anon
   role (or explain how you confirmed RLS blocks it) and report the results plainly
   before moving on.

2. In the extension, add config settings: claudeUsage.supabaseUrl,
   claudeUsage.supabaseAnonKey, claudeUsage.userNameOverride (optional, empty by default).
   Add src/identity.ts that resolves the user's identity with this priority, no login
   involved:
   a. If userNameOverride is set in config, use it.
   b. Else run `git config --global user.email` and `git config --global user.name`
      (execSync, wrapped in try/catch). If email exists, use "name <email>" (or just
      email if name is empty) as user_name.
   c. Else fall back to a generated device id: check for
      ~/.claude/team-usage/device-id.txt; if missing, create it with a random UUID
      and use "device-<first 8 chars>" as user_name.
   This is identity for labeling only, not authentication — note that in a code
   comment. Cache the resolved identity in memory for the session (don't re-run git
   config every 30s).

3. Add a sync step to the 30s timer: read local-log.jsonl, POST rows not yet synced
   (track a cursor in globalState) to <url>/rest/v1/usage_snapshots with the publishable key (aka anon key)
   (headers: apikey, Authorization Bearer, Prefer: return=minimal). Map local fields
   to table columns; convert epoch resets_at to ISO. Advance the cursor only on HTTP
   success. If url/key are unset, skip sync silently — local features still work.

4. Update the status bar and panel to call get_team_window_summary() via
   <url>/rest/v1/rpc/get_team_window_summary (publishable key). Compute the current user's
   slice = (my window_cost / sum of all window_cost) * account_five_hour_pct and show
   "you ≈ <slice>% of the shared 5h limit (team at <account_pct>%)". Fall back to the
   local-only display if the RPC is unreachable.

Null-safe throughout. Do not send prompts, code, or file contents — only the numeric
columns listed.
```

### TEST

If Claude Code applied the migration directly and reported verification results,
review what it showed you and sanity-check it makes sense — you don't need to repeat
the manual steps below. If it wrote `supabase/schema.sql` instead (no MCP access),
do these manually:

- Run `supabase/schema.sql` in the Supabase SQL editor (no errors).
- In the Supabase table editor, insert one row by hand. In the SQL editor run
  `select * from get_team_window_summary();` → returns your row aggregated.

Either way, finish with the real end-to-end test:

- Set the three config values (`supabaseUrl`, `supabaseAnonKey`, optional
  `userNameOverride`) in the Extension Development Host settings. Use Claude
  Code for real once → confirm a new row lands in `usage_snapshots` and the status bar
  now shows "you ≈ X% ... team at Y%".
- Confirm the publishable key **cannot** read raw rows: try `select * from usage_snapshots`
  with the publishable key (aka anon key) (via the REST URL) → should return nothing / be blocked by RLS.

### CHECKPOINT
`git commit -am "Phase 3: Supabase schema, insert-only anon, RPC, sync" && git tag v0.2-sync`

---

# Phase 4 — Admin dashboard

**Goal:** every junior's slice of the shared limit + who used most + a daily log —
built as a Nuxt 4 app in `dashboard/`, in the same repo as the extension.

**Why Nuxt over a static HTML file:** the secret/service-role key can live as a
**server-only** environment variable in Nuxt's Nitro layer, and never reach the
browser. The page calls your own server route; that route is the only thing that
talks to Supabase with the secret key. This also sets up cleanly for the
GitHub-login/rooms upgrade later, since Nitro server routes are where that OAuth flow
would live too.

### Setup (do this yourself first)

```bash
cd claude-team-usage
pnpm dlx nuxi@latest init dashboard
cd dashboard
```
Create `dashboard/.env` (never commit this — add `dashboard/.env` to `.gitignore`):
```
SUPABASE_URL=https://htrxdxtbrkdabrrqbpyr.supabase.co
SUPABASE_SECRET_KEY=<your secret/service_role key>
```

### PROMPT (paste into Claude Code, inside the dashboard/ folder or pointing at it)

```
Read ../CONTEXT.md. Phase 4: build the admin dashboard as a Nuxt 4 app in dashboard/,
in this same repo, alongside the extension/ folder.

1. In nuxt.config.ts, add runtimeConfig with a server-only supabaseUrl and
   supabaseSecretKey, sourced from the .env (SUPABASE_URL, SUPABASE_SECRET_KEY).
   These must NOT be in the `public` runtimeConfig — server-only, never sent to the
   browser.

2. Create server/api/team-summary.get.ts — a Nitro server route that uses the secret
   key to call our Supabase project's REST/RPC endpoints server-side: fetch
   get_team_window_summary(), latest_per_user, and daily_usage. Return their combined
   result as JSON. This is the ONLY place the secret key is used.

3. Create pages/index.vue — fetches /api/team-summary (useFetch, client never touches
   Supabase directly). Render:
   - A header: shared 5h% and 7d% with reset countdowns.
   - A card per user: their estimated slice of the 5h limit (their window_cost /
     total window_cost * account_5h_pct), window cost, tokens, model, last-seen.
     Sort by slice descending. Colour cool→amber→red by level. Dim users idle >30 min.
   - A "daily peaks" table below from the daily_usage data.
   - Auto-refresh every 30s (useFetch refresh or setInterval + refresh()).

4. Label cost clearly as "API-equivalent" (not real spend, since this is a Max plan).
   Use plain, readable typography — this is an internal ops dashboard, not a marketing
   page, so prioritize legibility over flourish.

Keep this in the same repo as extension/ but as its own Nuxt app with its own
package.json — no shared build tooling needed between the two.
```

### TEST

- `pnpm install && pnpm dev` inside `dashboard/`, open the local URL.
- Confirm the page loads real data from your Supabase project (the row from earlier
  testing, plus anything synced since).
- **Confirm the secret key never reaches the browser**: open DevTools → Network tab,
  reload the page, inspect the `/api/team-summary` response and the page source —
  the key should appear nowhere in anything sent to the browser.
- Confirm slices across users roughly sum to the shared account % shown in the header.

### CHECKPOINT
`git commit -am "Phase 4: admin dashboard (Nuxt 4, server-side secret key)" && git tag v0.3-dashboard`

### Deploying it later
Since you already use Vercel, `dashboard/` deploys there directly — set
`SUPABASE_URL`/`SUPABASE_SECRET_KEY` as Vercel environment variables (never in the
repo). Not required now; local `pnpm dev` is enough while you're the only viewer.

---

# Phase 5 — Package and hand out

### PROMPT (paste into Claude Code)

```
Read CONTEXT.md. Phase 5: prepare for distribution.
- Add a README.md: what the tool does, exactly what data is and isn't collected,
  install steps ("Install from VSIX"), and the schema-version note (rebuild/re-test
  if Claude Code's status-line format changes).
- Set sensible defaults for supabaseUrl and the ANON key in package.json config so
  juniors only need to set their userName (or auto-derive it). Never put the service
  key anywhere in the extension.
- Add an .vscodeignore so the packaged .vsix stays small but includes media/.
- Add the vsce package script and confirm `pnpm dlx @vscode/vsce package` produces a .vsix.
```

### Then, outside Claude Code

- `pnpm dlx @vscode/vsce package` → `claude-team-usage-x.y.z.vsix`.
- Create a GitHub Release, attach the `.vsix`.
- Each junior: Extensions panel → `…` → **Install from VSIX** → set their `userName`.
- You: open `dashboard/index.html`, enter your service key once.

### CHECKPOINT
`git commit -am "Phase 5: packaging + README" && git tag v1.0`

---

## Future-proofing checklist

- **Null-safe always.** `rate_limits` is null on fresh sessions and didn't exist
  before Claude Code v1.2.80. Degrade to "--", never crash.
- **Re-test on Claude Code updates.** The whole thing rides on the status-line JSON
  shape. When Claude Code updates, re-run the Phase 2 pipe test against a fresh real
  payload before assuming a break.
- **Local-first.** Snapshots are always captured locally; sync is best-effort. If
  Supabase is down, nothing is lost — it flushes when it's reachable.
- **Coverage is honest.** Capture happens when Claude Code draws a status line, i.e.
  terminal sessions (standalone or VS Code's integrated terminal). Note this in the
  README so no one expects a surface with no status line to be counted.
- **The split is an estimate.** Cost-share × account% is a good approximation, not an
  official per-device figure; the shared total is exact. Say so in the dashboard.
```