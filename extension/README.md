# Claude Team Usage

See your share of a shared Claude Max plan's 5-hour and 7-day rate limits, when
multiple developers use the same account from separate machines.

## What it does

Claude Code's status line reports account-wide rate-limit percentages, but on a
shared account those numbers are the same for everyone — they don't tell you how
much of that shared budget *you* personally used. This extension:

- Installs a status-line hook script (`media/usage-logger.js`) that reads Claude
  Code's status-line JSON on every render and appends a local snapshot whenever the
  5h%, 7d%, or cost numbers change.
- Shows a status bar item and a "Claude Usage: Show my usage" panel with the
  account's 5h/7d limits, your cost/tokens in the current window, and a table of
  daily peaks — computed entirely from your local log.
- Optionally syncs your snapshots to a shared Supabase project so the panel can
  also show "you ≈ X% of the shared 5h limit (team at Y%)", by combining everyone's
  per-device cost against the account-wide percentage. Sync is additive: if it's
  disabled or unreachable, the local-only view keeps working.

## What data is collected

**Locally** (always, in `~/.claude/team-usage/local-log.jsonl`): cost, token
counts, 5h/7d percentages and reset timestamps, model name, session id, and
timestamp. The status-line hook itself makes no network calls — it only writes
this local file.

**Synced to Supabase** (only if `claudeUsage.supabaseUrl` /
`claudeUsage.supabaseAnonKey` are set — on by default to the shared team project,
see below): the same aggregate fields, plus your configured/derived user name and a
machine label. Specifically: `user_name`, `machine`, `session_id`, `cost_usd`,
`five_hour_pct`, `five_hour_resets_at`, `seven_day_pct`, `seven_day_resets_at`,
`model`, `input_tokens`, `output_tokens`, `recorded_at`.

**Never collected or transmitted, by design:** prompts, code, file contents, file
paths, or anything else from your conversations or workspace. The Supabase anon
key shipped as the default is insert-only and can only call an aggregates-only RPC
— it cannot read back anyone's raw rows.

To disable sync entirely, set `claudeUsage.supabaseUrl` (or
`claudeUsage.supabaseAnonKey`) to an empty string in your VS Code settings. The
local-only status bar and panel keep working either way.

## Install from VSIX

1. Get `claude-team-usage-<version>.vsix` (built via `pnpm dlx @vscode/vsce package`
   from the `extension/` directory — see below).
2. In VS Code: Extensions view → `...` menu → **Install from VSIX...** → select the
   file. Or from the command line: `code --install-extension claude-team-usage-<version>.vsix`.
3. Reload the window. The extension wires itself up automatically — no manual setup
   is required for a shared-account teammate beyond installing it.

### Settings

| Setting | Default | Purpose |
|---|---|---|
| `claudeUsage.supabaseUrl` | shared team project URL | Where snapshots sync to. Empty disables sync. |
| `claudeUsage.supabaseAnonKey` | shared team project anon key | Insert-only, aggregates-only key. Empty disables sync. |
| `claudeUsage.userNameOverride` | *(empty)* | Label shown in shared usage data. Leave empty to auto-derive from your git identity (or a generated device id if git isn't configured). |

Most developers only need to check that `userNameOverride` resolves to something
recognizable — no other setup is required to get syncing working out of the box.

## Building the .vsix

```
cd extension
pnpm install
pnpm dlx @vscode/vsce package
```

This produces `claude-team-usage-<version>.vsix` in the `extension/` directory.

## Schema-version note

`media/usage-logger.js` and `src/usage.ts` parse Claude Code's status-line JSON by
field name (see `sample-status.json` for the shape this was built and tested
against). If Claude Code changes the status-line payload's schema — renamed,
restructured, or removed fields, especially under `rate_limits` or `cost` — rebuild
and re-run this extension's test suite (`pnpm test`, which runs
`scripts/verify-edge-cases.js`) against a fresh sample payload before relying on it
again. Every field access is null-safe, so a schema change degrades to missing
numbers rather than a crash, but the numbers shown could silently become wrong
(e.g. always zero) until this is checked.
