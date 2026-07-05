// Computes "my share of the shared 5-hour limit" from the aggregates-only
// get_team_window_summary RPC. Never touches raw rows — the RPC itself only returns
// per-user window costs and account-wide percentages (see supabase/schema.sql).

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
  accountFiveHourPct: number;
  accountSevenDayPct: number | null;
}

/** Fetches the team window summary and computes the calling user's slice of the account 5h limit. Null on any failure or when there's nothing to compute from. */
export async function fetchTeamSlice(url: string, anonKey: string, myUserName: string): Promise<TeamSlice | null> {
  const rows = await callRpc<TeamWindowRow[]>(url, anonKey, 'get_team_window_summary');
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
