<script setup lang="ts">
import { Sun, Moon, LogOut, Menu, LayoutGrid, Users, BarChart3, Settings } from 'lucide-vue-next'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const { data } = useMyRoom()
const { isDark, toggle } = useTheme()
const user = useSupabaseUser()
const supabase = useSupabaseClient()

const title = computed(() => data.value?.roomName || data.value?.claudeEmail || 'Your Room')
const trackedEmail = computed(() => data.value?.claudeEmail ?? '')
const avatarLetter = computed(() => (title.value || 'R').charAt(0).toUpperCase())

const nav = [
  { label: 'Overview', to: '/dashboard', icon: LayoutGrid },
  { label: 'Members', to: '/members', icon: Users },
  { label: 'History', to: '/history', icon: BarChart3 },
  { label: 'Settings', to: '/settings', icon: Settings },
] as const

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/login')
}
</script>

<template>
  <header class="sticky top-0 z-10 flex h-[60px] items-center justify-between gap-3 border-b border-border bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] px-4 backdrop-blur-md sm:px-6 lg:px-8">
    <div class="flex min-w-0 items-center gap-2.5">
      <!-- mobile nav -->
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-ink-2 transition-colors hover:text-ink md:hidden"
            aria-label="Open navigation"
          >
            <Menu class="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" class="w-44">
          <DropdownMenuItem v-for="item in nav" :key="item.to" as-child>
            <NuxtLink :to="item.to" class="flex items-center gap-2.5">
              <component :is="item.icon" class="size-4" />
              {{ item.label }}
            </NuxtLink>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <h1 class="truncate font-serif text-[22px] font-medium">{{ title }}</h1>
      <span
        v-if="trackedEmail"
        class="mono hidden shrink-0 rounded-md border border-border px-2 py-0.5 text-[11px] text-ink-3 sm:inline"
      >{{ trackedEmail }}</span>
    </div>

    <div class="flex shrink-0 items-center gap-3">
      <button
        class="flex size-[34px] items-center justify-center rounded-lg border border-border bg-surface text-ink-2 transition-colors hover:text-ink"
        :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
        @click="toggle"
      >
        <Sun v-if="isDark" class="size-4" />
        <Moon v-else class="size-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <button
            class="flex size-[34px] items-center justify-center rounded-full bg-primary text-[14px] font-semibold text-primary-foreground"
            aria-label="Account menu"
          >
            {{ avatarLetter }}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuLabel class="font-normal">
            <div class="text-xs text-muted-foreground">Signed in as</div>
            <div class="truncate text-sm font-medium">{{ user?.email }}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem v-if="data?.isAdmin" as-child>
            <NuxtLink to="/admin">Admin dashboard</NuxtLink>
          </DropdownMenuItem>
          <DropdownMenuItem @select="signOut">
            <LogOut class="size-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
</template>
