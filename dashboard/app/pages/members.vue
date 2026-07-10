<script setup lang="ts">
import { Users } from 'lucide-vue-next'
import { formatCost } from '@/lib/format'

definePageMeta({ layout: 'dashboard' })

const { data, error, status, refresh } = useMyRoom()
const { memberCards, activeMemberCount, totalWindowCost, donutMembers, hasHistory } = useRoomModel(data)
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="font-serif text-[26px] font-medium">Members</h1>
      <p class="mt-1 text-sm text-ink-3">Each member's estimated slice of the shared limit — sorted by name, never ranked.</p>
    </div>

    <RoomSkeleton v-if="status === 'pending' && !data" />
    <ErrorCard v-else-if="error" :message="error.statusMessage || error.message" @retry="refresh()" />

    <template v-else-if="data">
      <div
        v-if="!hasHistory"
        class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface py-20 text-center shadow-card"
      >
        <Users class="size-8 text-ink-3" />
        <p class="font-medium">No members yet</p>
        <p class="text-sm text-ink-3">Members appear here once they run Claude Code with the extension.</p>
      </div>

      <template v-else>
        <div class="grid grid-cols-2 gap-3.5 lg:grid-cols-3">
          <StatTile label="Members" :value="memberCards.length" />
          <StatTile label="Active now" :value="activeMemberCount" :sub="activeMemberCount ? 'in the last 5 min' : 'no live sessions'" accent />
          <StatTile label="Window cost" :value="formatCost(totalWindowCost)" sub="API-equivalent" />
        </div>

        <section class="grid gap-3.5 lg:grid-cols-[1.6fr_1fr]">
          <div class="grid gap-3.5 sm:grid-cols-2">
            <MemberCard v-for="card in memberCards" :key="card.userName" :card="card" />
          </div>
          <ShareDonutCard :members="donutMembers" :total-cost="totalWindowCost" />
        </section>
      </template>
    </template>
  </div>
</template>
