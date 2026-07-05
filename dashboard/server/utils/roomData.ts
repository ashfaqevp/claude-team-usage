import { serverSupabaseServiceRole } from '#supabase/server'
import type { H3Event } from 'h3'

// Builds the same combined Room payload for a given Claude account email, used by
// both /api/my-room (email resolved from the caller's own verified session) and
// /api/admin/room (email resolved from a query param, but ONLY after the caller has
// been confirmed to be an admin — see server/utils/adminAuth.ts). Keeping this in one
// place means the owner and admin views can never drift apart.
export async function getRoomPayload(event: H3Event, email: string) {
  const client = serverSupabaseServiceRole(event)

  const [roomResult, adminResult, summaryResult, recentResult, dailyResult] = await Promise.all([
    client.from('rooms').select('room_name').eq('claude_email', email).maybeSingle(),
    client.from('admins').select('email').eq('email', email).maybeSingle(),
    client.rpc('get_room_window_summary', { p_email: email }),
    // Deliberately NOT public.latest_per_user: that view is `distinct on (user_name)`
    // over ALL rooms, so a member's row only shows up if their single most recent
    // snapshot anywhere happens to belong to THIS room. A member idling here while
    // active elsewhere (or a stretch of `account_email = null` rows from a stale
    // extension build) silently drops them from the view even though this room has
    // plenty of history for them. Querying usage_snapshots directly with the
    // account_email filter applied before reducing to "latest per user" avoids that.
    client
      .from('usage_snapshots')
      .select('user_name, session_id, model, input_tokens, output_tokens, context_used_pct, recorded_at, five_hour_pct, seven_day_pct, five_hour_resets_at, seven_day_resets_at')
      .eq('account_email', email)
      .order('recorded_at', { ascending: false })
      .limit(500),
    client
      .from('daily_usage')
      .select('day, user_name, peak_5h, peak_7d, total_cost_usd, session_count')
      .eq('account_email', email)
      .order('day', { ascending: false }),
  ])

  for (const result of [roomResult, adminResult, summaryResult, recentResult, dailyResult]) {
    if (result.error) {
      throw createError({ statusCode: 500, statusMessage: `Failed to load Room data: ${result.error.message}` })
    }
  }

  const roomWindowSummary = summaryResult.data ?? []
  const recentRows = recentResult.data ?? []

  // recentRows is already ordered newest-first. `new Map(entries)` is last-write-wins,
  // so building it straight from recentRows would keep each user's OLDEST row in the
  // window (later, older entries overwrite the earlier, newer one) — set explicitly so
  // the first row seen per user_name (the newest) wins instead.
  const latestByUser = new Map<string, (typeof recentRows)[number]>()
  for (const row of recentRows) {
    if (!latestByUser.has(row.user_name)) latestByUser.set(row.user_name, row)
  }
  const latestPerUser = [...latestByUser.values()]

  // Concept B: current per-session context-window fullness. Deliberately built from
  // the same already-fetched recentRows (no new round trip) but reduced by SESSION,
  // not by user — a member with two active sessions must show both percentages
  // separately, never summed/averaged/overwritten by whichever session's row is
  // newest. recentRows is newest-first, so the first row seen per session_id is that
  // session's latest known context_used_pct. Not filtered by recency here — every
  // session_id seen in the last 500 Room-wide snapshots comes through, including ones
  // that ended long ago. RoomView.vue gates the actually-displayed list on its own
  // isIdle() cutoff before rendering; don't skip that when consuming this field.
  const latestBySession = new Map<string, (typeof recentRows)[number]>()
  for (const row of recentRows) {
    if (!row.session_id || row.context_used_pct == null) continue
    if (!latestBySession.has(row.session_id)) latestBySession.set(row.session_id, row)
  }
  const sessionContexts = [...latestBySession.values()].map(row => ({
    user_name: row.user_name,
    session_id: row.session_id as string,
    context_used_pct: row.context_used_pct,
    recorded_at: row.recorded_at,
  }))

  // Account-wide 5h/7d + resets are duplicated on every roomWindowSummary row, but that
  // RPC only returns rows for members with cost inside the *current* window — a Room
  // that's brand new, or simply idle this window, would strip the account stats along
  // with the (empty) member list. Fall back to the most recent snapshot in this room
  // that actually carries a rate-limit reading (mirrors the SQL's own
  // `latest_rate_limits` filter), so the header still renders for a Room with history
  // but nothing active right now.
  const mostRecent = recentRows.find(row => row.five_hour_pct != null || row.seven_day_pct != null)

  const account = roomWindowSummary[0] ?? {
    account_five_hour_pct: mostRecent?.five_hour_pct ?? null,
    account_seven_day_pct: mostRecent?.seven_day_pct ?? null,
    five_hour_resets_at: mostRecent?.five_hour_resets_at ?? null,
    seven_day_resets_at: mostRecent?.seven_day_resets_at ?? null,
  }

  return {
    claudeEmail: email,
    roomName: roomResult.data?.room_name ?? null,
    isAdmin: adminResult.data != null,
    account: {
      fiveHourPct: account.account_five_hour_pct,
      sevenDayPct: account.account_seven_day_pct,
      fiveHourResetsAt: account.five_hour_resets_at,
      sevenDayResetsAt: account.seven_day_resets_at,
    },
    roomWindowSummary,
    latestPerUser,
    sessionContexts,
    dailyUsage: dailyResult.data ?? [],
  }
}
