<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
import { Inbox, ChevronRight } from 'lucide-vue-next'
import { num } from '@/lib/format'
import { encodeRoomId } from '@/lib/adminRoom'

definePageMeta({ layout: 'admin' })

const { data: rooms, error, status, refresh } = useAdminRooms()

const sortedRooms = computed(() =>
  [...(rooms.value ?? [])].sort((a, b) => {
    const at = a.last_active ? new Date(a.last_active).getTime() : 0
    const bt = b.last_active ? new Date(b.last_active).getTime() : 0
    return bt - at
  }),
)

const totals = computed(() => {
  const list = rooms.value ?? []
  const members = list.reduce((s, r) => s + num(r.member_count), 0)
  const active = list.filter(r => r.last_active && Date.now() - new Date(r.last_active).getTime() <= 5 * 60_000).length
  return { rooms: list.length, members, active }
})

function formatPct(v: number | string | null | undefined) {
  if (v == null) return '—'
  return `${Number(v).toFixed(0)}%`
}

function formatLastActive(v: string | null) {
  if (!v) return 'never'
  const minutes = Math.floor((Date.now() - new Date(v).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="font-serif text-[26px] font-medium">All rooms</h1>
      <p class="mt-1 text-sm text-ink-3">Every Room syncing to Claude Room. Open one to inspect it.</p>
    </div>

    <div v-if="status === 'pending' && !rooms" class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 6" :key="i" class="h-[72px] rounded-xl" />
    </div>

    <ErrorCard
      v-else-if="error"
      title="Couldn't load Rooms"
      :message="(error as any).statusMessage || error.message"
      @retry="refresh()"
    />

    <div
      v-else-if="!sortedRooms.length"
      class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface py-20 text-center shadow-card"
    >
      <Inbox class="size-8 text-ink-3" />
      <p class="font-medium">No Rooms yet</p>
      <p class="text-sm text-ink-3">A Room appears once its first usage snapshot is synced.</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-3 gap-3.5">
        <StatTile label="Rooms" :value="totals.rooms" />
        <StatTile label="Active now" :value="totals.active" :sub="totals.active ? 'in the last 5 min' : 'none live'" accent />
        <StatTile label="Members" :value="totals.members" sub="across all rooms" />
      </div>

      <div class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="room in sortedRooms"
          :key="room.claude_email"
          :to="`/admin/room/${encodeRoomId(room.claude_email)}`"
          class="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 py-3 shadow-card transition-colors hover:border-primary/40"
        >
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{{ room.room_name || room.claude_email }}</div>
            <div class="mt-0.5 truncate text-xs text-ink-3">
              {{ num(room.member_count) }} member{{ num(room.member_count) === 1 ? '' : 's' }} · {{ formatLastActive(room.last_active) }}
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-1.5">
            <span class="mono rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent-ink">{{ formatPct(room.five_hour_pct) }}</span>
            <ChevronRight class="size-4 text-ink-3" />
          </div>
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
