// Aggregation helpers over the local usage log written by media/usage-logger.js.
// Local-only in this phase: everything here reads ~/.claude/team-usage/local-log.jsonl
// on the current machine. No network, no Supabase.

import * as fs from 'fs';

export interface Snapshot {
  ts: string;
  session_id: string | null;
  cost_usd: number | null;
  five_hour_pct: number | null;
  five_hour_resets_at: number | null;
  seven_day_pct: number | null;
  seven_day_resets_at: number | null;
  model: string | null;
  total_input_tokens: number | null;
  total_output_tokens: number | null;
}

export interface WindowSummary {
  accountFiveHourPct: number | null;
  accountSevenDayPct: number | null;
  fiveHourResetsAt: number | null;
  sevenDayResetsAt: number | null;
  windowStart: number | null;
  windowEnd: number | null;
  windowCostUsd: number;
  windowInputTokens: number;
  windowOutputTokens: number;
  sessionCount: number;
}

export interface DailyPeak {
  date: string;
  peakFiveHourPct: number | null;
  peakSevenDayPct: number | null;
  costUsd: number;
  sessionCount: number;
}

export function readLocalLog(logFile: string): Snapshot[] {
  try {
    const raw = fs.readFileSync(logFile, 'utf8');
    const snapshots: Snapshot[] = [];
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object' && typeof parsed.ts === 'string') {
          if (!Number.isFinite(Date.parse(parsed.ts))) {
            // An unparseable ts would otherwise sort to epoch-0 (see tsMillis below)
            // and scramble that session's chronological delta order — reject it here
            // instead of letting it silently corrupt totals downstream.
            console.warn(`[claude-team-usage] skipping local-log line with an unparseable ts: ${JSON.stringify(parsed.ts)}`);
            continue;
          }
          snapshots.push(parsed as Snapshot);
        }
      } catch {
        // Skip malformed lines rather than failing the whole read.
      }
    }
    return snapshots;
  } catch {
    return [];
  }
}

/** Callers should only ever see snapshots already validated by readLocalLog; 0 here is a last-resort default, not the primary safeguard. */
function tsMillis(s: Snapshot): number {
  const t = Date.parse(s.ts);
  return Number.isFinite(t) ? t : 0;
}

// Claude Code has a known bug where a resumed session's cost.total_cost_usd can reset
// to a value lower than an earlier snapshot in the same session:
// https://github.com/anthropics/claude-code/issues/13088
const COST_RESET_BUG_URL = 'https://github.com/anthropics/claude-code/issues/13088';

export interface SessionCostEvent {
  tsMillis: number;
  sessionKey: string;
  costDelta: number;
  inputTokenDelta: number;
  outputTokenDelta: number;
}

interface FieldTracker {
  prevCost: number | null;
  prevInputTokens: number | null;
  prevOutputTokens: number | null;
}

/** `current - prev` clamped to >= 0; the first reading for a session (prev == null) counts in full. */
function clampedDelta(current: number, prev: number | null, sessionKey: string, field: string): number {
  if (prev == null) return current;
  const delta = current - prev;
  if (delta < 0) {
    console.warn(
      `[claude-team-usage] session ${sessionKey}: ${field} dropped from ${prev} to ${current} ` +
        `(known Claude Code resumed-session bug, ${COST_RESET_BUG_URL}) — ignoring the decrease`
    );
    return 0;
  }
  return delta;
}

/**
 * Splits each session's cumulative readings into per-snapshot contributions ("deltas")
 * attributed to the moment they actually happened — not lumped onto whichever
 * window/day the session's latest snapshot happens to fall in. For each session, in
 * time order, a snapshot contributes `max(0, value - previous value)` for cost and
 * tokens (the first snapshot contributes its raw value, since there's no earlier
 * reading to diff against). This lets a long-running session that spans a 5-hour
 * window or a calendar day be split correctly between them, instead of attributing its
 * entire lifetime total to a single bucket. It also absorbs Claude Code's known
 * resumed-session reset bug (COST_RESET_BUG_URL): a drop produces a zero-contribution
 * event (logged) rather than corrupting the running total.
 *
 * Snapshots with a null `session_id` are skipped entirely — there is no reliable key
 * to diff them against a previous reading. Treating each one as its own synthetic
 * one-off session (an earlier version of this code did) double-counts: if a session
 * only starts reporting its real `session_id` a snapshot or two in, the cost already
 * accrued under the null id gets counted once there and again in full once the real id
 * appears. Excluding them instead is a deliberate, safe under-count (matches
 * `session_cost_deltas()` on the Supabase side, which does the same) rather than a
 * risky over-count.
 *
 * Snapshots with an unparseable `ts` are also excluded here, not just at
 * `readLocalLog()` — this function must be safe to call directly (as it is from
 * tests, and could be from a future caller) without relying on that one entry point
 * having already filtered the input. Without this, such a snapshot would sort to
 * epoch-0 (see tsMillis) and scramble the true delta order for its session.
 */
export function sessionCostDeltas(snapshots: Snapshot[]): SessionCostEvent[] {
  const sorted = snapshots
    .filter((s) => {
      if (Number.isFinite(Date.parse(s.ts))) return true;
      console.warn(
        `[claude-team-usage] malformed timestamp — excluding snapshot from delta calculation: ${JSON.stringify(s.ts)}`
      );
      return false;
    })
    .sort((a, b) => tsMillis(a) - tsMillis(b));
  const trackers = new Map<string, FieldTracker>();
  const events: SessionCostEvent[] = [];

  for (const s of sorted) {
    if (s.session_id == null) continue;
    const key = s.session_id;
    const tracker = trackers.get(key) ?? { prevCost: null, prevInputTokens: null, prevOutputTokens: null };

    const costDelta =
      typeof s.cost_usd === 'number' ? clampedDelta(s.cost_usd, tracker.prevCost, key, 'cost_usd') : 0;
    const inputTokenDelta =
      typeof s.total_input_tokens === 'number'
        ? clampedDelta(s.total_input_tokens, tracker.prevInputTokens, key, 'total_input_tokens')
        : 0;
    const outputTokenDelta =
      typeof s.total_output_tokens === 'number'
        ? clampedDelta(s.total_output_tokens, tracker.prevOutputTokens, key, 'total_output_tokens')
        : 0;

    if (typeof s.cost_usd === 'number') tracker.prevCost = s.cost_usd;
    if (typeof s.total_input_tokens === 'number') tracker.prevInputTokens = s.total_input_tokens;
    if (typeof s.total_output_tokens === 'number') tracker.prevOutputTokens = s.total_output_tokens;
    trackers.set(key, tracker);

    events.push({ tsMillis: tsMillis(s), sessionKey: key, costDelta, inputTokenDelta, outputTokenDelta });
  }

  return events;
}

/** Most recent snapshot that actually carries rate_limits data, or null if none seen. */
export function latestWithRateLimits(snapshots: Snapshot[]): Snapshot | null {
  let best: Snapshot | null = null;
  for (const s of snapshots) {
    if (s.five_hour_pct == null && s.seven_day_pct == null) continue;
    if (!best || tsMillis(s) >= tsMillis(best)) best = s;
  }
  return best;
}

/** Window = [latest five_hour_resets_at - 5h, latest five_hour_resets_at]. Null if unknown. */
export function getCurrentWindow(snapshots: Snapshot[]): { start: number; end: number } | null {
  const latest = latestWithRateLimits(snapshots);
  if (!latest || latest.five_hour_resets_at == null) return null;
  const end = latest.five_hour_resets_at * 1000;
  const start = end - 5 * 60 * 60 * 1000;
  return { start, end };
}

export function summarizeCurrentWindow(snapshots: Snapshot[]): WindowSummary {
  const latestRateLimits = latestWithRateLimits(snapshots);
  const window = getCurrentWindow(snapshots);
  const events = sessionCostDeltas(snapshots);

  let windowCostUsd = 0;
  let windowInputTokens = 0;
  let windowOutputTokens = 0;
  const sessionsInWindow = new Set<string>();

  for (const e of events) {
    // If the current window isn't known yet (no rate_limits snapshot seen at all —
    // normally only true for a few seconds before a session's first real API
    // response), exclude everything rather than treating the entire local log's
    // lifetime history as "this window's" cost. An undercount of zero is a far safer
    // failure than reporting a wildly inflated window total.
    const inWindow = window ? e.tsMillis >= window.start && e.tsMillis <= window.end : false;
    if (!inWindow) continue;
    sessionsInWindow.add(e.sessionKey);
    windowCostUsd += e.costDelta;
    windowInputTokens += e.inputTokenDelta;
    windowOutputTokens += e.outputTokenDelta;
  }

  const sessionCount = sessionsInWindow.size;

  return {
    accountFiveHourPct: latestRateLimits ? latestRateLimits.five_hour_pct : null,
    accountSevenDayPct: latestRateLimits ? latestRateLimits.seven_day_pct : null,
    fiveHourResetsAt: latestRateLimits ? latestRateLimits.five_hour_resets_at : null,
    sevenDayResetsAt: latestRateLimits ? latestRateLimits.seven_day_resets_at : null,
    windowStart: window ? window.start : null,
    windowEnd: window ? window.end : null,
    windowCostUsd,
    windowInputTokens,
    windowOutputTokens,
    sessionCount,
  };
}

// Must match the hardcoded timezone in supabase/schema.sql's daily_usage view — this
// is a shared team convention for "what day did this happen", not each developer's own
// machine timezone. Using the OS-local timezone here instead would make a developer's
// own daily-peaks panel disagree with the team dashboard about which day a session
// near midnight landed on, for anyone not physically in that timezone.
const TEAM_DAY_TIMEZONE = 'Asia/Kolkata';

function teamDateKey(ms: number): string {
  // en-CA formats as YYYY-MM-DD.
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: TEAM_DAY_TIMEZONE });
}

/** Per-day peak account percentages and per-day cost (delta-attributed by the day each increase happened). */
export function dailyPeaks(snapshots: Snapshot[], maxDays = 14): DailyPeak[] {
  const peaks = new Map<string, { fiveHour: number | null; sevenDay: number | null }>();
  for (const s of snapshots) {
    const key = teamDateKey(tsMillis(s));
    const entry = peaks.get(key) || { fiveHour: null, sevenDay: null };
    if (typeof s.five_hour_pct === 'number' && (entry.fiveHour == null || s.five_hour_pct > entry.fiveHour)) {
      entry.fiveHour = s.five_hour_pct;
    }
    if (typeof s.seven_day_pct === 'number' && (entry.sevenDay == null || s.seven_day_pct > entry.sevenDay)) {
      entry.sevenDay = s.seven_day_pct;
    }
    peaks.set(key, entry);
  }

  const costByDay = new Map<string, { cost: number; sessions: Set<string> }>();
  for (const e of sessionCostDeltas(snapshots)) {
    const key = teamDateKey(e.tsMillis);
    const entry = costByDay.get(key) || { cost: 0, sessions: new Set<string>() };
    entry.cost += e.costDelta;
    entry.sessions.add(e.sessionKey);
    costByDay.set(key, entry);
  }

  const allDates = new Set<string>([...peaks.keys(), ...costByDay.keys()]);
  const rows: DailyPeak[] = Array.from(allDates).map((date) => ({
    date,
    peakFiveHourPct: peaks.get(date)?.fiveHour ?? null,
    peakSevenDayPct: peaks.get(date)?.sevenDay ?? null,
    costUsd: costByDay.get(date)?.cost ?? 0,
    sessionCount: costByDay.get(date)?.sessions.size ?? 0,
  }));

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return rows.slice(0, maxDays);
}

export function formatUsd(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `$${n.toFixed(2)}` : '$--';
}

export function formatPct(n: number | null | undefined): string {
  return typeof n === 'number' && Number.isFinite(n) ? `${Math.round(n)}%` : '--%';
}

export function formatCountdown(resetsAtEpochSeconds: number | null | undefined): string {
  if (typeof resetsAtEpochSeconds !== 'number' || !Number.isFinite(resetsAtEpochSeconds)) return '--';
  const msLeft = resetsAtEpochSeconds * 1000 - Date.now();
  if (msLeft <= 0) return 'now';
  const totalMinutes = Math.round(msLeft / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
