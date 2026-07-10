<script setup lang="ts">
import { BarChart3 } from 'lucide-vue-next'
import { formatCost, formatDay, formatPct } from '@/lib/format'

definePageMeta({ layout: 'dashboard' })

const { data, error, status, refresh } = useMyRoom()
const {
  hasHistory, dailyRoomRows, heatmapDays, timelineLabels, timelineSeries,
} = useRoomModel(data)

const totals = computed(() => {
  const rows = dailyRoomRows.value
  const cost = rows.reduce((s, r) => s + r.cost, 0)
  const sessions = rows.reduce((s, r) => s + r.sessions, 0)
  const busiest = rows.reduce<{ day: string, cost: number } | null>(
    (best, r) => (!best || r.cost > best.cost ? { day: r.day, cost: r.cost } : best), null,
  )
  return { cost, sessions, busiest, days: rows.length }
})
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="font-serif text-[26px] font-medium">History</h1>
      <p class="mt-1 text-sm text-ink-3">Daily peaks, cost and sessions across the whole Room.</p>
    </div>

    <RoomSkeleton v-if="status === 'pending' && !data" />
    <ErrorCard v-else-if="error" :message="error.statusMessage || error.message" @retry="refresh()" />

    <template v-else-if="data">
      <div
        v-if="!hasHistory"
        class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface py-20 text-center shadow-card"
      >
        <BarChart3 class="size-8 text-ink-3" />
        <p class="font-medium">No history yet</p>
        <p class="text-sm text-ink-3">Daily activity builds up here as the Room is used.</p>
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <StatTile label="Days tracked" :value="totals.days" />
          <StatTile label="Total cost" :value="formatCost(totals.cost)" sub="API-equivalent" accent />
          <StatTile label="Sessions" :value="totals.sessions" />
          <StatTile
            label="Busiest day"
            :value="totals.busiest ? formatDay(totals.busiest.day) : '—'"
            :sub="totals.busiest ? formatCost(totals.busiest.cost) : undefined"
          />
        </div>

        <UsageTimelineCard
          :labels="timelineLabels"
          :series="timelineSeries"
          title="Daily usage over time"
          subtitle="API-equivalent cost, stacked by member"
        />

        <ActivityHeatmapCard :days="heatmapDays" />

        <section>
          <h2 class="mb-3.5 text-[15px] font-semibold">Daily log</h2>
          <div class="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="bg-surface-2">
                    <th class="border-b border-line-2 px-5 py-3 text-left text-[12px] font-medium text-ink-3">Day</th>
                    <th class="border-b border-line-2 px-5 py-3 text-right text-[12px] font-medium text-ink-3">Peak 5h</th>
                    <th class="border-b border-line-2 px-5 py-3 text-right text-[12px] font-medium text-ink-3">Peak 7d</th>
                    <th class="border-b border-line-2 px-5 py-3 text-right text-[12px] font-medium text-ink-3">Cost (API-equiv)</th>
                    <th class="border-b border-line-2 px-5 py-3 text-right text-[12px] font-medium text-ink-3">Sessions</th>
                  </tr>
                </thead>
                <tbody class="mono">
                  <tr v-for="row in dailyRoomRows" :key="row.day" class="border-b border-line-2 last:border-0">
                    <td class="px-5 py-3 font-sans">{{ formatDay(row.day) }}</td>
                    <td class="px-5 py-3 text-right">{{ formatPct(row.peak5h) }}</td>
                    <td class="px-5 py-3 text-right">{{ formatPct(row.peak7d) }}</td>
                    <td class="px-5 py-3 text-right">{{ formatCost(row.cost) }}</td>
                    <td class="px-5 py-3 text-right">{{ row.sessions }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>
