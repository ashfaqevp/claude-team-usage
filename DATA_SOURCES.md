
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

**Cost is delta-based, per snapshot — not one running total per session.** For each
`session_id`, walking its snapshots in time order, every snapshot's contribution
("delta") is:

```
delta = max(0, new_cost - previous_cost_for_this_session)
```

(The session's first-ever snapshot counts in full, since there's no earlier reading
to diff against.) The `max(0, ...)` clamp is the resume-bug protection (see below).

Critically, **each delta is attributed to the window/day of the snapshot it actually
happened at** — not to whichever bucket the session's *latest* snapshot lands in. A
long session that spans a 5-hour reset boundary or a calendar day therefore gets its
cost genuinely split between the two buckets: e.g. a session logging $5 the hour
before a window closes and $4 the hour after only ever contributes $5 to the first
window and $4 to the second — never $9 to either. Implemented as one delta-event per
snapshot (`sessionCostDeltas()` in the extension, `session_cost_deltas()` in
Supabase), filtered/grouped by each event's own timestamp — see edge case 2 below for
the earlier, broken version of this.

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
   continuing from its real prior value. Handled by the per-snapshot delta above: a
   drop produces a delta of zero (ignored, not subtracted) rather than corrupting the
   running total, and is logged as a one-line warning. Deliberately *not* handled by
   clamping to the highest cost ever seen for the session — that simpler approach
   would hide any real spend that accrues between the reset and the point the total
   climbs back past its old peak (e.g. readings `[5, 8, 2, 4, 6, 9]` should total
   **15**, every real increase including the 2→4→6 climb after the reset, not **9**,
   the running max). This does not fix the upstream bug; it stops it from corrupting
   our numbers.
2. **A session spanning a 5-hour reset boundary or a calendar day.** Fixed — but this
   took two attempts, worth recording so it isn't silently re-broken. The *first*
   attempt kept one pre-summed delta-accumulated total per session and attributed the
   whole thing to whichever window/day the session's *latest* snapshot fell in — this
   still dumped 100% of a long session's cost into one bucket, identical to the
   original "take the latest total" bug it was supposed to fix, just with corrected
   numbers. Verified wrong with a concrete case: a session with $5 spent before a
   window opened and $4 spent inside it reported $9 for that window, not $4. The
   *actual* fix (`sessionCostDeltas()` / `session_cost_deltas()`) returns one row per
   snapshot instead of one per session, so each delta is filtered/grouped by its own
   timestamp — the $5 attributes to the earlier window, the $4 to the current one.
   Residual imprecision: a single delta *interval* (the gap between two consecutive
   status-line updates) can itself straddle a boundary. This is a small, bounded
   error — at most one status-line interval's worth — not a whole-session error.
3. **Consistency between the extension and the dashboard.** The delta logic must be
   implemented identically in the extension (`sessionCostDeltas()` in `usage.ts`) and
   in Supabase (`session_cost_deltas()`, read by both `get_team_window_summary()` and
   `daily_usage`). If these ever drift apart, the two views will disagree. Check both
   any time this logic changes — verify with the same test cases on both sides
   (a resume-dip, and a session/day-spanning case), not just one.
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
   gets its own `session_id` and is delta'd independently, then summed per user.
   Verified with a concrete test: two interleaved sessions with raw readings
   `[2, 3]` and `[1, 4]` in the same window correctly summed to $7 across 2 sessions.
