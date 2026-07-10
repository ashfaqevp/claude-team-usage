<script setup lang="ts">
import type { TooltipItem } from 'chart.js'
import { Doughnut } from 'vue-chartjs'
import { formatCost } from '@/lib/format'

const props = defineProps<{
  members: Array<{ userName: string, cost: number, colorHex: string, colorCss: string }>
  totalCost: number
}>()

const theme = useChartTheme()

const activeMembers = computed(() => props.members.filter(m => m.cost > 0))
const soleMember = computed(() => activeMembers.value.length === 1 ? activeMembers.value[0] : null)

const shares = computed(() =>
  activeMembers.value
    .map(m => ({ ...m, pct: props.totalCost > 0 ? (m.cost / props.totalCost) * 100 : 0 }))
    .sort((a, b) => b.pct - a.pct),
)

const chartData = computed(() => ({
  labels: activeMembers.value.map(m => m.userName),
  datasets: [{
    data: activeMembers.value.map(m => m.cost),
    backgroundColor: activeMembers.value.map(m => m.colorHex),
    borderColor: theme.value.surface,
    borderWidth: 2,
    hoverOffset: 4,
  }],
}))

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '64%',
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
        label: (ctx: TooltipItem<'doughnut'>) => ` ${ctx.label}: $${Number(ctx.parsed).toFixed(2)}`,
      },
    },
  },
}))
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface p-5 shadow-card">
    <h3 class="text-[14.5px] font-semibold">Share of this window</h3>
    <p class="mt-0.5 text-[12px] text-ink-3">by API-equivalent cost</p>

    <p v-if="!activeMembers.length" class="py-10 text-center text-sm text-ink-3">
      No usage in the current window yet.
    </p>

    <p v-else-if="soleMember" class="py-10 text-center text-sm text-ink-3">
      <span class="font-medium text-ink">One member active this window</span><br>
      {{ soleMember.userName }} — {{ formatCost(soleMember.cost) }}
    </p>

    <div v-else class="mt-4 flex items-center gap-5">
      <div class="relative size-[124px] shrink-0">
        <Doughnut :data="chartData" :options="chartOptions" />
        <div class="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span class="mono text-[15px] font-medium leading-none">{{ formatCost(totalCost) }}</span>
          <span class="mt-1 text-[10px] text-ink-3">this window</span>
        </div>
      </div>
      <ul class="flex flex-1 flex-col gap-2.5">
        <li v-for="m in shares" :key="m.userName" class="flex items-center gap-2.5 text-[13px]">
          <span class="size-2.5 shrink-0 rounded-[3px]" :style="{ background: m.colorCss }" />
          <span class="min-w-0 flex-1 truncate">{{ m.userName }}</span>
          <span class="mono shrink-0 text-ink-2">{{ m.pct.toFixed(0) }}%</span>
        </li>
      </ul>
    </div>
  </div>
</template>
