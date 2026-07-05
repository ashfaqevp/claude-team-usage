<script setup lang="ts">
import { CalendarDays } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { heatLevelColor } from '@/lib/chartColors'

const props = defineProps<{
  // Chronological, oldest first.
  days: Array<{ day: string, label: string, cost: number }>
}>()

function formatCost(v: number) {
  return `$${v.toFixed(2)}`
}

function toUtcDate(day: string) {
  return new Date(`${day}T00:00:00Z`)
}

function addDays(d: Date, n: number) {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

function isoDay(d: Date) {
  return d.toISOString().slice(0, 10)
}

const maxCost = computed(() => Math.max(0, ...props.days.map(d => d.cost)))

function levelFor(cost: number) {
  if (!(cost > 0) || maxCost.value <= 0) return 0
  const ratio = cost / maxCost.value
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

const costByDay = computed(() => new Map(props.days.map(d => [d.day, d.cost])))

interface Cell { date: Date, day: string, cost: number, level: number }

// A GitHub-style grid: columns are weeks (Sun -> Sat top to bottom), padded out
// to full weeks at both ends so the grid lines up like the real contribution
// graph, even though our data range rarely starts on a Sunday.
const weeks = computed(() => {
  if (!props.days.length) return [] as Array<Array<Cell | null>>
  const sortedDays = [...props.days].map(d => d.day).sort()
  const first = toUtcDate(sortedDays[0]!)
  const last = toUtcDate(sortedDays[sortedDays.length - 1]!)
  const gridStart = addDays(first, -first.getUTCDay())
  const gridEnd = addDays(last, 6 - last.getUTCDay())

  const result: Array<Array<Cell | null>> = []
  let cursor = gridStart
  while (cursor <= gridEnd) {
    const week: Array<Cell | null> = []
    for (let i = 0; i < 7; i++) {
      const inRange = cursor >= first && cursor <= last
      if (inRange) {
        const day = isoDay(cursor)
        const cost = costByDay.value.get(day) ?? 0
        week.push({ date: new Date(cursor), day, cost, level: levelFor(cost) })
      }
      else {
        week.push(null)
      }
      cursor = addDays(cursor, 1)
    }
    result.push(week)
  }
  return result
})

const monthLabels = computed(() => {
  let lastMonth = -1
  return weeks.value.map((week) => {
    const firstCell = week.find((c): c is Cell => c != null)
    if (!firstCell) return null
    const month = firstCell.date.getUTCMonth()
    if (month === lastMonth) return null
    lastMonth = month
    return firstCell.date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  })
})

const weekdayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', '']

function cellTitle(cell: Cell) {
  const label = cell.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return `${label}: ${formatCost(cell.cost)} (API-equivalent)`
}

const busiestDay = computed(() => {
  if (!props.days.length) return null
  return props.days.reduce((best, d) => (d.cost > best.cost ? d : best))
})
</script>

<template>
  <Card class="shadow-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-1.5 text-base">
        <CalendarDays class="size-4 text-muted-foreground" />
        Room rhythm
      </CardTitle>
      <CardDescription>When the Room tends to be busy, by day</CardDescription>
    </CardHeader>
    <CardContent>
      <p v-if="!days.length" class="py-8 text-center text-sm text-muted-foreground">
        No activity yet.
      </p>
      <template v-else>
        <div class="flex gap-2 overflow-x-auto pb-1">
          <div class="grid shrink-0 grid-rows-7 gap-[3px] pt-[18px] text-[9px] leading-none text-muted-foreground">
            <span v-for="(lbl, i) in weekdayLabels" :key="i" class="flex h-[11px] items-center">{{ lbl }}</span>
          </div>
          <div>
            <div class="mb-1 grid auto-cols-[11px] grid-flow-col gap-[3px] text-[9px] leading-none text-muted-foreground">
              <span v-for="(m, i) in monthLabels" :key="i">{{ m }}</span>
            </div>
            <div class="grid grid-flow-col grid-rows-7 gap-[3px]">
              <template v-for="(week, wi) in weeks" :key="wi">
                <div
                  v-for="(cell, di) in week"
                  :key="di"
                  class="size-[11px] rounded-[2px] ring-1 ring-inset ring-white/5"
                  :class="{ 'opacity-0': !cell }"
                  :style="cell ? { backgroundColor: heatLevelColor(cell.level) } : undefined"
                  :title="cell ? cellTitle(cell) : undefined"
                />
              </template>
            </div>
          </div>
        </div>
        <div class="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span v-if="busiestDay">
            Busiest day: <span class="text-foreground">{{ busiestDay.label }}</span> ({{ formatCost(busiestDay.cost) }})
          </span>
          <span class="flex items-center gap-1">
            Less
            <span v-for="lvl in [0, 1, 2, 3, 4]" :key="lvl" class="size-[10px] rounded-[2px] ring-1 ring-inset ring-white/5" :style="{ backgroundColor: heatLevelColor(lvl) }" />
            More
          </span>
        </div>
      </template>
    </CardContent>
  </Card>
</template>
