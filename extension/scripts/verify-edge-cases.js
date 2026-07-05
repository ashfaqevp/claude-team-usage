#!/usr/bin/env node
// Minimal, framework-free regression check for the edge cases documented in
// DATA_SOURCES.md. Run via `npm test` (compiles src/ then runs this against
// out/usage.js). Not a general test suite — just a guard against silently
// re-breaking the specific cases already written up there.

const assert = require('assert');
const { sessionCostDeltas, sessionTokenDeltas, summarizeCurrentWindow, dailyPeaks } = require('../out/usage');

let passed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

function snap(overrides) {
  return {
    ts: null,
    session_id: null,
    cost_usd: null,
    five_hour_pct: null,
    five_hour_resets_at: null,
    seven_day_pct: null,
    seven_day_resets_at: null,
    model: null,
    total_input_tokens: null,
    total_output_tokens: null,
    context_used_pct: null,
    ...overrides,
  };
}

function sumCost(events) {
  return events.reduce((acc, e) => acc + e.costDelta, 0);
}

function sumInputTokens(events) {
  return events.reduce((acc, e) => acc + e.inputTokenDelta, 0);
}

// DATA_SOURCES.md edge case 1: resume-bug dip must not clamp to the running max.
// Readings [5, 8, 2, 4, 6, 9] must total 15 (every real increase), not 9.
check('resume-bug dip sums real increases, not the running max', () => {
  const readings = [5, 8, 2, 4, 6, 9];
  const snapshots = readings.map((cost, i) =>
    snap({ ts: new Date(2026, 0, 1, 0, i).toISOString(), session_id: 's1', cost_usd: cost })
  );
  const events = sessionCostDeltas(snapshots);
  assert.strictEqual(sumCost(events), 15);
});

// Edge case 2: a session spanning a window boundary splits by each delta's own
// timestamp, not by the session's latest snapshot. $5 before the window, $4 inside
// it must show as $4 for that window, never $9.
check('window-spanning session splits cost by delta timestamp', () => {
  const windowEndSec = Math.floor(Date.UTC(2026, 0, 1, 10, 0, 0) / 1000);
  const beforeWindow = new Date(Date.UTC(2026, 0, 1, 4, 0, 0)).toISOString(); // > 5h before end
  const insideWindow = new Date(Date.UTC(2026, 0, 1, 9, 0, 0)).toISOString();

  const snapshots = [
    snap({ ts: beforeWindow, session_id: 's1', cost_usd: 5 }),
    snap({
      ts: insideWindow,
      session_id: 's1',
      cost_usd: 9,
      five_hour_pct: 42,
      five_hour_resets_at: windowEndSec,
    }),
  ];

  const summary = summarizeCurrentWindow(snapshots);
  assert.strictEqual(summary.windowCostUsd, 4);
});

// Edge case 8: null session_id snapshots must be excluded entirely, not synthesized
// into their own one-off session. True spend $0.80 must report $0.80, not $1.30.
check('null session_id snapshots are excluded, not double-counted', () => {
  const snapshots = [
    snap({ ts: new Date(2026, 0, 1, 0, 0).toISOString(), session_id: null, cost_usd: 0.5 }),
    snap({ ts: new Date(2026, 0, 1, 0, 1).toISOString(), session_id: 's2', cost_usd: 0.8 }),
  ];
  const events = sessionCostDeltas(snapshots);
  assert.strictEqual(sumCost(events), 0.8);
  assert.strictEqual(events.length, 1);
});

// Edge case 10: an unparseable ts must be excluded rather than sorted to epoch-0 and
// scrambling delta order. True sequence 5 -> 8 -> 9 (total $9) must stay $9 even
// with a garbled ts on the middle reading.
check('unparseable ts is excluded rather than scrambling delta order', () => {
  const snapshots = [
    snap({ ts: new Date(2026, 0, 1, 0, 0).toISOString(), session_id: 's3', cost_usd: 5 }),
    snap({ ts: 'not-a-real-timestamp', session_id: 's3', cost_usd: 8 }),
    snap({ ts: new Date(2026, 0, 1, 0, 2).toISOString(), session_id: 's3', cost_usd: 9 }),
  ];
  const events = sessionCostDeltas(snapshots);
  assert.strictEqual(sumCost(events), 9);
});

// Edge case 7: two interleaved parallel sessions must be delta'd independently, then
// summed. Raw readings [2, 3] and [1, 4] interleaved must sum to $7 across 2 sessions.
check('interleaved parallel sessions sum independently', () => {
  // All four timestamps sit a few minutes apart, well inside a 5-hour window that
  // ends 4 hours after the last one, so window membership isn't in question here -
  // this test is purely about per-session delta independence.
  const lastTs = Date.UTC(2026, 0, 1, 0, 3, 0);
  const resetsAtSec = Math.floor((lastTs + 4 * 60 * 60 * 1000) / 1000);

  const snapshots = [
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(), session_id: 'a', cost_usd: 2 }),
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 1, 0)).toISOString(), session_id: 'b', cost_usd: 1 }),
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 2, 0)).toISOString(), session_id: 'a', cost_usd: 3 }),
    snap({
      ts: new Date(lastTs).toISOString(),
      session_id: 'b',
      cost_usd: 4,
      five_hour_pct: 10,
      five_hour_resets_at: resetsAtSec,
    }),
  ];
  const summary = summarizeCurrentWindow(snapshots);
  assert.strictEqual(summary.windowCostUsd, 7);
  assert.strictEqual(summary.sessionCount, 2);
});

// Edge case 9: daily bucketing must use the fixed Asia/Kolkata team timezone, not the
// machine's own OS timezone. 19:00 UTC on Jan 1 is 00:30 IST on Jan 2 - must bucket
// as Jan 2 regardless of process TZ.
check('daily bucketing uses the fixed Asia/Kolkata timezone', () => {
  const snapshots = [snap({ ts: '2026-01-01T19:00:00.000Z', session_id: 's4', cost_usd: 1 })];
  const peaks = dailyPeaks(snapshots);
  const day = peaks.find((p) => p.costUsd > 0);
  assert.strictEqual(day.date, '2026-01-02');
});

// Edge case 13a: token accounting must be delta-based, like cost, and not merely
// "latest snapshot's cumulative total" - two interleaved sessions with raw cumulative
// input-token readings must sum to the TRUE combined delta total, not whichever
// session's latest snapshot happened to render last.
// Session A: [1000, 1000, 2500] (deltas: 1000, 0, 1500 -> total 2500)
// Session B: [500, 1800] (deltas: 500, 1300 -> total 1800)
// True combined total: 2500 + 1800 = 4300.
check('edge case 13a: multi-session token deltas sum to the true combined total, not a latest-snapshot overwrite', () => {
  const resetsAtSec = Math.floor(Date.UTC(2026, 0, 1, 5, 0, 0) / 1000);
  const snapshots = [
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(), session_id: 'A', total_input_tokens: 1000 }),
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 1, 0)).toISOString(), session_id: 'B', total_input_tokens: 500 }),
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 2, 0)).toISOString(), session_id: 'A', total_input_tokens: 1000 }),
    snap({
      ts: new Date(Date.UTC(2026, 0, 1, 0, 3, 0)).toISOString(),
      session_id: 'B',
      total_input_tokens: 1800,
      five_hour_pct: 20,
      five_hour_resets_at: resetsAtSec,
    }),
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 4, 0)).toISOString(), session_id: 'A', total_input_tokens: 2500 }),
  ];
  const events = sessionTokenDeltas(snapshots);
  const total = sumInputTokens(events);
  console.log(`  sessionTokenDeltas() events: ${JSON.stringify(events)}`);
  console.log(`  TOTAL_INPUT_TOKENS = ${total} (expected 4300)`);
  assert.strictEqual(total, 4300);

  const summary = summarizeCurrentWindow(snapshots);
  console.log(`  summarizeCurrentWindow().windowInputTokens = ${summary.windowInputTokens} (expected 4300)`);
  assert.strictEqual(summary.windowInputTokens, 4300);
});

// Edge case 13b: a session that started before the current window opened must only
// contribute its in-window token delta, not its full cumulative total - same style of
// test as edge case 2's cost example, adapted to tokens. 1000 tokens accrue before the
// window opens, 400 more accrue inside it: the window must report 400, never 1400.
check('edge case 13b: window-spanning session only contributes its in-window token delta', () => {
  const windowEndSec = Math.floor(Date.UTC(2026, 0, 1, 10, 0, 0) / 1000);
  const beforeWindow = new Date(Date.UTC(2026, 0, 1, 4, 0, 0)).toISOString(); // > 5h before end
  const insideWindow = new Date(Date.UTC(2026, 0, 1, 9, 0, 0)).toISOString();

  const snapshots = [
    snap({ ts: beforeWindow, session_id: 's1', total_input_tokens: 1000 }),
    snap({
      ts: insideWindow,
      session_id: 's1',
      total_input_tokens: 1400,
      five_hour_pct: 42,
      five_hour_resets_at: windowEndSec,
    }),
  ];

  const summary = summarizeCurrentWindow(snapshots);
  console.log(`  BEFORE: raw cumulative readings 1000 (pre-window) -> 1400 (in-window)`);
  console.log(`  AFTER: summarizeCurrentWindow().windowInputTokens = ${summary.windowInputTokens} (expected 400, not 1400)`);
  assert.strictEqual(summary.windowInputTokens, 400);
});

// Edge case 13c: per-session context usage must be shown per-session, never summed or
// overwritten, when a member has two active sessions with different used_percentage.
check('edge case 13c: per-session context usage shown separately for two active sessions, not summed', () => {
  const resetsAtSec = Math.floor(Date.UTC(2026, 0, 1, 5, 0, 0) / 1000);
  const snapshots = [
    snap({ ts: new Date(Date.UTC(2026, 0, 1, 0, 0, 0)).toISOString(), session_id: 'abc123de', cost_usd: 1, context_used_pct: 62 }),
    snap({
      ts: new Date(Date.UTC(2026, 0, 1, 0, 1, 0)).toISOString(),
      session_id: 'def456gh',
      cost_usd: 1,
      context_used_pct: 12,
      five_hour_pct: 5,
      five_hour_resets_at: resetsAtSec,
    }),
  ];
  const summary = summarizeCurrentWindow(snapshots);
  const byId = Object.fromEntries(summary.sessionContexts.map((sc) => [sc.sessionId, sc.contextUsedPct]));
  console.log(`  sessionContexts = ${JSON.stringify(summary.sessionContexts)}`);
  assert.strictEqual(summary.sessionContexts.length, 2);
  assert.strictEqual(byId['abc123de'], 62);
  assert.strictEqual(byId['def456gh'], 12);
});

console.log(`\n${passed} passed`);
if (process.exitCode) {
  console.error('one or more checks failed');
}
