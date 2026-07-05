
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
| `session_id`                                                  | grouping key for delta calculation      | one row per session per change; snapshots with a null `session_id` are excluded from cost/session-count math (see edge case 8)  |
| `model.display_name`                                          | shown in status bar / dashboard         | reflects the*most recent* model only — see "Model switching" below  |
| `cost.total_cost_usd`                                         | the core usage number                   | cumulative for the session; we convert to a**delta** (see below) |
| `context_window.used_percentage`                              | local "ctx %" display, and (since edge case 13) `context_used_pct` on the persisted snapshot | per-conversation memory fullness — unrelated to the 5h/7d plan limit; per-session, never summed/averaged (see edge case 13) |
| `context_window.total_input_tokens` / `total_output_tokens` | "Tokens this window" (delta-summed, like cost)   | cumulative for the session, exactly like `cost.total_cost_usd` — converted to a **delta** the same way (see edge case 13) |
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
doesn't expose a true per-Room-member breakdown on a shared account.

**Tokens are delta-based too, by the identical mechanism — but as a SEPARATE
function, not folded into the cost delta.** `context_window.total_input_tokens` /
`total_output_tokens` are cumulative per session, exactly like `cost.total_cost_usd`,
so they need the same `max(0, new - previous)` treatment, the same per-snapshot
event/window-attribution shape, and the same resume-bug clamp. This is
`sessionTokenDeltas()` in the extension and `session_token_deltas()` in Supabase —
deliberately parallel to, not merged with, `sessionCostDeltas()` /
`session_cost_deltas()`, so the two can be verified independently and never silently
drift into depending on each other's edge-case handling. See edge case 13.

**Context-window usage (`context_window.used_percentage`) is a different kind of
number and is NOT delta'd or windowed at all.** It's a per-conversation memory-fullness
gauge, not a volume metric — summing or averaging it across a member's sessions would
be meaningless. Displayed as "Context usage" per currently-active session_id (using
that session's most recent known reading), never blended into one figure. See edge
case 13.

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
5. **Claude.ai web chat usage.** Draws from the *same* shared 5h/7d limit as Claude
   Code, but we have zero visibility into it (no status line involved). The account
   total (`rate_limits.*`) still reflects it correctly; it just won't be attributed
   to any specific Room member's card, so the sum of visible slices can be less than
   the real total if a Room member is also chatting via claude.ai in the browser.
6. **Clock skew across machines.** Window attribution assumes each machine's local
   clock is roughly correct. Not actively checked; a machine with a significantly
   wrong clock could have its snapshots attributed to the wrong window.
7. **Multiple parallel sessions per Room member** (e.g. two terminal tabs at once).
   Each gets its own `session_id` and is delta'd independently, then summed per user.
   Verified with a concrete test: two interleaved sessions with raw readings
   `[2, 3]` and `[1, 4]` in the same window correctly summed to $7 across 2 sessions.
8. **`session_id` missing on a snapshot.** *Fixed — verified 2026-07-04.* An earlier
   version of `sessionCostDeltas()` gave every null-`session_id` snapshot its own
   synthetic one-off key. If Claude Code ever omits `session_id` on a session's
   earliest render(s) and then starts reporting it, this double-counted: the
   pre-session-id spend was counted once under the throwaway key and again in full
   once the real id appeared, since that key's "previous reading" also started at
   null. Verified wrong with a concrete case: true readings `[0.50 (no session_id),
   0.80 (real session_id)]` for one continuous session — true spend $0.80, reported
   **$1.30**, session count inflated from 1 to 2. Fixed by excluding
   null-`session_id` snapshots entirely instead of synthesizing a key for them — a
   deliberate, safe *undercount* (matches `session_cost_deltas()` on the Supabase
   side, which already excluded them via `where session_id is not null`; the
   extension previously didn't, so the two disagreed on this specific case).
   Re-verified 2026-07-04 by running the exact scenario against the compiled code:
   `sessionCostDeltas()` returned a single event (`session_id: "real"`, `costDelta:
   0.8`) — `TOTAL_COST = 0.8`, `SESSION_COUNT = 1`.
9. **Daily bucketing timezone.** *Fixed — verified 2026-07-04.* `dailyPeaks()` used to
   bucket "which day did this happen" using the Room member's own machine's OS timezone
   (`toLocaleDateString` without a `timeZone` option), while Supabase's `daily_usage`
   view hardcodes `Asia/Kolkata` for every user. For a Room member not physically in
   that timezone, a session near midnight could land on a different calendar day in
   their own panel than on the shared dashboard. Fixed by making the extension bucket
   using the same fixed `Asia/Kolkata` timezone (`TEAM_DAY_TIMEZONE` in `usage.ts`)
   regardless of the machine's own timezone — verified by running the test suite
   under `TZ=America/New_York` and confirming the day split still matched IST
   boundaries. Re-verified 2026-07-04 with a snapshot at `2026-01-01T19:00:00.000Z`
   (UTC calendar date `2026-01-01`, but past midnight IST): the extension's
   `dailyPeaks()` bucketed it under `2026-01-02`, and the identical
   `(recorded_at at time zone 'Asia/Kolkata')::date` expression run directly against
   the live Supabase project (not just the checked-in file) also returned
   `2026-01-02` — confirmed matching, not just structurally identical code.
10. **A snapshot's `ts` is present but unparseable.** *Fixed — verified 2026-07-04.*
    `tsMillis()` falls back to epoch-0 for any date string it can't parse; since
    `sessionCostDeltas()` sorts by that value, one bad timestamp used to sort to the
    front of a session's whole history, scrambling the true chronological delta
    order. Verified wrong with a concrete case: true readings `5 → 8 → 9` (true total
    $9) with a garbled `ts` on the middle one reordered to `8 → 5 → 9`, produced
    **$4**, and fired a misleading "resumed-session bug" warning that was really just
    bad timestamp data. Fixed by rejecting unparseable-`ts` snapshots in two places:
    at `readLocalLog()` (never enters the in-memory log at all) AND inside
    `sessionCostDeltas()` itself, with a distinct "malformed timestamp" warning (not
    the resume-bug one) — the second guard matters because
    `sessionCostDeltas()`/`summarizeCurrentWindow()` must stay safe to call directly
    with in-memory data that never went through `readLocalLog()` (as tests, or any
    future caller, might). Verified the fixed sequence now reports exactly $9 with no
    resume-bug warning fired. The same root cause existed on the sync path:
    `sync.ts`'s batch insert is all-or-nothing, so one row with an unparseable `ts`
    reaching Supabase would fail the *entire* batch, and since the cursor only
    advances on success, that row would permanently re-block sync every retry. Fixed
    the same way in `mapToRow()` — reject and skip before it's ever sent. Re-verified
    2026-07-04 by running `5 → [malformed ts] → 8 → 9` directly: `DELTA_TOTAL = 9`,
    `RESUME_BUG_WARNING_FIRED = false` (only the distinct "malformed timestamp"
    warning fired, captured and checked by string content, not just eyeballed).
    **SQL-side audit (verified 2026-07-04, live against `htrxdxtbrkdabrrqbpyr`):**
    `recorded_at` is `timestamptz not null`, and Postgres's own type check makes the
    unparseable-string failure mode structurally impossible on the SQL side — `select
    'not-a-real-date'::timestamptz` raises `22007: invalid input syntax for type
    timestamp with time zone` and the row is refused at `INSERT`, full stop. There is
    no equivalent of `tsMillis()`'s silent epoch-0 fallback anywhere in
    `session_cost_deltas()` / `get_team_window_summary()` / `daily_usage`, since none
    of them ever synthesize or coalesce a `recorded_at` — they only read what's
    already stored. A distinct, real limitation remains, and it is *shared* rather
    than SQL-specific: a **valid-but-wrong** timestamp (e.g. an accidentally-epoch
    `recorded_at`) is not rejected — `select
    '1970-01-01T00:00:00Z'::timestamptz` succeeds — and if such a row existed it
    would scramble `lag()` ordering the same way the original bug did. Verified: a
    fabricated `5 → 8 → 9` sequence (true chronological deltas `5, 3, 1`, true total
    `$9`) with the middle reading's timestamp set to `1970-01-01T00:00:00Z` instead
    of its true time reproduced the identical corruption shape as the JS example
    above: sorted by `(recorded_at, id)` the epoch row comes first, so the reported
    deltas came out `8` (no prior reading), `0` (a false drop from 8→5, the same
    misleading resume-bug signature), `4` (from 5→9) — summing to `$12`, not the
    true `$9`, and with a bogus resume-bug warning fired for a row that never
    actually dropped. This is **not a gap the SQL layer introduces**:
    `Date.parse('1970-01-01T00:00:00Z')` is equally valid in JS, so
    `mapToRow()`/`readLocalLog()` would accept the exact same value — no
    `timestamptz`-typed column, in Postgres or anywhere else, can distinguish an
    honest old date from a bug that happened to produce one. Treated as an
    **accepted structural boundary, not an open bug** — parseability is the only
    thing a type system can enforce; plausibility is a judgment call belonging to
    the application. Possible future hardening (not implemented): a plausibility
    check rejecting `recorded_at` values more than ~1 day outside the expected range
    (e.g. before the extension's install date, or in the future) at `mapToRow()`/
    insert time. This would not close the theoretical gap (a "plausible" wrong date
    would still pass) but would catch the realistic case of an actual epoch/zero-
    value bug.
11. **No 5-hour window known yet.** *Fixed — verified 2026-07-04.*
    `summarizeCurrentWindow()` used to treat "we've never seen a `rate_limits`
    snapshot" as "everything is in the current window," reporting a
    session's/machine's entire lifetime cost as this window's cost. Normally this
    only lasts a few seconds (before a session's first real API response), but if
    rate-limit capture ever silently broke for any other reason, this failed in the
    unsafe direction — a large, wrong, inflated number instead of an honest "no data
    yet." Fixed to exclude everything when the window is unknown, which is a safe
    undercount (zero) rather than a risky overcount. Re-verified 2026-07-04: with two
    real cost-bearing snapshots ($3 and $7) and no rate-limit-bearing snapshot at all,
    `summarizeCurrentWindow()`'s `inWindow` ternary (`window ? ... : false` in
    `usage.ts`) fell through to its `false` branch for every event —
    `WINDOW_KNOWN (windowStart !== null) = false`, `WINDOW_COST_USD = 0` — instead of
    reporting the $10 that actually exists in the log.
    **SQL side: Fixed — verified 2026-07-04**, confirmed directly against
    `get_team_window_summary()` itself (not a reimplementation of its logic). Window
    membership is decided by `deltas_in_window`'s `cross join window_bounds`, and
    `window_bounds` is only ever populated `from latest_rate_limits where
    five_hour_resets_at is not null` — if no row anywhere carries rate-limit data,
    `window_bounds` has zero rows, the cross join against it yields zero rows
    regardless of how much cost exists, and the function's final result set is empty
    for every user (not a zero-cost row — no row at all). Verified live against
    `htrxdxtbrkdabrrqbpyr` in a transaction rolled back afterward: every real row's
    `five_hour_pct` / `seven_day_pct` / `five_hour_resets_at` / `seven_day_resets_at`
    was nulled out (simulating zero rate-limit data anywhere in the table) and a new
    row with `cost_usd = 42.00` was inserted; `select count(*) from
    get_team_window_summary()` returned **0** — not the $42, not a $0 row, no row at
    all. Rolled back afterward; confirmed real data intact (415 rows, 400 with
    rate limits, 0 leftover test rows).
12. **SQL delta ordering had no tiebreak for identical timestamps.** *Fixed —
    verified 2026-07-04.* `session_cost_deltas()`'s `lag(...) over (partition by
    session_id order by recorded_at)` had no secondary sort key, while the extension's
    `sessionCostDeltas()` sorts with `Array.prototype.sort`, which is stable and
    preserves file/insertion order on an exact tie. If two snapshots for the same
    session ever shared an identical `recorded_at` (e.g. two sub-millisecond
    status-line renders), Postgres wasn't guaranteed to order them the same way the
    extension's array did, so that one interval's cost could split differently
    between the extension's own number and the shared dashboard — the exact class of
    drift edge case 3 warns about. Fixed by adding `s.id` (an always-increasing
    identity column reflecting insertion order) as a secondary sort key in both
    `lag()` calls: `order by s.recorded_at, s.id`. Applied to `supabase/schema.sql`
    and re-applied live to the `htrxdxtbrkdabrrqbpyr` project via migration
    `session_cost_deltas_tiebreak_by_id` — confirmed live by reading back
    `pg_get_functiondef()` and matching on the new `order by` clause.
13. **Token accounting was never delta-based.** *Fixed — verified 2026-07-05.*
    `context_window.total_input_tokens` / `total_output_tokens` are cumulative per
    session, exactly like `cost.total_cost_usd` — but unlike cost, they were only ever
    read as the latest snapshot's raw cumulative value, never delta'd. This was wrong
    in two independent ways: (a) a member with more than one active session (two
    terminal tabs) had whichever session rendered most recently silently overwrite the
    token numbers from the other, instead of both being summed — this never happened
    to cost, since cost already went through the delta engine; (b) even with one
    session, "latest snapshot's cumulative total" answers a different question than
    "tokens consumed this window" — a session that started before the current window
    opened would have its pre-window tokens incorrectly folded into the window figure,
    the same mistake edge case 2 already fixed for cost.

    Fixed by mirroring the cost-delta architecture for tokens as a **separate,
    parallel** function, not blended into the cost delta function (kept independently
    verifiable, per edge case 3's warning about drift between two implementations of
    the same idea): `sessionTokenDeltas()` in `extension/src/usage.ts` (alongside the
    now cost-only `sessionCostDeltas()`) and `public.session_token_deltas()` in
    `supabase/schema.sql` (alongside `session_cost_deltas()`). Both apply the identical
    `max(0, current - previous)` per-session, per-snapshot treatment, the same
    null-`session_id` exclusion, and the same malformed-timestamp exclusion as the cost
    side. `get_team_window_summary()` / `get_room_window_summary()` were recreated
    (DROP + CREATE, since adding output columns changes a function's return shape —
    `CREATE OR REPLACE` alone rejects that) to also return `window_input_tokens` /
    `window_output_tokens`, summed from `session_token_deltas()` filtered by the same
    `window_bounds` already used for cost. This is a genuinely separate aggregation
    from the cost sum, not a join against `session_cost_deltas()` — a snapshot can
    carry tokens without cost (or vice versa), and the two delta functions
    independently decide which rows they emit.

    One further subtlety inside `session_token_deltas()` itself: `input_token_delta`
    and `output_token_delta` are each computed from their own filtered `lag()` window
    (rows where that specific field is non-null), not one shared window over every
    `session_id`-not-null row. A shared window would let a stray null-token snapshot
    act as a false "previous reading" of null for the next real reading, making that
    next reading look like a fresh session start (its full cumulative value counted,
    not the true delta since the last real reading) — filtering nulls out of each
    field's own window first (matching `session_cost_deltas()`'s own `where cost_usd is
    not null` pattern) means `lag()` always skips straight back to the last real
    reading, matching the extension's `sessionTokenDeltas()`, which only updates its
    "previous value" tracker on snapshots that actually carry a numeric reading for
    that field. Verified live: readings `1000 -> (null) -> 1400` for one session
    produced deltas `1000, 0, 400` (true total 1400), not `1000, 1400` (which would
    double-count across the gap).

    Separately, added a genuinely different concept that didn't exist before at all:
    **per-session context usage.** `context_window.used_percentage` is a
    per-conversation memory-fullness gauge, not a volume metric — it must never be
    summed or averaged across a member's sessions, unlike cost/tokens. Persisted as a
    new `context_used_pct` column (extension: `Snapshot.context_used_pct`, logged by
    `usage-logger.js`, synced by `sync.ts`; Supabase: `usage_snapshots.context_used_pct`)
    and surfaced as a small per-session list — "Session abc123: 62% context" — rather
    than one blended number, in the status-bar tooltip, the "Show my usage" webview
    panel, and the dashboard member card (labeled "Context usage", replacing the old
    "Context tokens" label that displayed the latest snapshot's cumulative token counts
    and read as if it were a volume metric).

    **Verified 2026-07-05, extension side** (`npm test` in `extension/`, added to
    `scripts/verify-edge-cases.js`):
    - Multi-session case: session A raw readings `[1000, 1000, 2500]`, session B raw
      readings `[500, 1800]`, interleaved in the same window. `sessionTokenDeltas()`
      produced deltas `1000, 0, 1500` (A) and `500, 1300` (B);
      `summarizeCurrentWindow().windowInputTokens` = **4300** — the true combined total
      (2500 + 1800), not whichever session's latest snapshot rendered last.
    - Window-spanning case: one session with a reading of 1000 tokens before the
      current window opened and 1400 (cumulative) inside it —
      `summarizeCurrentWindow().windowInputTokens` = **400**, not 1400.
    - Per-session context case: two sessions with `context_used_pct` 62 and 12 —
      `summarizeCurrentWindow().sessionContexts` returned both entries separately
      (`{sessionId: 'abc123de', contextUsedPct: 62}`, `{sessionId: 'def456gh',
      contextUsedPct: 12}`), never summed or overwritten.

    **Verified 2026-07-05, Supabase side**, live against `htrxdxtbrkdabrrqbpyr` in
    transactions rolled back afterward (not a reimplementation — the real
    `session_token_deltas()` / `get_room_window_summary()` were queried directly): the
    identical multi-session scenario above produced the identical events (`1000, 0,
    1500` / `500, 1300`) and `get_room_window_summary()` returned
    `window_input_tokens = 4300` — extension and Supabase agree on the same test case,
    per edge case 3's standard. The identical window-spanning scenario (1000 pre-window,
    1400 cumulative in-window) returned `window_input_tokens = 400`. The null-gap
    subtlety above was verified separately: readings `1000 -> (null) -> 1400` produced
    events `1000, 0, 400`. Real data was confirmed unaffected afterward: `select
    count(*) from usage_snapshots` = 1777 rows, 0 leftover test rows, and a real query
    (`get_room_window_summary('rashid@iocod.com')`) returned real non-zero figures
    (`window_input_tokens = 1125163`, `window_output_tokens = 139701`) confirming the
    recreated function still works end-to-end against live data.
