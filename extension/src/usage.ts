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

function tsMillis(s: Snapshot): number {
  const t = Date.parse(s.ts);
  return Number.isFinite(t) ? t : 0;
}

// Claude Code has a known bug where a resumed session's cost.total_cost_usd can reset
// to a value lower than an earlier snapshot in the same session:
// https://github.com/anthropics/claude-code/issues/13088
const COST_RESET_BUG_URL = 'https://github.com/anthropics/claude-code/issues/13088';

/**
 * One entry per session_id, keeping the latest snapshot by timestamp, but with
 * `cost_usd` replaced by a delta-accumulated total: for each snapshot in time order we
 * add only the increase over the session's previous snapshot, clamping negative deltas
 * to zero instead of subtracting. This still captures real spend that accrues after a
 * resumed session's cost.total_cost_usd resets to a lower value (see
 * COST_RESET_BUG_URL) — unlike simply clamping to the highest value seen so far, which
 * would hide any spend between the reset and the point the total climbs back past its
 * old peak. A one-line warning is logged whenever a drop is detected and ignored.
 */
export function latestPerSession(snapshots: Snapshot[]): Snapshot[] {
  const sorted = [...snapshots].sort((a, b) => tsMillis(a) - tsMillis(b));
  const bySession = new Map<string, Snapshot>();
  const accumulatedCostBySession = new Map<string, number>();
  const lastRawCostBySession = new Map<string, number>();
  let fallbackIndex = 0;

  for (const s of sorted) {
    const key = s.session_id != null ? s.session_id : `__no-session-${fallbackIndex++}`;
    let snapshot = s;

    if (typeof s.cost_usd === 'number') {
      const prevRaw = lastRawCostBySession.get(key);
      let accumulated: number;

      if (prevRaw == null) {
        accumulated = s.cost_usd;
      } else {
        const delta = s.cost_usd - prevRaw;
        if (delta < 0) {
          console.warn(
            `[claude-team-usage] session ${key}: cost_usd dropped from ${prevRaw} to ${s.cost_usd} ` +
              `(known Claude Code resumed-session bug, ${COST_RESET_BUG_URL}) — ignoring the decrease`
          );
        }
        accumulated = (accumulatedCostBySession.get(key) ?? 0) + Math.max(0, delta);
      }

      accumulatedCostBySession.set(key, accumulated);
      lastRawCostBySession.set(key, s.cost_usd);
      snapshot = { ...s, cost_usd: accumulated };
    }

    bySession.set(key, snapshot);
  }

  return Array.from(bySession.values());
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
  const perSession = latestPerSession(snapshots);

  let windowCostUsd = 0;
  let windowInputTokens = 0;
  let windowOutputTokens = 0;
  let sessionCount = 0;

  for (const s of perSession) {
    const t = tsMillis(s);
    const inWindow = window ? t >= window.start && t <= window.end : true;
    if (!inWindow) continue;
    sessionCount += 1;
    if (typeof s.cost_usd === 'number') windowCostUsd += s.cost_usd;
    if (typeof s.total_input_tokens === 'number') windowInputTokens += s.total_input_tokens;
    if (typeof s.total_output_tokens === 'number') windowOutputTokens += s.total_output_tokens;
  }

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

function localDateKey(ms: number): string {
  // en-CA formats as YYYY-MM-DD in the local timezone.
  return new Date(ms).toLocaleDateString('en-CA');
}

/** Per-day peak account percentages and per-day cost (latest-per-session cost, attributed by day). */
export function dailyPeaks(snapshots: Snapshot[], maxDays = 14): DailyPeak[] {
  const peaks = new Map<string, { fiveHour: number | null; sevenDay: number | null }>();
  for (const s of snapshots) {
    const key = localDateKey(tsMillis(s));
    const entry = peaks.get(key) || { fiveHour: null, sevenDay: null };
    if (typeof s.five_hour_pct === 'number' && (entry.fiveHour == null || s.five_hour_pct > entry.fiveHour)) {
      entry.fiveHour = s.five_hour_pct;
    }
    if (typeof s.seven_day_pct === 'number' && (entry.sevenDay == null || s.seven_day_pct > entry.sevenDay)) {
      entry.sevenDay = s.seven_day_pct;
    }
    peaks.set(key, entry);
  }

  const costByDay = new Map<string, { cost: number; sessions: number }>();
  for (const s of latestPerSession(snapshots)) {
    const key = localDateKey(tsMillis(s));
    const entry = costByDay.get(key) || { cost: 0, sessions: 0 };
    entry.cost += typeof s.cost_usd === 'number' ? s.cost_usd : 0;
    entry.sessions += 1;
    costByDay.set(key, entry);
  }

  const allDates = new Set<string>([...peaks.keys(), ...costByDay.keys()]);
  const rows: DailyPeak[] = Array.from(allDates).map((date) => ({
    date,
    peakFiveHourPct: peaks.get(date)?.fiveHour ?? null,
    peakSevenDayPct: peaks.get(date)?.sevenDay ?? null,
    costUsd: costByDay.get(date)?.cost ?? 0,
    sessionCount: costByDay.get(date)?.sessions ?? 0,
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
