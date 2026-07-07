// Computes "my share of the shared 5-hour limit" from the aggregates-only
// get_room_window_summary RPC, scoped to THIS device's Room (account_email). Never
// touches raw rows — the RPC itself only returns per-user window costs and account-wide
// percentages for the one Room (see supabase/schema.sql). Deliberately NOT the global
// get_team_window_summary(), which sums every Room in the database together and would
// contaminate one Room's 5h%, reset time, and cost-share with unrelated Rooms' usage.

import { callRpc } from './supabaseClient';

interface TeamWindowRow {
  user_name: string;
  window_cost_usd: number | null;
  account_five_hour_pct: number | null;
  account_seven_day_pct: number | null;
  five_hour_resets_at: string | null;
  seven_day_resets_at: string | null;
}

export interface TeamSlice {
  myPct: number;
  mySharePct: number;
  accountFiveHourPct: number;
  accountSevenDayPct: number | null;
}

/**
 * Fetches this Room's window summary and computes the calling user's slice of the
 * account 5h limit. Scoped to `accountEmail` (the Claude account email that defines the
 * Room). Null on any failure, when there's nothing to compute from, or when the Room is
 * unknown — without an account email we cannot scope to a single Room, and falling back
 * to the account-wide RPC would mix in every other Room's usage, so we return null and
 * let the caller show local-only data instead.
 */
export async function fetchTeamSlice(
  url: string,
  anonKey: string,
  myUserName: string,
  accountEmail: string | null
): Promise<TeamSlice | null> {
  if (!accountEmail) return null;
  const rows = await callRpc<TeamWindowRow[]>(url, anonKey, 'get_room_window_summary', { p_email: accountEmail });
  if (!rows || !Array.isArray(rows) || rows.length === 0) return null;

  let totalCost = 0;
  let myCost = 0;
  let accountFiveHourPct: number | null = null;
  let accountSevenDayPct: number | null = null;

  for (const row of rows) {
    const cost = typeof row.window_cost_usd === 'number' ? row.window_cost_usd : 0;
    totalCost += cost;
    if (row.user_name === myUserName) myCost += cost;
    if (typeof row.account_five_hour_pct === 'number') accountFiveHourPct = row.account_five_hour_pct;
    if (typeof row.account_seven_day_pct === 'number') accountSevenDayPct = row.account_seven_day_pct;
  }

  if (totalCost <= 0 || accountFiveHourPct == null) return null;

  return {
    myPct: (myCost / totalCost) * accountFiveHourPct,
    // Pure cost share (my window_cost / team window_cost) * 100 — distinct from myPct,
    // which scales that same ratio by the account 5h% for the "you ≈ X% of the shared
    // 5h limit" sentence. The two coincide only when there's a single active member.
    mySharePct: (myCost / totalCost) * 100,
    accountFiveHourPct,
    accountSevenDayPct,
  };
}

/**
 * Fetches this Room's display name via get_room_name(p_email). Returns null on any
 * failure, if the RPC isn't exposed to anon (Phase 7 made this an explicit tradeoff,
 * not guaranteed), or if the Room has no name set yet — callers should fall back to
 * showing the tracked email instead, not error.
 */
export async function fetchRoomName(url: string, anonKey: string, email: string): Promise<string | null> {
  const result = await callRpc<string | null>(url, anonKey, 'get_room_name', { p_email: email });
  return typeof result === 'string' && result.trim() ? result.trim() : null;
}
