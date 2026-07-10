<script setup lang="ts">
import { LayoutGrid, Users, BarChart3, Settings } from 'lucide-vue-next'

// Shell for every authed owner page (Overview / Members / History / Settings):
// sidebar + top bar + the routed page. Owns the auth gate and the 30s poll so
// each page doesn't have to. Room data comes from useMyRoom() (shared key), which
// the sidebar, top bar and pages all read.
const user = useSupabaseUser()
const { data, refresh } = useMyRoom()

if (!user.value) {
  await navigateTo('/login')
}

watch(user, (u) => {
  if (!u) navigateTo('/login')
})

let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  poll = setInterval(() => {
    if (user.value) refresh()
  }, 30_000)
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
})

const navItems = [
  { label: 'Overview', to: '/dashboard', icon: LayoutGrid },
  { label: 'Members', to: '/members', icon: Users },
  { label: 'History', to: '/history', icon: BarChart3 },
  { label: 'Settings', to: '/settings', icon: Settings },
]

const { primary, syncedAgo, activeCount } = useRoomPresence(data)
const title = computed(() => data.value?.roomName || data.value?.claudeEmail || 'Your Room')
</script>

<template>
  <div class="flex min-h-screen bg-background text-foreground">
    <AppSidebar
      subtitle="OWNER DASHBOARD"
      brand-to="/dashboard"
      :nav-items="navItems"
      :status-primary="primary"
      :status-secondary="syncedAgo ?? 'awaiting first sync'"
      :status-active="activeCount > 0"
    />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar
        :title="title"
        :badge="data?.claudeEmail"
        :account-email="user?.email"
        :show-admin-link="data?.isAdmin"
        :nav-items="navItems"
      />
      <main class="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
