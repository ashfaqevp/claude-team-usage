// Pure display formatters shared across the dashboard. Time-relative helpers
// (countdowns, "last seen") live in useRoomModel where a live `now` clock is
// available; everything here is a stateless value → string transform.

export function num(v: number | string | null | undefined): number {
  return v == null ? 0 : Number(v)
}

export function formatPct(v: number): string {
  return `${v.toFixed(1)}%`
}

export function formatCost(v: number): string {
  return `$${v.toFixed(2)}`
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// Compact token count, matching the design's "1.1M / 140k" style.
export function formatTokens(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`
  return `${v}`
}

// Two-initial avatar seed from a member name.
export function initials(name: string): string {
  const clean = name.trim()
  if (!clean) return '?'
  return clean.slice(0, 2).toLowerCase()
}

export function shortSessionId(sessionId: string): string {
  return sessionId.slice(0, 8)
}
