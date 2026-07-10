<script setup lang="ts">
// The Claude Room brand mark: a rounded-square badge (#D97757) with a three-arc
// ring motif echoing the usage-split concept. Self-contained (orange badge,
// white rings) so it reads on both light and dark surfaces. Source of truth is
// the "Logo Assets" bundle; keep the geometry in sync if that changes.
withDefaults(defineProps<{
  // Icon edge length in px.
  size?: number
  // Show the "Claude Room" wordmark beside the mark (the full lockup).
  wordmark?: boolean
  // Tailwind text-size utility for the wordmark (headers use text-lg, the
  // sign-in hero a larger size).
  wordmarkClass?: string
}>(), {
  size: 28,
  wordmark: true,
  wordmarkClass: 'text-lg',
})
</script>

<template>
  <span class="inline-flex items-center gap-2">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      class="shrink-0"
    >
      <rect width="48" height="48" rx="13" fill="#D97757" />
      <g transform="rotate(-90 24 24)">
        <circle cx="24" cy="24" r="15.915" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="44 56" stroke-dashoffset="0" />
        <circle cx="24" cy="24" r="15.915" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="32 68" stroke-dashoffset="-46" opacity=".72" />
        <circle cx="24" cy="24" r="15.915" fill="none" stroke="#fff" stroke-width="6" stroke-dasharray="18 82" stroke-dashoffset="-80" opacity=".5" />
      </g>
    </svg>
    <span v-if="wordmark" class="font-serif font-medium tracking-tight text-foreground" :class="wordmarkClass">
      Claude Room
    </span>
  </span>
</template>
