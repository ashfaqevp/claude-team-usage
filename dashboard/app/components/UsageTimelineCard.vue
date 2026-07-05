<script setup lang="ts">
import type { TooltipItem } from 'chart.js'
import { Bar } from 'vue-chartjs'
import { TrendingUp } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{
  labels: string[]
  series: Array<{ userName: string, colorHex: string, data: number[] }>
}>()

const chartData = computed(() => ({
  labels: props.labels,
  datasets: props.series.map(s => ({
    label: s.userName,
    data: s.data,
    backgroundColor: s.colorHex,
    borderColor: '#171717',
    borderWidth: 2,
    borderRadius: 3,
    maxBarThickness: 24,
    stack: 'total',
  })),
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index' as const, intersect: false },
  scales: {
    x: {
      stacked: true,
      grid: { display: false },
      ticks: { color: '#898781' },
    },
    y: {
      stacked: true,
      grid: { color: 'rgba(255,255,255,0.08)' },
      ticks: {
        color: '#898781',
        callback: (v: number | string) => `$${v}`,
      },
    },
  },
  plugins: {
    legend: {
      position: 'bottom' as const,
      labels: { color: '#c3c2b7', boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'circle' },
    },
    tooltip: {
      backgroundColor: '#171717',
      titleColor: '#ffffff',
      bodyColor: '#c3c2b7',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      padding: 8,
      callbacks: {
        label: (ctx: TooltipItem<'bar'>) =>
          ` ${ctx.dataset.label}: $${(ctx.parsed.y ?? 0).toFixed(2)}`,
      },
    },
  },
}
</script>

<template>
  <Card class="shadow-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-1.5 text-base">
        <TrendingUp class="size-4 text-muted-foreground" />
        Daily usage over time
      </CardTitle>
      <CardDescription>Total trend and rough composition across members, per day</CardDescription>
    </CardHeader>
    <CardContent>
      <p v-if="!labels.length" class="py-8 text-center text-sm text-muted-foreground">
        No usage recorded yet.
      </p>
      <div v-else class="h-64">
        <Bar :data="chartData" :options="chartOptions" />
      </div>
    </CardContent>
  </Card>
</template>
