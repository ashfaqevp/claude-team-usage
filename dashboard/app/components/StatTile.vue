<script setup lang="ts">
defineProps<{ label: string, value: string | number, sub?: string, accent?: boolean }>()
</script>

<template>
  <div class="rounded-2xl border border-border bg-surface px-5 py-4 shadow-card">
    <div class="mono text-[11px] uppercase tracking-[0.06em] text-ink-3">{{ label }}</div>
    <div
      class="mono mt-2 text-[26px] font-medium leading-none"
      :class="accent ? 'text-accent-ink' : ''"
    >{{ value }}</div>
    <div v-if="sub" class="mt-1.5 text-[11.5px] text-ink-3">{{ sub }}</div>
  </div>
</template>
