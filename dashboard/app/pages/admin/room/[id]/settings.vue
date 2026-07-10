<script setup lang="ts">
import { formatPct, num } from '@/lib/format'

definePageMeta({ layout: 'admin' })

const { data, error, status, refresh } = useAdminRoomData()

// Reuse the same derivations the owner view uses, for the member roster + counts.
const { memberCards, formatCountdown } = useRoomModel(data)
</script>

<template>
  <div class="flex max-w-[720px] flex-col gap-6">
    <div>
      <h1 class="font-serif text-[26px] font-medium">Settings</h1>
      <p class="mt-1 text-sm text-ink-3">Admin view of this Room — read only.</p>
    </div>

    <RoomSkeleton v-if="status === 'pending' && !data" />
    <ErrorCard
      v-else-if="error"
      title="Couldn't load this Room"
      :message="(error as any).statusMessage || error.message"
      @retry="refresh()"
    />

    <template v-else-if="data">
      <section class="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 class="text-[15px] font-semibold">Room</h2>
        <dl class="mt-4 flex flex-col gap-3 text-sm">
          <div class="flex justify-between gap-3">
            <dt class="text-ink-2">Name</dt>
            <dd class="font-medium">{{ data.roomName || '— (unnamed)' }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-ink-2">Tracked account</dt>
            <dd class="mono">{{ data.claudeEmail }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt class="text-ink-2">Members</dt>
            <dd class="mono">{{ memberCards.length }}</dd>
          </div>
        </dl>
      </section>

      <section class="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 class="text-[15px] font-semibold">Shared limits</h2>
        <div class="mt-4 grid grid-cols-2 gap-4">
          <div>
            <div class="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">5-hour</div>
            <div class="mono mt-1.5 text-[22px] font-medium">{{ formatPct(num(data.account.fiveHourPct)) }}</div>
            <div class="mono mt-1 text-[11.5px] text-ink-3">{{ formatCountdown(data.account.fiveHourResetsAt) }}</div>
          </div>
          <div>
            <div class="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">7-day</div>
            <div class="mono mt-1.5 text-[22px] font-medium">{{ formatPct(num(data.account.sevenDayPct)) }}</div>
            <div class="mono mt-1 text-[11.5px] text-ink-3">{{ formatCountdown(data.account.sevenDayResetsAt) }}</div>
          </div>
        </div>
      </section>

      <section v-if="memberCards.length" class="rounded-2xl border border-border bg-surface p-6 shadow-card">
        <h2 class="text-[15px] font-semibold">Roster</h2>
        <ul class="mt-4 flex flex-col gap-2.5">
          <li v-for="m in memberCards" :key="m.userName" class="flex items-center justify-between gap-3 text-sm">
            <span class="flex min-w-0 items-center gap-2.5">
              <span class="size-2 shrink-0 rounded-full" :style="{ background: m.color.css }" />
              <span class="truncate">{{ m.userName }}</span>
            </span>
            <span class="mono shrink-0 text-ink-3">{{ m.active ? 'active now' : m.lastSeenLabel }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
