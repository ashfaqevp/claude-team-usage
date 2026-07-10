<script setup lang="ts">
import { toRef } from 'vue'
import type { MyRoomResponse } from '@/types/my-room'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Inbox, ArrowRight } from 'lucide-vue-next'
import { formatCost, formatDay, formatPct, num } from '@/lib/format'

const props = withDefaults(defineProps<{ data: MyRoomResponse, allowRename?: boolean }>(), {
  allowRename: true,
})
const emit = defineEmits<{ rename: [name: string] }>()

const dataRef = toRef(props, 'data')
const {
  hasHistory, totalWindowCost, pace5h, formatCountdown,
  memberCards, donutMembers, timelineLabels, timelineSeries, dailyRoomRows,
} = useRoomModel(dataRef)

const recentRows = computed(() => dailyRoomRows.value.slice(0, 6))

const renameOpen = ref(false)
const renameValue = ref('')

function openRename() {
  renameValue.value = props.data.roomName ?? ''
  renameOpen.value = true
}
function submitRename() {
  const trimmed = renameValue.value.trim()
  if (!trimmed) return
  emit('rename', trimmed)
  renameOpen.value = false
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- name-your-room prompt -->
    <div
      v-if="allowRename && hasHistory && !data.roomName"
      class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-accent-soft px-4 py-3"
    >
      <p class="text-sm text-ink">
        <span class="font-medium">Name your Room</span> — give it a label so it's easy to recognise.
      </p>
      <Button size="sm" @click="openRename">Name it</Button>
    </div>

    <!-- empty -->
    <div
      v-if="!hasHistory"
      class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface py-20 text-center shadow-card"
    >
      <Inbox class="size-8 text-ink-3" />
      <p class="font-medium">No usage yet for {{ data.roomName || data.claudeEmail }}</p>
      <p class="text-sm text-ink-3">Data appears here once a Room member runs Claude Code.</p>
    </div>

    <template v-else>
      <PaceHero
        :five-hour-pct="num(data.account.fiveHourPct)"
        :seven-day-pct="num(data.account.sevenDayPct)"
        :five-hour-resets-label="formatCountdown(data.account.fiveHourResetsAt)"
        :seven-day-resets-label="formatCountdown(data.account.sevenDayResetsAt)"
        :pace-label="pace5h.label"
        :pace-status="pace5h.status"
        :elapsed-pct="pace5h.elapsedPct"
        :total-cost="totalWindowCost"
      />

      <!-- members -->
      <section>
        <div class="mb-3.5 flex items-center justify-between gap-3">
          <h2 class="text-[15px] font-semibold">
            Members <span class="mono text-[12px] font-normal text-ink-3">· {{ memberCards.length }}</span>
          </h2>
          <span class="hidden text-[12px] text-ink-3 sm:inline">Sorted by name · never ranked by usage</span>
        </div>
        <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          <MemberCard v-for="card in memberCards" :key="card.userName" :card="card" />
        </div>
      </section>

      <!-- charts -->
      <section class="grid gap-3.5 lg:grid-cols-[1fr_1.5fr]">
        <ShareDonutCard :members="donutMembers" :total-cost="totalWindowCost" />
        <UsageTimelineCard :labels="timelineLabels" :series="timelineSeries" />
      </section>

      <!-- recent history -->
      <section>
        <div class="mb-3.5 flex items-center justify-between gap-3">
          <h2 class="text-[15px] font-semibold">History</h2>
          <NuxtLink
            v-if="allowRename"
            to="/history"
            class="inline-flex items-center gap-1 text-[12.5px] text-accent-ink transition-opacity hover:opacity-80"
          >
            View full history <ArrowRight class="size-3.5" />
          </NuxtLink>
        </div>
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
                <tr v-for="row in recentRows" :key="row.day" class="border-b border-line-2 last:border-0">
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
        <p class="mt-3 max-w-[60em] text-[11.5px] leading-relaxed text-ink-3">
          Per-member slice = cost share × account 5h%. An estimate — Anthropic exposes no true per-person
          breakdown on a shared account. claude.ai web chat draws from the same pool but has no status line,
          so visible slices can sum to less than the account total.
        </p>
      </section>
    </template>

    <Dialog v-model:open="renameOpen">
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Name your Room</DialogTitle>
          <DialogDescription>Shown instead of the tracked email address.</DialogDescription>
        </DialogHeader>
        <Input v-model="renameValue" placeholder="e.g. Acme Engineering" @keyup.enter="submitRename" />
        <DialogFooter>
          <Button variant="outline" @click="renameOpen = false">Cancel</Button>
          <Button @click="submitRename">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
