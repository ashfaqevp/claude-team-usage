<script setup lang="ts">
import { formatCost, formatPct, formatTokens, initials, shortSessionId } from '@/lib/format'

interface MemberCardData {
  userName: string
  windowCost: number
  slice: number
  shareOfWindow: number
  color: { hex: string, css: string }
  model: string
  windowInputTokens: number
  windowOutputTokens: number
  sessionContexts: { sessionId: string, contextUsedPct: number, recordedAt: string | null }[]
  lastSeenLabel: string
  active: boolean
  idle: boolean
}

defineProps<{ card: MemberCardData }>()
</script>

<template>
  <div
    class="relative overflow-hidden rounded-2xl border border-border bg-surface p-[18px] shadow-card transition-opacity"
    :class="{ 'opacity-60': card.idle }"
  >
    <span class="absolute inset-y-0 left-0 w-[3px]" :style="{ background: card.color.css }" />

    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-2.5">
        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold text-white"
          :style="{ background: card.color.css }"
        >{{ initials(card.userName) }}</span>
        <div class="min-w-0">
          <div class="truncate text-[14.5px] font-medium">{{ card.userName }}</div>
          <div
            v-if="card.active"
            class="flex items-center gap-1.5 text-[11px] text-mint"
          >
            <span class="size-[5px] rounded-full bg-mint" />active now
          </div>
          <div v-else class="text-[11px] text-ink-3">{{ card.lastSeenLabel }}</div>
        </div>
      </div>
      <div class="shrink-0 text-right">
        <div class="mono text-[19px] font-medium leading-none">{{ formatPct(card.slice) }}</div>
        <div class="mt-1 text-[9.5px] text-ink-3">of 5h limit</div>
      </div>
    </div>

    <div class="my-[15px] h-[5px] overflow-hidden rounded-full bg-track">
      <div
        class="h-full rounded-full"
        :style="{ width: `${Math.min(100, card.shareOfWindow)}%`, background: card.color.css }"
      />
    </div>

    <dl class="flex flex-col gap-2 text-[13px]">
      <div class="flex justify-between">
        <dt class="text-ink-2">Window cost</dt>
        <dd class="mono">{{ formatCost(card.windowCost) }}</dd>
      </div>
      <div class="flex justify-between">
        <dt class="text-ink-2" title="Summed from per-snapshot deltas across all of this member's sessions in the current 5h window">Tokens</dt>
        <dd class="mono">{{ formatTokens(card.windowInputTokens) }} / {{ formatTokens(card.windowOutputTokens) }}</dd>
      </div>
      <div class="flex justify-between gap-2">
        <dt class="text-ink-2">Model</dt>
        <dd class="truncate">{{ card.model }}</dd>
      </div>
      <div v-if="card.sessionContexts.length" class="flex items-start justify-between gap-2">
        <dt class="text-ink-2">Context</dt>
        <dd class="flex flex-wrap justify-end gap-1">
          <span
            v-for="sc in card.sessionContexts"
            :key="sc.sessionId"
            class="mono rounded-md border border-border px-1.5 py-px text-[11px] text-ink-3"
            :title="`Session ${sc.sessionId}`"
          >{{ shortSessionId(sc.sessionId) }} · {{ formatPct(sc.contextUsedPct) }}</span>
        </dd>
      </div>
    </dl>
  </div>
</template>
