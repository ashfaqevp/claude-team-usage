<script setup lang="ts">
import { LayoutGrid, Users, BarChart3, Settings } from 'lucide-vue-next'
import { num } from '@/lib/format'

const { data } = useMyRoom()
const route = useRoute()

const nav = [
  { label: 'Overview', to: '/dashboard', icon: LayoutGrid },
  { label: 'Members', to: '/members', icon: Users },
  { label: 'History', to: '/history', icon: BarChart3 },
  { label: 'Settings', to: '/settings', icon: Settings },
] as const

function isActive(to: string) {
  return route.path === to
}

// Live "active now" count + "synced Ns ago", ticking off a 1s clock.
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  clock = setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => {
  if (clock) clearInterval(clock)
})

const activeCount = computed(() => {
  const rows = data.value?.latestPerUser ?? []
  return rows.filter(r => r.recorded_at && now.value - new Date(r.recorded_at).getTime() <= 5 * 60_000).length
})

// Newest member snapshot = our best proxy for "last sync".
const syncedAt = computed(() => {
  const times = (data.value?.latestPerUser ?? [])
    .map(r => (r.recorded_at ? new Date(r.recorded_at).getTime() : 0))
    .filter(Boolean)
  return times.length ? Math.max(...times) : null
})

const syncedAgo = computed(() => {
  if (!syncedAt.value) return null
  const s = Math.max(0, Math.floor((now.value - syncedAt.value) / 1000))
  if (s < 60) return `synced ${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `synced ${m}m ago`
  return `synced ${Math.floor(m / 60)}h ago`
})

const totalWindowCost = computed(() =>
  (data.value?.roomWindowSummary ?? []).reduce((sum, r) => sum + num(r.window_cost_usd), 0),
)
</script>

<template>
  <aside class="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-border bg-surface-2 px-4 py-5 md:flex">
    <NuxtLink to="/dashboard" class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-ink transition-colors hover:bg-accent-soft">
      <svg width="30" height="30" viewBox="0 0 48 48" fill="none" class="shrink-0" aria-hidden="true">
        <rect width="48" height="48" rx="13" fill="var(--accent)" />
        <g transform="rotate(-90 24 24)">
          <circle cx="24" cy="24" r="15.915" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="44 56" />
          <circle cx="24" cy="24" r="15.915" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="32 68" stroke-dashoffset="-46" opacity=".72" />
          <circle cx="24" cy="24" r="15.915" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="18 82" stroke-dashoffset="-80" opacity=".5" />
        </g>
      </svg>
      <div>
        <div class="font-serif text-[17px] font-medium leading-none">Claude Room</div>
        <div class="mono mt-1 text-[10px] tracking-wide text-ink-3">OWNER DASHBOARD</div>
      </div>
    </NuxtLink>

    <nav class="mt-7 flex flex-col gap-0.5">
      <NuxtLink
        v-for="item in nav"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors"
        :class="isActive(item.to)
          ? 'bg-accent-soft font-medium text-accent-ink'
          : 'text-ink-2 hover:bg-accent-soft hover:text-accent-ink'"
      >
        <component :is="item.icon" class="size-4" />
        {{ item.label }}
      </NuxtLink>
    </nav>

    <div class="mt-auto rounded-xl border border-border bg-surface p-3.5">
      <div class="flex items-center gap-2.5">
        <span
          class="size-2 shrink-0 rounded-full bg-mint"
          :class="activeCount > 0 ? 'shadow-[0_0_0_3px_var(--accent-soft)]' : 'opacity-40'"
        />
        <span class="text-[12.5px] text-ink-2">
          {{ activeCount > 0 ? `${activeCount} member${activeCount === 1 ? '' : 's'} active now` : 'No one active now' }}
        </span>
      </div>
      <div class="mono mt-2 text-[11px] text-ink-3">{{ syncedAgo ?? 'awaiting first sync' }}</div>
    </div>
  </aside>
</template>
