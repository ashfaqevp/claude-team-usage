// Uploads locally-logged snapshots to Supabase, additively — the local log
// (local-log.jsonl) stays the source of truth for everything in Phase 2. Sync only
// ever reads that file and pushes rows forward; nothing here changes local behavior,
// and if Supabase isn't configured (or is unreachable) local features are unaffected.

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { insertRows, isSupabaseConfigured } from './supabaseClient';
import { resolveIdentity } from './identity';
import { readClaudeAccountEmail } from './claudeAccount';

// Cursor is a count of complete lines already synced. This assumes local-log.jsonl
// is only ever appended to (true today, per usage-logger.js) — if it's ever rotated
// or truncated, the cursor would stay ahead of the new file's length and skip sync
// until it catches back up.
const SYNC_CURSOR_KEY = 'claudeUsage.syncCursorLines';
const TABLE = 'usage_snapshots';

function epochSecondsToIso(v: unknown): string | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return new Date(v * 1000).toISOString();
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/**
 * Maps a parsed local-log line to usage_snapshots columns. Null if it lacks a valid
 * recorded_at (NOT NULL column) — including when `ts` is present but unparseable,
 * since insertRows sends the whole pending batch as one request; a single row that
 * Postgres's timestamptz parser rejects would fail the entire batch, and because the
 * sync cursor only advances on success, that one row would permanently block sync for
 * this machine (every retry re-includes it) rather than just being skipped once.
 */
function mapToRow(parsed: unknown, userName: string, machine: string): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const p = parsed as Record<string, unknown>;
  const recordedAt = str(p.ts);
  if (!recordedAt) return null;
  if (!Number.isFinite(Date.parse(recordedAt))) {
    console.warn(`[claude-team-usage] skipping sync of a row with an unparseable ts: ${JSON.stringify(recordedAt)}`);
    return null;
  }

  return {
    user_name: userName,
    machine,
    session_id: str(p.session_id),
    cost_usd: num(p.cost_usd),
    five_hour_pct: num(p.five_hour_pct),
    five_hour_resets_at: epochSecondsToIso(p.five_hour_resets_at),
    seven_day_pct: num(p.seven_day_pct),
    seven_day_resets_at: epochSecondsToIso(p.seven_day_resets_at),
    model: str(p.model),
    input_tokens: num(p.total_input_tokens),
    output_tokens: num(p.total_output_tokens),
    context_used_pct: num(p.context_used_pct),
    recorded_at: recordedAt,
  };
}

/**
 * Reads only newline-terminated lines so a write-in-progress on the log file never
 * gets split mid-line; the number of "\n" bytes is the true count of complete lines
 * regardless of whether the file currently ends with a trailing newline.
 */
function readCompleteLines(logFile: string): string[] {
  const raw = fs.readFileSync(logFile, 'utf8');
  const newlineCount = (raw.match(/\n/g) || []).length;
  return raw.split('\n').slice(0, newlineCount);
}

export async function syncLocalLog(context: vscode.ExtensionContext, logFile: string): Promise<void> {
  const cfg = vscode.workspace.getConfiguration('claudeUsage');
  const url = (cfg.get<string>('supabaseUrl') || '').trim();
  const anonKey = (cfg.get<string>('supabaseAnonKey') || '').trim();
  if (!isSupabaseConfigured(url, anonKey)) return;

  let completeLines: string[];
  try {
    completeLines = readCompleteLines(logFile);
  } catch {
    return;
  }

  const cursor = context.globalState.get<number>(SYNC_CURSOR_KEY, 0);
  if (cursor >= completeLines.length) return;

  const pending = completeLines.slice(cursor);
  const userName = resolveIdentity();
  const machine = os.hostname();
  // Rows with no readable Claude account email are tagged 'unknown' so they land in
  // an unknown bucket rather than being silently mixed into a real Room.
  const accountEmail = readClaudeAccountEmail() || 'unknown';

  const rows: Record<string, unknown>[] = [];
  for (const line of pending) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const row = mapToRow(JSON.parse(trimmed), userName, machine);
      if (row) rows.push({ ...row, account_email: accountEmail });
    } catch {
      // Skip malformed lines; they still count toward the cursor advance below.
    }
  }

  if (rows.length === 0) {
    await context.globalState.update(SYNC_CURSOR_KEY, completeLines.length);
    return;
  }

  const ok = await insertRows(url, anonKey, TABLE, rows);
  if (ok) {
    await context.globalState.update(SYNC_CURSOR_KEY, completeLines.length);
  }
  // On failure, leave the cursor in place so the same rows are retried next tick.
}
