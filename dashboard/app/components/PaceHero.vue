<script setup lang="ts">
import { formatCost, formatPct } from '@/lib/format'

const props = defineProps<{
  fiveHourPct: number
  sevenDayPct: number
  fiveHourResetsLabel: string
  sevenDayResetsLabel: string
  paceLabel: string
  paceStatus: 'under' | 'on' | 'ahead' | 'steady'
  elapsedPct: number | null
  totalCost: number
}>()

// Warm status color: comfortably under pace reads calm (mint), on pace neutral
// (clay), ahead of pace is the one to notice (a soft red).
const paceColor = computed(() => {
  switch (props.paceStatus) {
    case 'under': return 'var(--green)'
    case 'ahead': return '#e06a54'
    default: return 'var(--clay)'
  }
})
</script>

<template>
  <section class="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
    <!-- 5-hour pace -->
    <div class="rounded-2xl border border-border bg-surface px-6 py-6 shadow-card">
      <div class="flex items-start justify-between gap-5">
        <div>
          <div class="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">Shared 5-hour window</div>
          <div class="mt-2 flex items-baseline gap-3">
            <span class="mono text-[44px] font-medium leading-none tracking-tight">
              {{ fiveHourPct.toFixed(0) }}<span class="text-[24px] text-ink-3">%</span>
            </span>
            <span
              class="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-medium"
              :style="{ color: paceColor }"
            >
              <span class="size-1.5 rounded-full" :style="{ background: paceColor }" />{{ paceLabel }}
            </span>
          </div>
        </div>
        <div class="text-right">
          <div class="mono text-[24px] font-medium leading-none">{{ formatCost(totalCost) }}</div>
          <div class="mt-1.5 text-[11.5px] text-ink-3">API-equivalent · not real spend</div>
        </div>
      </div>

      <div class="mt-6">
        <div class="relative h-2.5 rounded-full bg-track">
          <div class="h-full rounded-full bg-primary" :style="{ width: `${Math.min(100, fiveHourPct)}%` }" />
          <template v-if="elapsedPct != null">
            <div class="absolute -top-1 -bottom-1 w-0.5 rounded-sm bg-ink-2" :style="{ left: `${elapsedPct}%` }" />
            <div
              class="mono absolute -top-[18px] -translate-x-1/2 text-[9.5px] text-ink-3"
              :style="{ left: `${elapsedPct}%` }"
            >now</div>
          </template>
        </div>
        <div class="mt-2.5 flex justify-between gap-3 text-[11.5px] text-ink-3">
          <span>
            <template v-if="elapsedPct != null">
              {{ formatPct(fiveHourPct) }} used vs {{ elapsedPct.toFixed(0) }}% of window elapsed
            </template>
            <template v-else>{{ formatPct(fiveHourPct) }} used</template>
          </span>
          <span class="mono shrink-0">{{ fiveHourResetsLabel }}</span>
        </div>
      </div>
    </div>

    <!-- 7-day -->
    <div class="flex flex-col justify-center rounded-2xl border border-border bg-surface px-6 py-6 shadow-card">
      <div class="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">Shared 7-day window</div>
      <div class="mt-2 flex items-baseline gap-2">
        <span class="mono text-[34px] font-medium leading-none tracking-tight">
          {{ sevenDayPct.toFixed(0) }}<span class="text-[18px] text-ink-3">%</span>
        </span>
      </div>
      <div class="mt-4 h-2 overflow-hidden rounded-full bg-track">
        <div class="h-full rounded-full bg-plum" :style="{ width: `${Math.min(100, sevenDayPct)}%` }" />
      </div>
      <div class="mono mt-2.5 text-[11.5px] text-ink-3">{{ sevenDayResetsLabel }}</div>
    </div>
  </section>
</template>
