<script setup lang="ts">
import type { TooltipItem } from 'chart.js'
import { Doughnut } from 'vue-chartjs'
import { PieChart } from 'lucide-vue-next'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const props = defineProps<{
  members: Array<{ userName: string, cost: number, colorHex: string, colorCss: string }>
  totalCost: number
}>()

function formatCost(v: number) {
  return `$${v.toFixed(2)}`
}

const activeMembers = computed(() => props.members.filter(m => m.cost > 0))
const soleMember = computed(() => activeMembers.value.length === 1 ? activeMembers.value[0] : null)

const shares = computed(() =>
  activeMembers.value.map(m => ({
    ...m,
    pct: props.totalCost > 0 ? (m.cost / props.totalCost) * 100 : 0,
  }))
)

const chartData = computed(() => ({
  labels: activeMembers.value.map(m => m.userName),
  datasets: [{
    data: activeMembers.value.map(m => m.cost),
    backgroundColor: activeMembers.value.map(m => m.colorHex),
    borderColor: '#171717',
    borderWidth: 2,
    hoverOffset: 4,
  }],
}))

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  cutout: '62%',
  plugins: {
    legend: { display: false },
    tooltip: {
      backgroundColor: '#171717',
      titleColor: '#ffffff',
      bodyColor: '#c3c2b7',
      borderColor: 'rgba(255,255,255,0.1)',
      borderWidth: 1,
      padding: 8,
      callbacks: {
        label: (ctx: TooltipItem<'doughnut'>) => ` ${ctx.label}: $${Number(ctx.parsed).toFixed(2)}`,
      },
    },
  },
}
</script>

<template>
  <Card class="flex flex-col shadow-sm">
    <CardHeader>
      <CardTitle class="flex items-center gap-1.5 text-base">
        <PieChart class="size-4 text-muted-foreground" />
        Current window — usage split
      </CardTitle>
      <CardDescription>How this window's usage is currently divided across members</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-1 flex-col justify-center gap-4">
      <p v-if="!activeMembers.length" class="py-8 text-center text-sm text-muted-foreground">
        No usage in the current window yet.
      </p>

      <p v-else-if="soleMember" class="py-8 text-center text-sm text-muted-foreground">
        <span class="font-medium text-foreground">One member active this window</span><br>
        {{ soleMember.userName }} — {{ formatCost(soleMember.cost) }}
      </p>

      <template v-else>
        <div class="relative mx-auto h-48 w-48">
          <Doughnut :data="chartData" :options="chartOptions" />
        </div>
        <ul class="space-y-1.5 text-sm">
          <li v-for="m in shares" :key="m.userName" class="flex items-center justify-between gap-2">
            <span class="flex min-w-0 items-center gap-2">
              <span class="size-2.5 shrink-0 rounded-full" :style="{ backgroundColor: m.colorCss }" />
              <span class="truncate">{{ m.userName }}</span>
            </span>
            <span class="shrink-0 tabular-nums text-muted-foreground">{{ m.pct.toFixed(1) }}%</span>
          </li>
        </ul>
      </template>
    </CardContent>
  </Card>
</template>
