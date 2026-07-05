#!/usr/bin/env node
// Claude Code status-line hook. Reads a status JSON payload from stdin, prints a
// plain status line to stdout, and appends a snapshot to the local usage log
// whenever the numbers that matter (5h%, 7d%, cost) have changed.
//
// Must never throw in a way that blanks the status bar — everything is wrapped.

const fs = require('fs');
const os = require('os');
const path = require('path');

const LOG_DIR = path.join(os.homedir(), '.claude', 'team-usage');
const LOG_FILE = path.join(LOG_DIR, 'local-log.jsonl');
const LAST_FILE = path.join(LOG_DIR, 'last.json');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function safeParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function get(obj, pathParts, fallback) {
  let cur = obj;
  for (const key of pathParts) {
    if (cur == null || typeof cur !== 'object') return fallback;
    cur = cur[key];
  }
  return cur == null ? fallback : cur;
}

function fmtPct(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${Math.round(v)}%` : '--';
}

function buildStatusLine(status) {
  const model = get(status, ['model', 'display_name'], null) || get(status, ['model', 'id'], null) || '--';
  const contextPct = get(status, ['context_window', 'used_percentage'], null);
  const fiveHourPct = get(status, ['rate_limits', 'five_hour', 'used_percentage'], null);
  const sevenDayPct = get(status, ['rate_limits', 'seven_day', 'used_percentage'], null);

  return `${model} | ctx ${fmtPct(contextPct)} | 5h ${fmtPct(fiveHourPct)} | 7d ${fmtPct(sevenDayPct)}`;
}

function buildSnapshot(status) {
  return {
    ts: new Date().toISOString(),
    session_id: get(status, ['session_id'], null),
    cost_usd: get(status, ['cost', 'total_cost_usd'], null),
    five_hour_pct: get(status, ['rate_limits', 'five_hour', 'used_percentage'], null),
    five_hour_resets_at: get(status, ['rate_limits', 'five_hour', 'resets_at'], null),
    seven_day_pct: get(status, ['rate_limits', 'seven_day', 'used_percentage'], null),
    seven_day_resets_at: get(status, ['rate_limits', 'seven_day', 'resets_at'], null),
    model: get(status, ['model', 'display_name'], null) || get(status, ['model', 'id'], null),
    total_input_tokens: get(status, ['context_window', 'total_input_tokens'], null),
    total_output_tokens: get(status, ['context_window', 'total_output_tokens'], null),
    // Per-conversation context-window fullness — a per-session health indicator, not
    // cumulative and not summable across sessions (unlike cost/tokens above).
    context_used_pct: get(status, ['context_window', 'used_percentage'], null),
  };
}

function readLastSnapshot() {
  try {
    const raw = fs.readFileSync(LAST_FILE, 'utf8');
    return safeParse(raw);
  } catch {
    return null;
  }
}

function hasChanged(prev, next) {
  if (!prev) return true;
  // Deliberately does NOT trigger on total_input_tokens/total_output_tokens/
  // context_used_pct alone changing — those move on nearly every render, and logging
  // on every context-window tick would flood the log. They still get captured whenever
  // a logged snapshot happens to include a fresh reading (which correlates with cost
  // changing, since both move on real API activity).
  return (
    prev.five_hour_pct !== next.five_hour_pct ||
    prev.seven_day_pct !== next.seven_day_pct ||
    prev.cost_usd !== next.cost_usd
  );
}

function logSnapshotIfChanged(status) {
  fs.mkdirSync(LOG_DIR, { recursive: true });

  const next = buildSnapshot(status);
  const prev = readLastSnapshot();

  if (!hasChanged(prev, next)) return;

  fs.appendFileSync(LOG_FILE, JSON.stringify(next) + '\n');
  fs.writeFileSync(LAST_FILE, JSON.stringify(next));
}

function main() {
  let line = '-- | ctx -- | 5h -- | 7d --';

  try {
    const raw = readStdin();
    const status = safeParse(raw) || {};
    line = buildStatusLine(status);

    try {
      logSnapshotIfChanged(status);
    } catch {
      // Logging failures must never affect the status bar.
    }
  } catch {
    // Fall back to the default line above.
  }

  process.stdout.write(line + '\n');
}

main();
