<script setup lang="ts">
import { formatCost } from '@/lib/format'

const props = defineProps<{
  // Chronological, oldest first.
  days: Array<{ day: string, label: string, cost: number }>
}>()

// Warm accent ramp built off the theme tokens, so the heatmap stays cohesive with
// the brand and recolors with the light/dark toggle. Level 0 = the bare track.
function levelColor(level: number) {
  if (level <= 0) return 'var(--track)'
  return `color-mix(in srgb, var(--accent) ${Math.min(100, level * 22)}%, var(--track))`
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
  <div class="rounded-2xl border border-border bg-surface p-5 shadow-card">
    <h3 class="text-[14.5px] font-semibold">Room rhythm</h3>
    <p class="mt-0.5 text-[12px] text-ink-3">When the Room tends to be busy, by day</p>

    <p v-if="!days.length" class="py-10 text-center text-sm text-ink-3">No activity yet.</p>

    <template v-else>
      <div class="mt-4 flex gap-2 overflow-x-auto pb-1">
        <div class="grid shrink-0 grid-rows-7 gap-[3px] pt-[18px] text-[9px] leading-none text-ink-3">
          <span v-for="(lbl, i) in weekdayLabels" :key="i" class="flex h-[11px] items-center">{{ lbl }}</span>
        </div>
        <div>
          <div class="mb-1 grid auto-cols-[11px] grid-flow-col gap-[3px] text-[9px] leading-none text-ink-3">
            <span v-for="(m, i) in monthLabels" :key="i">{{ m }}</span>
          </div>
          <div class="grid grid-flow-col grid-rows-7 gap-[3px]">
            <template v-for="(week, wi) in weeks" :key="wi">
              <div
                v-for="(cell, di) in week"
                :key="di"
                class="size-[11px] rounded-[3px] ring-1 ring-inset ring-black/5 dark:ring-white/5"
                :class="{ 'opacity-0': !cell }"
                :style="cell ? { backgroundColor: levelColor(cell.level) } : undefined"
                :title="cell ? cellTitle(cell) : undefined"
              />
            </template>
          </div>
        </div>
      </div>
      <div class="mt-3 flex items-center justify-between text-xs text-ink-3">
        <span v-if="busiestDay">
          Busiest day: <span class="text-ink">{{ busiestDay.label }}</span> ({{ formatCost(busiestDay.cost) }})
        </span>
        <span class="flex items-center gap-1">
          Less
          <span
            v-for="lvl in [0, 1, 2, 3, 4]"
            :key="lvl"
            class="size-[10px] rounded-[3px] ring-1 ring-inset ring-black/5 dark:ring-white/5"
            :style="{ backgroundColor: levelColor(lvl) }"
          />
          More
        </span>
      </div>
    </template>
  </div>
</template>
