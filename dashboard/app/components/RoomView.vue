<script setup lang="ts">
import type { MyRoomResponse } from '@/types/my-room'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pencil, Inbox, Users, History } from 'lucide-vue-next'
import { assignMemberColors, SERIES_HEX } from '@/lib/chartColors'

const props = withDefaults(defineProps<{ data: MyRoomResponse, allowRename?: boolean }>(), {
  allowRename: true,
})
const emit = defineEmits<{ rename: [name: string] }>()

// Ticks once a second so countdowns / last-seen / active-idle state stay live without refetching.
const now = ref<number | null>(null)
let clock: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  now.value = Date.now()
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (clock) clearInterval(clock)
})

const num = (v: number | string | null | undefined) => (v == null ? 0 : Number(v))

const hasHistory = computed(() => props.data.latestPerUser.length > 0 || props.data.dailyUsage.length > 0)

const totalWindowCost = computed(() =>
  props.data.roomWindowSummary.reduce((sum, r) => sum + num(r.window_cost_usd), 0)
)

// One fixed color per member, by name (alphabetical), never by usage - so a
// member's color never shifts with how much they've used. Shared across the
// donut, the timeline, and each member card's accent so the same person reads as
// the same color everywhere on the page.
const memberColorMap = computed(() => {
  const names = new Set<string>()
  for (const r of props.data.roomWindowSummary) names.add(r.user_name)
  for (const r of props.data.latestPerUser) names.add(r.user_name)
  for (const r of props.data.dailyUsage) names.add(r.user_name)
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
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
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
  return `${hours}h ${minutes % 60}m ago`
}

function formatPct(v: number) {
  return `${v.toFixed(1)}%`
}

function formatCost(v: number) {
  return `$${v.toFixed(2)}`
}

function formatDay(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

// Neutral status cards, one per member - sorted by name (not by usage), so the
// grid never reads as a leaderboard. "Slice" here is this member's estimated
// share of the account-wide 5h limit, which is a different number from the donut's
// share of this window's usage - labelled explicitly on the card to avoid the two
// percentages looking like a contradiction.
const memberCards = computed(() => {
  const summaryByUser = new Map(props.data.roomWindowSummary.map(r => [r.user_name, r]))
  const latestByUser = new Map(props.data.latestPerUser.map(r => [r.user_name, r]))
  const userNames = new Set([...summaryByUser.keys(), ...latestByUser.keys()])
  const accountPct = num(props.data.account.fiveHourPct)

  return Array.from(userNames)
    .map((userName) => {
      const summary = summaryByUser.get(userName)
      const latest = latestByUser.get(userName)
      const windowCost = num(summary?.window_cost_usd)
      const slice = totalWindowCost.value > 0 ? (windowCost / totalWindowCost.value) * accountPct : 0
      return {
        userName,
        windowCost,
        slice,
        color: colorFor(userName),
        model: latest?.model ?? '—',
        // Delta-summed across ALL of this member's sessions in the current window (see
        // get_room_window_summary/session_token_deltas) - NOT the latest snapshot's
        // cumulative total, which would silently drop a second parallel session's
        // tokens and fold in pre-window spend from a long-running session.
        windowInputTokens: num(summary?.window_input_tokens),
        windowOutputTokens: num(summary?.window_output_tokens),
        // Concept B: this member's currently-active sessions' own context-window
        // fullness, never summed/averaged (see sessionContextsByUser below).
        sessionContexts: sessionContextsByUser.value.get(userName) ?? [],
        recordedAt: latest?.recorded_at ?? null,
        active: isActive(latest?.recorded_at),
        idle: isIdle(latest?.recorded_at),
      }
    })
    .sort((a, b) => a.userName.localeCompare(b.userName))
})

// Concept B grouping: per-session context %, grouped by member, sorted by most
// recently seen session first. Deliberately never reduced to one number per user.
//
// sessionContexts (from roomData.ts) is built from the last 500 snapshots across the
// whole Room, which can include sessions that ended a long time ago - without a
// recency gate, a member's card would show stale/closed sessions' context % as if
// they were still live. Gated on the same isIdle() cutoff (30 min) this component
// already uses to dim a member's whole card, so "still counts as active" means the
// same thing everywhere in this view.
const sessionContextsByUser = computed(() => {
  const byUser = new Map<string, { sessionId: string, contextUsedPct: number, recordedAt: string | null }[]>()
  for (const row of props.data.sessionContexts) {
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

function shortSessionId(sessionId: string) {
  return sessionId.slice(0, 8)
}

// Room-wide daily rows: daily_usage carries one row per (day, user_name) — rolled
// up to one row per day for the Room-level table and charts.
const dailyRoomRows = computed(() => {
  const byDay = new Map<string, { day: string, peak5h: number, peak7d: number, cost: number, sessions: number }>()
  for (const row of props.data.dailyUsage) {
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
  chronologicalDays.value.map(r => ({ day: r.day, label: formatDay(r.day), cost: r.cost }))
)

const dailyUsageByUserDay = computed(() => {
  const map = new Map<string, Map<string, number>>()
  for (const row of props.data.dailyUsage) {
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
  props.data.roomWindowSummary.map(r => ({
    userName: r.user_name,
    cost: num(r.window_cost_usd),
    colorHex: colorFor(r.user_name).hex,
    colorCss: colorFor(r.user_name).css,
  }))
)

const renameOpen = ref(false)
const renameValue = ref('')

function openRename() {
  renameValue.value = props.data.roomName ?? ''
  renameOpen.value = true
}

function submitRename() {
  const trimmed = renameValue.value.trim()
  if (!trimmed) return
  emit('rename', trimmed)
  renameOpen.value = false
}
</script>

<template>
  <div class="space-y-8">
    <div
      v-if="allowRename && hasHistory && !data.roomName"
      class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3"
    >
      <p class="text-sm">
        <span class="font-medium">Name your Room</span> — give it a label so it's easy to recognise.
      </p>
      <Button size="sm" @click="openRename">Name it</Button>
    </div>

    <Card class="shadow-sm">
      <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-1.5">
            <CardTitle class="text-xl">{{ data.roomName || data.claudeEmail }}</CardTitle>
            <Button v-if="allowRename" variant="ghost" size="icon-sm" aria-label="Rename Room" @click="openRename">
              <Pencil class="size-3.5" />
            </Button>
          </div>
          <CardDescription>Tracking {{ data.claudeEmail }}</CardDescription>
        </div>
        <div class="text-right">
          <div class="text-2xl font-semibold tabular-nums">{{ formatCost(totalWindowCost) }}</div>
          <div class="flex items-center justify-end gap-1 text-xs text-muted-foreground">
            API-equivalent (Max plan — not real spend)
            <Icon name="lucide:info" class="size-3" title="This account is on a Max plan - these figures show what usage would have cost on API pricing, not real spend." />
          </div>
        </div>
      </CardHeader>
      <CardContent class="grid gap-6 sm:grid-cols-2">
        <div>
          <div class="mb-1.5 flex items-baseline justify-between text-sm">
            <span class="font-medium">5-hour window</span>
            <span class="tabular-nums text-muted-foreground">{{ formatPct(num(data.account.fiveHourPct)) }}</span>
          </div>
          <Progress :model-value="num(data.account.fiveHourPct)" />
          <div class="mt-1 text-xs text-muted-foreground">{{ formatCountdown(data.account.fiveHourResetsAt) }}</div>
        </div>
        <div>
          <div class="mb-1.5 flex items-baseline justify-between text-sm">
            <span class="font-medium">7-day window</span>
            <span class="tabular-nums text-muted-foreground">{{ formatPct(num(data.account.sevenDayPct)) }}</span>
          </div>
          <Progress :model-value="num(data.account.sevenDayPct)" />
          <div class="mt-1 text-xs text-muted-foreground">{{ formatCountdown(data.account.sevenDayResetsAt) }}</div>
        </div>
      </CardContent>
    </Card>

    <Card v-if="!hasHistory" class="border-dashed">
      <CardContent class="flex flex-col items-center gap-2 py-16 text-center">
        <Inbox class="size-8 text-muted-foreground" />
        <p class="font-medium">No usage yet for {{ data.roomName || data.claudeEmail }}</p>
        <p class="text-sm text-muted-foreground">Data appears here once a Room member runs Claude Code.</p>
      </CardContent>
    </Card>

    <template v-else>
      <div>
        <h2 class="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <Users class="size-4" /> Members
        </h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            v-for="card in memberCards"
            :key="card.userName"
            class="rounded-lg border-l-4 py-4 shadow-sm transition-opacity"
            :style="{ borderLeftColor: card.color.css }"
            :class="{ 'opacity-50': card.idle }"
          >
            <CardContent>
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span
                    class="size-2 shrink-0 rounded-full"
                    :class="card.active ? 'bg-emerald-500' : card.idle ? 'bg-muted-foreground/40' : 'bg-amber-500'"
                  />
                  <span class="truncate font-medium">{{ card.userName }}</span>
                </div>
                <div class="text-right">
                  <Badge variant="secondary" :title="`${formatPct(card.slice)} of the account's 5h limit`">
                    {{ formatPct(card.slice) }}
                  </Badge>
                  <div class="mt-0.5 text-[10px] text-muted-foreground">of 5h limit</div>
                </div>
              </div>
              <dl class="mt-3 space-y-1.5 text-sm">
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Window cost</dt>
                  <dd class="tabular-nums">{{ formatCost(card.windowCost) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground" title="Summed from per-snapshot deltas across all of this member's sessions in the current 5h window - not a single session's latest cumulative reading">Tokens this window</dt>
                  <dd class="tabular-nums">{{ card.windowInputTokens.toLocaleString() }} in / {{ card.windowOutputTokens.toLocaleString() }} out</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Model</dt>
                  <dd class="truncate">{{ card.model }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Last seen</dt>
                  <dd>{{ formatLastSeen(card.recordedAt) }}</dd>
                </div>
                <div v-if="card.sessionContexts.length > 0" class="flex justify-between gap-2">
                  <dt class="text-muted-foreground" title="Per-conversation memory fullness for each currently-active session - not summed or averaged across sessions">Context usage</dt>
                  <dd class="flex flex-wrap justify-end gap-1">
                    <span
                      v-for="sc in card.sessionContexts"
                      :key="sc.sessionId"
                      class="rounded border px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground"
                      :title="`Session ${sc.sessionId}`"
                    >
                      {{ shortSessionId(sc.sessionId) }}: {{ formatPct(sc.contextUsedPct) }}
                    </span>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-2">
        <ShareDonutCard :members="donutMembers" :total-cost="totalWindowCost" />
        <ActivityHeatmapCard :days="heatmapDays" />
      </div>

      <UsageTimelineCard :labels="timelineLabels" :series="timelineSeries" />

      <div>
        <h2 class="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <History class="size-4" /> Daily activity
        </h2>
        <Card class="overflow-hidden py-0 shadow-sm">
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Day</TableHead>
                  <TableHead>Peak 5h</TableHead>
                  <TableHead>Peak 7d</TableHead>
                  <TableHead>Cost <span class="text-muted-foreground">(API-equivalent)</span></TableHead>
                  <TableHead>Sessions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="row in dailyRoomRows" :key="row.day">
                  <TableCell>{{ formatDay(row.day) }}</TableCell>
                  <TableCell class="tabular-nums">{{ formatPct(row.peak5h) }}</TableCell>
                  <TableCell class="tabular-nums">{{ formatPct(row.peak7d) }}</TableCell>
                  <TableCell class="tabular-nums">{{ formatCost(row.cost) }}</TableCell>
                  <TableCell class="tabular-nums">{{ row.sessions }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </template>

    <Dialog v-model:open="renameOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name your Room</DialogTitle>
          <DialogDescription>Shown instead of the tracked email address.</DialogDescription>
        </DialogHeader>
        <Input v-model="renameValue" placeholder="e.g. Acme Engineering" @keyup.enter="submitRename" />
        <DialogFooter>
          <Button variant="outline" @click="renameOpen = false">Cancel</Button>
          <Button @click="submitRename">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
