<script setup lang="ts">
import type { Component } from 'vue'

interface NavItem { label: string, to: string, icon: Component }

// Shared sidebar for both the owner shell and the admin room shell. Everything it
// renders is passed in, so the two shells look and behave identically — the admin
// just points the same nav at a Room's /admin/room/[id]/* routes.
withDefaults(defineProps<{
  subtitle: string
  brandTo: string
  navItems: NavItem[]
  topLink?: NavItem | null
  statusPrimary?: string | null
  statusSecondary?: string | null
  statusActive?: boolean
}>(), {
  topLink: null,
  statusActive: false,
})

const route = useRoute()
function isActive(to: string) {
  return route.path === to
}
</script>

<template>
  <aside class="sticky top-0 hidden h-screen w-[236px] shrink-0 flex-col border-r border-border bg-surface-2 px-4 py-5 md:flex">
    <NuxtLink :to="brandTo" class="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-ink transition-colors hover:bg-accent-soft">
      <BrandLogo :size="30" :wordmark="false" />
      <div>
        <div class="font-serif text-[17px] font-medium leading-none">Claude Room</div>
        <div class="mono mt-1 text-[10px] tracking-wide text-ink-3">{{ subtitle }}</div>
      </div>
    </NuxtLink>

    <NuxtLink
      v-if="topLink"
      :to="topLink.to"
      class="mt-6 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-2 transition-colors hover:bg-accent-soft hover:text-accent-ink"
    >
      <component :is="topLink.icon" class="size-4" />
      {{ topLink.label }}
    </NuxtLink>

    <nav class="flex flex-col gap-0.5" :class="topLink ? 'mt-4' : 'mt-7'">
      <NuxtLink
        v-for="item in navItems"
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

    <div v-if="statusPrimary" class="mt-auto rounded-xl border border-border bg-surface p-3.5">
      <div class="flex items-center gap-2.5">
        <span
          class="size-2 shrink-0 rounded-full bg-mint"
          :class="statusActive ? 'shadow-[0_0_0_3px_var(--accent-soft)]' : 'opacity-40'"
        />
        <span class="text-[12.5px] text-ink-2">{{ statusPrimary }}</span>
      </div>
      <div v-if="statusSecondary" class="mono mt-2 text-[11px] text-ink-3">{{ statusSecondary }}</div>
    </div>
  </aside>
</template>
