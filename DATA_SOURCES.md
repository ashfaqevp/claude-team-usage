
# Data Sources — what we actually read from Claude Code

This is the exact, honest list of what this tool reads, what it deliberately
ignores, and the known edge cases in how usage is calculated. Keep this file
updated whenever the calculation logic changes — it's the reference for "why does
this number look the way it does."

---

## A) The status-line JSON (live, piped to our logger — never saved by Claude Code itself)

Claude Code pipes this JSON to `media/usage-logger.js` on every status-line render.
It is **not** a file on disk — it only exists in that moment, on stdin. Our logger
is the only thing that persists any of it (to `~/.claude/team-usage/local-log.jsonl`).

| Field                                                           | We use it for                           | Notes                                                                  |
| --------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------- |
| `session_id`                                                  | grouping key for delta calculation      | one row per session per change                                         |
| `model.display_name`                                          | shown in status bar / dashboard         | reflects the*most recent* model only — see "Model switching" below  |
| `cost.total_cost_usd`                                         | the core usage number                   | cumulative for the session; we convert to a**delta** (see below) |
| `context_window.used_percentage`                              | local "ctx %" display                   | per-conversation memory fullness — unrelated to the 5h/7d plan limit  |
| `context_window.total_input_tokens` / `total_output_tokens` | raw token counts shown alongside cost   | informational only, not used in slice math                             |
| `rate_limits.five_hour.used_percentage` + `resets_at`       | the real, official shared account total | identical on every machine at a given instant                          |
| `rate_limits.seven_day.used_percentage` + `resets_at`       | same, for the weekly window             |                                                                        |

**Deliberately ignored fields** (present in the payload, not used — not an oversight):
`hook_event_name`, `cwd`, `model.id`, `workspace.*`, `version`,
`cost.total_duration_ms` / `total_api_duration_ms` / `total_lines_added` /
`total_lines_removed`, `context_window.context_window_size` / `remaining_percentage`.
None affect usage math.

**Fields that can be `null`:** `rate_limits.*` is null until a session's first real
API response comes back. All code handles this without crashing.

---

## B) Actual files on disk under `~/.claude`

| Path                                     | What it is                       | Do we read it?                                                                                                                                                                         |
| ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `~/.claude/settings.json`              | Claude Code's own config         | We read/write**only** the `statusLine` key. Nothing else is touched.                                                                                                           |
| `~/.claude/projects/*.jsonl`           | Real conversation transcripts    | **Deliberately never read.** Input token counts in these files are known-buggy placeholders (not final values) — using them would make our numbers *less* accurate, not more. |
| `~/.claude/team-usage/local-log.jsonl` | Our own snapshot log             | Written by our logger, read by the extension. Not Anthropic's — ours.                                                                                                                 |
| `~/.claude/team-usage/last.json`       | Our own "last snapshot" bookmark | Used to detect changes and avoid flooding the log.                                                                                                                                     |

---

## The core calculation, as actually implemented

**Cost is delta-based, not cumulative-snapshot-based.** For each `session_id`, we
track the last known cost. Each new snapshot's contribution to "usage since we last
checked" is:

```
delta = max(0, new_cost - last_known_cost_for_this_session)
```

The `max(0, ...)` clamp is the resume-bug protection (see below). The delta —
not the running total — is what gets attributed to whichever time window it
actually happened in. This avoids over-counting a long session that spans a
5-hour reset boundary, which the original "take the latest total" design would
have double-counted.

**Per-device slice of the shared 5-hour limit:**

```
your_slice ≈ (your window_cost / everyone's window_cost) × account_five_hour_pct
```

The total (`account_five_hour_pct`) is always exact — it comes straight from
Anthropic. Only the *split between people* is an estimate, because Anthropic
doesn't expose a true per-person breakdown on a shared account.

---

## Known edge cases and how they're handled

1. **Session resume cost reset (Claude Code bug, GitHub #13088).** Resuming an old
   session has been observed to reset its reported cost to a lower value instead of
   continuing from its real prior value. Handled by the delta approach above: each
   new snapshot's delta is `max(0, new_cost - last_known_cost)`, so a drop produces a
   delta of zero (ignored, not subtracted) rather than corrupting the running total.
   Deliberately *not* handled by clamping to the highest cost ever seen for the
   session — that simpler approach would hide any real spend that accrues between the
   reset and the point the total climbs back past its old peak. This does not fix the
   upstream bug; it stops it from corrupting our numbers.
2. **A session spanning a 5-hour reset boundary.** Fixed by the delta approach above
   — only the actual increase gets attributed to a window, not the session's whole
   running total. Residual imprecision: a single delta *interval* (the gap between
   two consecutive status-line updates) can itself straddle the boundary. This is a
   small, bounded error — at most one status-line interval's worth — not a
   whole-session error.
3. **Consistency between the extension and the dashboard.** The delta/clamp logic
   must be implemented identically in the extension's local aggregation AND in
   Supabase's `get_team_window_summary()` / `daily_usage`. If these ever drift apart,
   the two views will disagree. Check both any time this logic changes.
4. **Model switching within one session.** No calculation issue — `cost.total_cost_usd`
   is already priced per-call by Claude Code's own internal price table, so a
   session mixing Sonnet and Opus already has a correctly-priced total in USD. We
   only display the *most recent* model per snapshot, so a card's model label
   reflects the last model used, not a full history of every model in that session.
   (Not fixed, because not broken — just a labeling simplification.)
5. **Claude.ai web chat usage.** Draws from the *same* shared 5h/7d pool as Claude
   Code, but we have zero visibility into it (no status line involved). The account
   total (`rate_limits.*`) still reflects it correctly; it just won't be attributed
   to any specific person's card, so the sum of visible slices can be less than the
   real total if someone is also chatting via claude.ai in the browser.
6. **Clock skew across machines.** Window attribution assumes each machine's local
   clock is roughly correct. Not actively checked; a machine with a significantly
   wrong clock could have its snapshots attributed to the wrong window.
7. **Multiple parallel sessions per person** (e.g. two terminal tabs at once). Each
   gets its own `session_id` and is delta'd independently, then summed per user —
   this is expected to work correctly, but hasn't been explicitly tested with two
   simultaneous sessions. Worth a real test if this is common on your team.
