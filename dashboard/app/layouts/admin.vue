<script setup lang="ts">
import { LayoutGrid, Users, BarChart3, Settings, LayoutList } from 'lucide-vue-next'
import { num } from '@/lib/format'

// Admin shell — the SAME sidebar + top bar + content structure as the owner
// dashboard. On a Room (/admin/room/[id]/*) the sidebar shows the identical
// Overview / Members / History / Settings nav, scoped to that Room, plus an
// "All rooms" link back to the picker. On the /admin index it shows just the
// rooms overview. Owns the admin auth gate and the 30s poll.
const user = useSupabaseUser()
const router = useRouter()
const { data: rooms, error: roomsError, refresh: refreshRooms } = useAdminRooms()
const { data: roomData, id, email, refresh: refreshRoom } = useAdminRoomData()

if (!user.value) {
  await navigateTo('/admin/login')
}

// A signed-in-but-not-admin (or expired) session surfaces as 401/403 from the rooms
// endpoint. Bounce to the admin login WITHOUT signing out — this browser's session
// may still be a valid owner session on '/'.
watch(roomsError, (err: any) => {
  if (err && (err.statusCode === 401 || err.statusCode === 403)) {
    router.replace('/admin/login')
  }
})
watch(user, (u) => {
  if (!u) router.replace('/admin/login')
})

let poll: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  poll = setInterval(() => {
    if (!user.value) return
    refreshRooms()
    if (id.value) refreshRoom()
  }, 30_000)
})
onUnmounted(() => {
  if (poll) clearInterval(poll)
})

const inRoom = computed(() => !!id.value)

const selectedRoom = computed(() =>
  email.value ? (rooms.value ?? []).find(r => r.claude_email === email.value) : null,
)
const title = computed(() => {
  if (!inRoom.value) return 'All rooms'
  return roomData.value?.roomName || selectedRoom.value?.room_name || email.value
})

// Same four sections as the owner sidebar, pointed at this Room's routes.
const roomNav = computed(() => {
  const base = `/admin/room/${id.value}`
  return [
    { label: 'Overview', to: base, icon: LayoutGrid },
    { label: 'Members', to: `${base}/members`, icon: Users },
    { label: 'History', to: `${base}/history`, icon: BarChart3 },
    { label: 'Settings', to: `${base}/settings`, icon: Settings },
  ]
})
const indexNav = [{ label: 'All rooms', to: '/admin', icon: LayoutList }]
const navItems = computed(() => (inRoom.value ? roomNav.value : indexNav))
const topLink = computed(() => (inRoom.value ? { label: 'All rooms', to: '/admin', icon: LayoutList } : null))

// Sidebar status card: room presence when inside a Room, aggregate counts on index.
const presence = useRoomPresence(roomData)
const totalMembers = computed(() => (rooms.value ?? []).reduce((s, r) => s + num(r.member_count), 0))
const statusPrimary = computed(() =>
  inRoom.value
    ? presence.primary.value
    : `${(rooms.value ?? []).length} room${(rooms.value ?? []).length === 1 ? '' : 's'}`,
)
const statusSecondary = computed(() =>
  inRoom.value
    ? (presence.syncedAgo.value ?? 'awaiting first sync')
    : `${totalMembers.value} member${totalMembers.value === 1 ? '' : 's'} total`,
)
const statusActive = computed(() => (inRoom.value ? presence.activeCount.value > 0 : true))
</script>

<template>
  <div class="flex min-h-screen bg-background text-foreground">
    <AppSidebar
      subtitle="ADMIN"
      brand-to="/admin"
      :nav-items="navItems"
      :top-link="topLink"
      :status-primary="statusPrimary"
      :status-secondary="statusSecondary"
      :status-active="statusActive"
    />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar
        :title="title"
        :badge="inRoom ? email : undefined"
        :back-to="inRoom ? '/admin' : undefined"
        :account-email="user?.email"
        sign-out-to="/admin/login"
        :nav-items="navItems"
      />
      <main class="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
