import type { Ref } from 'vue'
import type { MyRoomResponse } from '@/types/my-room'
import { assignMemberColors, SERIES_HEX } from '@/lib/chartColors'
import { formatDay, num } from '@/lib/format'

// All of a Room's derived view state in one place, driven by a live 1s clock so
// countdowns / "last seen" / active-idle status stay current without refetching.
// Extracted from RoomView so the Overview, Members and History pages share one
// source of truth for member cards, colors, the donut, the stacked timeline and
// the daily rollup. Feed it the reactive `/api/my-room` payload.
export function useRoomModel(data: Ref<MyRoomResponse | null | undefined>) {
  const now = ref<number | null>(null)
  let clock: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    now.value = Date.now()
    clock = setInterval(() => { now.value = Date.now() }, 1000)
  })
  onUnmounted(() => {
    if (clock) clearInterval(clock)
  })

  const hasHistory = computed(() =>
    (data.value?.latestPerUser.length ?? 0) > 0 || (data.value?.dailyUsage.length ?? 0) > 0,
  )

  const totalWindowCost = computed(() =>
    (data.value?.roomWindowSummary ?? []).reduce((sum, r) => sum + num(r.window_cost_usd), 0),
  )

  // One fixed color per member, by alphabetical position — never by usage — so a
  // member reads as the same color across the donut, timeline and card accent.
  const memberColorMap = computed(() => {
    const names = new Set<string>()
    for (const r of data.value?.roomWindowSummary ?? []) names.add(r.user_name)
    for (const r of data.value?.latestPerUser ?? []) names.add(r.user_name)
    for (const r of data.value?.dailyUsage ?? []) names.add(r.user_name)
    return assignMemberColors(names)
  })

  function colorFor(userName: string) {
    return memberColorMap.value.get(userName) ?? { hex: SERIES_HEX[0], css: 'var(--series-1)' }
  }

  function isActive(recordedAt: string | null | undefined) {
    if (!recordedAt || now.value == null) return false
    return now.value - new Date(recordedAt).getTime() <= 5 * 60_000
  }

  function isIdle(recordedAt: string | null | undefined) {
    if (!recordedAt || now.value == null) return false
    return now.value - new Date(recordedAt).getTime() > 30 * 60_000
  }

  function formatCountdown(resetsAt: string | null | undefined) {
    if (!resetsAt || now.value == null) return '—'
    const diffMs = new Date(resetsAt).getTime() - now.value
    if (diffMs <= 0) return 'resetting now'
    const totalMinutes = Math.floor(diffMs / 60_000)
    const days = Math.floor(totalMinutes / 1440)
    const hours = Math.floor((totalMinutes % 1440) / 60)
    const minutes = totalMinutes % 60
    if (days > 0) return `resets in ${days}d ${hours}h`
    return hours > 0 ? `resets in ${hours}h ${minutes}m` : `resets in ${minutes}m`
  }

  function formatLastSeen(recordedAt: string | null | undefined) {
    if (!recordedAt || now.value == null) return '—'
    const diffMs = now.value - new Date(recordedAt).getTime()
    if (diffMs < 0) return 'just now'
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ${minutes % 60}m ago`
    const dayCount = Math.floor(hours / 24)
    return `${dayCount}d ago`
  }

  // Pace = how the used % compares to how much of the window has elapsed. We know
  // the reset instant and the window length, so elapsed% = (len - remaining)/len.
  function paceFor(pct: number, resetsAt: string | null | undefined, windowMs: number) {
    if (!resetsAt || now.value == null) {
      return { elapsedPct: null as number | null, status: 'steady' as const, label: 'Steady' }
    }
    const remaining = new Date(resetsAt).getTime() - now.value
    const elapsedPct = Math.max(0, Math.min(100, ((windowMs - remaining) / windowMs) * 100))
    const delta = pct - elapsedPct
    if (delta > 8) return { elapsedPct, status: 'ahead' as const, label: 'Ahead of pace' }
    if (delta < -8) return { elapsedPct, status: 'under' as const, label: 'Under pace' }
    return { elapsedPct, status: 'on' as const, label: 'On pace' }
  }

  const pace5h = computed(() =>
    paceFor(num(data.value?.account.fiveHourPct), data.value?.account.fiveHourResetsAt, 5 * 60 * 60_000),
  )

  // Per-session context %, grouped by member, most-recent session first, gated to
  // sessions seen within the idle cutoff so stale/closed sessions don't linger.
  const sessionContextsByUser = computed(() => {
    const byUser = new Map<string, { sessionId: string, contextUsedPct: number, recordedAt: string | null }[]>()
    for (const row of data.value?.sessionContexts ?? []) {
      if (isIdle(row.recorded_at)) continue
      if (!byUser.has(row.user_name)) byUser.set(row.user_name, [])
      byUser.get(row.user_name)!.push({
        sessionId: row.session_id,
        contextUsedPct: num(row.context_used_pct),
        recordedAt: row.recorded_at,
      })
    }
    for (const sessions of byUser.values()) {
      sessions.sort((a, b) => new Date(b.recordedAt ?? 0).getTime() - new Date(a.recordedAt ?? 0).getTime())
    }
    return byUser
  })

  // Neutral member cards, sorted by name (never by usage → never a leaderboard).
  // "slice" = this member's estimated share of the account-wide 5h limit.
  const memberCards = computed(() => {
    const summaryByUser = new Map((data.value?.roomWindowSummary ?? []).map(r => [r.user_name, r]))
    const latestByUser = new Map((data.value?.latestPerUser ?? []).map(r => [r.user_name, r]))
    const userNames = new Set([...summaryByUser.keys(), ...latestByUser.keys()])
    const accountPct = num(data.value?.account.fiveHourPct)

    return Array.from(userNames)
      .map((userName) => {
        const summary = summaryByUser.get(userName)
        const latest = latestByUser.get(userName)
        const windowCost = num(summary?.window_cost_usd)
        const slice = totalWindowCost.value > 0 ? (windowCost / totalWindowCost.value) * accountPct : 0
        const shareOfWindow = totalWindowCost.value > 0 ? (windowCost / totalWindowCost.value) * 100 : 0
        return {
          userName,
          windowCost,
          slice,
          shareOfWindow,
          color: colorFor(userName),
          model: latest?.model ?? '—',
          windowInputTokens: num(summary?.window_input_tokens),
          windowOutputTokens: num(summary?.window_output_tokens),
          sessionContexts: sessionContextsByUser.value.get(userName) ?? [],
          recordedAt: latest?.recorded_at ?? null,
          lastSeenLabel: formatLastSeen(latest?.recorded_at),
          active: isActive(latest?.recorded_at),
          idle: isIdle(latest?.recorded_at),
        }
      })
      .sort((a, b) => a.userName.localeCompare(b.userName))
  })

  const activeMemberCount = computed(() => memberCards.value.filter(m => m.active).length)

  // Room-wide daily rows: daily_usage carries one row per (day, user_name) —
  // rolled up to one row per day. Newest first for tables.
  const dailyRoomRows = computed(() => {
    const byDay = new Map<string, { day: string, peak5h: number, peak7d: number, cost: number, sessions: number }>()
    for (const row of data.value?.dailyUsage ?? []) {
      const existing = byDay.get(row.day) ?? { day: row.day, peak5h: 0, peak7d: 0, cost: 0, sessions: 0 }
      existing.peak5h = Math.max(existing.peak5h, num(row.peak_5h))
      existing.peak7d = Math.max(existing.peak7d, num(row.peak_7d))
      existing.cost += num(row.total_cost_usd)
      existing.sessions += num(row.session_count)
      byDay.set(row.day, existing)
    }
    return Array.from(byDay.values()).sort((a, b) => (a.day < b.day ? 1 : -1))
  })

  const chronologicalDays = computed(() => [...dailyRoomRows.value].reverse())

  const heatmapDays = computed(() =>
    chronologicalDays.value.map(r => ({ day: r.day, label: formatDay(r.day), cost: r.cost })),
  )

  const dailyUsageByUserDay = computed(() => {
    const map = new Map<string, Map<string, number>>()
    for (const row of data.value?.dailyUsage ?? []) {
      if (!map.has(row.user_name)) map.set(row.user_name, new Map())
      const userMap = map.get(row.user_name)!
      userMap.set(row.day, (userMap.get(row.day) ?? 0) + num(row.total_cost_usd))
    }
    return map
  })

  const timelineLabels = computed(() => chronologicalDays.value.map(r => formatDay(r.day)))

  const timelineSeries = computed(() => {
    const days = chronologicalDays.value.map(r => r.day)
    return [...dailyUsageByUserDay.value.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((userName) => {
        const perDay = dailyUsageByUserDay.value.get(userName)!
        return {
          userName,
          colorHex: colorFor(userName).hex,
          data: days.map(day => perDay.get(day) ?? 0),
        }
      })
  })

  const donutMembers = computed(() =>
    (data.value?.roomWindowSummary ?? []).map(r => ({
      userName: r.user_name,
      cost: num(r.window_cost_usd),
      colorHex: colorFor(r.user_name).hex,
      colorCss: colorFor(r.user_name).css,
    })),
  )

  return {
    now,
    hasHistory,
    totalWindowCost,
    colorFor,
    isActive,
    isIdle,
    formatCountdown,
    formatLastSeen,
    pace5h,
    memberCards,
    activeMemberCount,
    dailyRoomRows,
    chronologicalDays,
    heatmapDays,
    timelineLabels,
    timelineSeries,
    donutMembers,
  }
}
