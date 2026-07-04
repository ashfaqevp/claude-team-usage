import { serverSupabaseUser, serverSupabaseServiceRole } from '#supabase/server'

// The Room is scoped entirely from the verified session email below — never from
// anything the client sends. This, plus /api/room-name.post.ts, are the only server
// routes that use the Supabase secret key (via serverSupabaseServiceRole).
export default defineEventHandler(async (event) => {
  const user = await serverSupabaseUser(event).catch(() => null)
  const email = user?.email?.trim().toLowerCase()

  if (!email) {
    throw createError({ statusCode: 401, statusMessage: 'Not signed in' })
  }

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
      .select('user_name, model, input_tokens, output_tokens, recorded_at, five_hour_pct, seven_day_pct, five_hour_resets_at, seven_day_resets_at')
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
    dailyUsage: dailyResult.data ?? [],
  }
})
