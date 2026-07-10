<script setup lang="ts">
import type { TooltipItem } from 'chart.js'
import { Bar } from 'vue-chartjs'

const props = defineProps<{
  labels: string[]
  series: Array<{ userName: string, colorHex: string, data: number[] }>
  title?: string
  subtitle?: string
}>()

const theme = useChartTheme()

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.series.map(s => ({
    label: s.userName,
    data: s.data,
    backgroundColor: s.colorHex,
    borderColor: theme.value.surface,
    borderWidth: 1.5,
    borderRadius: 4,
    maxBarThickness: 26,
    stack: 'total',
  })),
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      border: { display: false },
      ticks: { color: theme.value.tick, font: { size: 11 } },
    },
    y: {
      stacked: true,
      grid: { color: theme.value.grid },
      border: { display: false },
      ticks: {
        color: theme.value.tick,
        font: { size: 11 },
        callback: (v: number | string) => `$${v}`,
      },
    },
  },
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: theme.value.tooltipBg,
      titleColor: theme.value.tooltipTitle,
      bodyColor: theme.value.tooltipBody,
      borderColor: theme.value.tooltipBorder,
      borderWidth: 1,
      padding: 8,
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) => ` ${ctx.dataset.label}: $${(ctx.parsed.y ?? 0).toFixed(2)}`,
      },
    },
  },
}))
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-5 shadow-card">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 class="text-[14.5px] font-semibold">{{ title ?? 'Daily activity' }}</h3>
        <p class="mt-0.5 text-[12px] text-ink-3">{{ subtitle ?? 'API-equivalent cost, stacked by member' }}</p>
      </div>
      <div class="flex flex-wrap gap-3 text-[11px] text-ink-2">
        <span v-for="s in series" :key="s.userName" class="flex items-center gap-1.5">
          <span class="size-2 rounded-[2px]" :style="{ background: s.colorHex }" />{{ s.userName }}
        </span>
      </div>
    </div>

    <p v-if="!labels.length" class="py-10 text-center text-sm text-ink-3">
      No usage recorded yet.
    </p>
    <div v-else class="mt-5 h-56">
      <Bar :data="chartData" :options="chartOptions" />
    </div>
  </div>
</template>
