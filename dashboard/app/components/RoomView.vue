<script setup lang="ts">
import type { MyRoomResponse } from '@/types/my-room'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pencil, Inbox, Flame, Users, TrendingUp, CalendarClock } from '@lucide/vue'

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

type Level = 'cool' | 'amber' | 'red'

function sliceLevel(pct: number): Level {
  if (pct >= 30) return 'red'
  if (pct >= 15) return 'amber'
  return 'cool'
}

const levelBorderClass: Record<Level, string> = {
  cool: 'border-l-sky-500',
  amber: 'border-l-amber-500',
  red: 'border-l-red-500',
}

const levelBadgeClass: Record<Level, string> = {
  cool: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  red: 'bg-red-500/10 text-red-600 dark:text-red-400',
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
        level: sliceLevel(slice),
        model: latest?.model ?? '—',
        inputTokens: num(latest?.input_tokens),
        outputTokens: num(latest?.output_tokens),
        recordedAt: latest?.recorded_at ?? null,
        active: isActive(latest?.recorded_at),
        idle: isIdle(latest?.recorded_at),
      }
    })
    .sort((a, b) => b.slice - a.slice)
})

const topUser = computed(() => memberCards.value[0] ?? null)

// Matches the Asia/Kolkata day bucketing daily_usage uses (see supabase/schema.sql),
// so "today" lines up with the same calendar day the view attributes activity to.
const todayKey = computed(() => {
  if (now.value == null) return null
  return new Date(now.value).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
})

const mostActiveToday = computed(() => {
  if (!todayKey.value) return null
  const todayRows = props.data.dailyUsage.filter(r => r.day === todayKey.value)
  if (!todayRows.length) return null
  return todayRows.reduce((best, r) => (num(r.session_count) > num(best.session_count) ? r : best))
})

const totalSessions = computed(() =>
  props.data.dailyUsage.reduce((sum, r) => sum + num(r.session_count), 0)
)

// Room-wide daily rows: daily_usage carries one row per (day, user_name) — roll them
// up to one row per day for the Room-level table the task asks for.
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

const peakDay = computed(() => {
  if (!dailyRoomRows.value.length) return null
  return dailyRoomRows.value.reduce((best, r) => (r.cost > best.cost ? r : best))
})

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

    <Card>
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
          <div class="text-xs text-muted-foreground">API-equivalent (Max plan — not real spend)</div>
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
      <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card>
          <CardContent class="py-4">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp class="size-3.5" /> Top user this window
            </div>
            <div class="mt-1 truncate text-lg font-semibold">{{ topUser?.userName ?? '—' }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-4">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Flame class="size-3.5" /> Most active today
            </div>
            <div class="mt-1 truncate text-lg font-semibold">{{ mostActiveToday?.user_name ?? '—' }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-4">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users class="size-3.5" /> Total sessions
            </div>
            <div class="mt-1 text-lg font-semibold tabular-nums">{{ totalSessions }}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent class="py-4">
            <div class="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarClock class="size-3.5" /> Peak day
            </div>
            <div class="mt-1 text-lg font-semibold">{{ peakDay ? formatDay(peakDay.day) : '—' }}</div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">Members</h2>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            v-for="card in memberCards"
            :key="card.userName"
            class="border-l-4 transition-opacity"
            :class="[levelBorderClass[card.level], { 'opacity-50': card.idle }]"
          >
            <CardContent class="py-4">
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <span
                    class="size-2 shrink-0 rounded-full"
                    :class="card.active ? 'bg-emerald-500' : card.idle ? 'bg-muted-foreground/40' : 'bg-amber-500'"
                  />
                  <span class="truncate font-medium">{{ card.userName }}</span>
                </div>
                <Badge :class="levelBadgeClass[card.level]">{{ formatPct(card.slice) }}</Badge>
              </div>
              <dl class="mt-3 space-y-1.5 text-sm">
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Window cost</dt>
                  <dd class="tabular-nums">{{ formatCost(card.windowCost) }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Tokens</dt>
                  <dd class="tabular-nums">{{ card.inputTokens.toLocaleString() }} in / {{ card.outputTokens.toLocaleString() }} out</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Model</dt>
                  <dd class="truncate">{{ card.model }}</dd>
                </div>
                <div class="flex justify-between">
                  <dt class="text-muted-foreground">Last seen</dt>
                  <dd>{{ formatLastSeen(card.recordedAt) }}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>

      <div>
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">Daily activity</h2>
        <Card class="overflow-hidden py-0">
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
