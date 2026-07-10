<script setup lang="ts">
import type { AdminRoomListItem } from '@/types/admin'
import type { MyRoomResponse } from '@/types/my-room'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CircleAlert, LogOut, Inbox, Sun, Moon, ChevronRight } from '@lucide/vue'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const router = useRouter()
const { isDark, toggle } = useTheme()

const { data: rooms, error: roomsError, status: roomsStatus, refresh: refreshRooms } = await useFetch<AdminRoomListItem[]>('/api/admin/rooms', {
  key: 'admin-rooms',
  immediate: !!user.value,
})

const sortedRooms = computed(() =>
  [...(rooms.value ?? [])].sort((a, b) => {
    const aTime = a.last_active ? new Date(a.last_active).getTime() : 0
    const bTime = b.last_active ? new Date(b.last_active).getTime() : 0
    return bTime - aTime
  })
)

const selectedEmail = ref<string | null>(null)
const roomData = ref<MyRoomResponse | null>(null)
const roomLoading = ref(false)
const roomError = ref('')

async function selectRoom(email: string) {
  selectedEmail.value = email
  roomLoading.value = true
  roomError.value = ''

  try {
    roomData.value = await $fetch<MyRoomResponse>('/api/admin/room', { query: { email } })
  }
  catch (err: any) {
    roomError.value = err?.data?.statusMessage || err?.message || 'Failed to load Room'
    roomData.value = null
  }
  finally {
    roomLoading.value = false
  }
}

// A signed-in-but-not-admin session (or a session that expired) surfaces as a 401/403
// from /api/admin/rooms. Redirect to the admin login WITHOUT signing out - this
// browser's auth session may also be a valid owner session on `/`, and signing out
// here would kill that too. The server-side admins check is independent of anything
// the client does, so nothing is lost by leaving the (non-admin) session intact.
watch(roomsError, (err) => {
  if (err && (err.statusCode === 401 || err.statusCode === 403)) {
    router.replace('/admin/login')
  }
})

watch(user, (u) => {
  if (u) refreshRooms()
})

onMounted(() => {
  if (!user.value) {
    router.replace('/admin/login')
  }
})

let poll: ReturnType<typeof setInterval> | undefined

onMounted(() => {
  poll = setInterval(() => {
    if (!user.value) return
    refreshRooms()
    if (selectedEmail.value) selectRoom(selectedEmail.value)
  }, 30_000)
})

onUnmounted(() => {
  if (poll) clearInterval(poll)
})

async function signOut() {
  await supabase.auth.signOut()
  await router.replace('/admin/login')
}

function formatPct(v: number | string | null | undefined) {
  if (v == null) return '—'
  return `${Number(v).toFixed(1)}%`
}

function formatLastActive(v: string | null) {
  if (!v) return '—'
  const diffMs = Date.now() - new Date(v).getTime()
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
</script>

<template>
  <div v-if="!user" class="flex min-h-screen items-center justify-center bg-background">
    <Skeleton class="h-8 w-48" />
  </div>

  <div v-else class="min-h-screen bg-background text-foreground">
    <header class="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--bg)_88%,transparent)] backdrop-blur-md">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <span class="flex items-center gap-2.5">
          <BrandLogo :size="28" />
          <span class="mono rounded-md border border-border px-2 py-0.5 text-[11px] uppercase tracking-wide text-ink-3">Admin</span>
        </span>
        <div class="flex items-center gap-3">
          <button
            class="flex size-[34px] items-center justify-center rounded-lg border border-border bg-surface text-ink-2 transition-colors hover:text-ink"
            :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="toggle"
          >
            <Sun v-if="isDark" class="size-4" />
            <Moon v-else class="size-4" />
          </button>
          <span class="hidden text-sm text-ink-2 sm:inline">{{ user.email }}</span>
          <Button variant="ghost" size="sm" @click="signOut">
            <LogOut class="size-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <div class="mb-3.5 flex items-center justify-between gap-3">
          <h2 class="text-[15px] font-semibold">
            Rooms
            <span v-if="sortedRooms.length" class="mono text-[12px] font-normal text-ink-3">· {{ sortedRooms.length }}</span>
          </h2>
          <span class="text-[12px] text-ink-3">Select a Room to inspect it</span>
        </div>

        <div v-if="roomsStatus === 'pending' && !rooms" class="space-y-2">
          <Skeleton class="h-14 w-full rounded-xl" />
          <Skeleton class="h-14 w-full rounded-xl" />
          <Skeleton class="h-14 w-full rounded-xl" />
        </div>

        <ErrorCard
          v-else-if="roomsError"
          title="Couldn't load Rooms"
          :message="roomsError.statusMessage || roomsError.message"
          @retry="refreshRooms()"
        />

        <div
          v-else-if="!sortedRooms.length"
          class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-surface py-16 text-center shadow-card"
        >
          <Inbox class="size-8 text-ink-3" />
          <p class="font-medium">No Rooms yet</p>
          <p class="text-sm text-ink-3">A Room appears once its first usage snapshot is synced.</p>
        </div>

        <div v-else class="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <button
            v-for="room in sortedRooms"
            :key="room.claude_email"
            class="flex items-center justify-between gap-3 rounded-xl border bg-surface px-4 py-3 text-left shadow-card transition-colors"
            :class="selectedEmail === room.claude_email
              ? 'border-primary ring-1 ring-primary/40'
              : 'border-border hover:border-primary/40'"
            @click="selectRoom(room.claude_email)"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-medium">{{ room.room_name || room.claude_email }}</div>
              <div class="mt-0.5 truncate text-xs text-ink-3">
                {{ room.member_count }} member{{ room.member_count === 1 ? '' : 's' }} · {{ formatLastActive(room.last_active) }}
              </div>
            </div>
            <div class="flex shrink-0 items-center gap-1.5">
              <span class="mono rounded-md bg-accent-soft px-2 py-0.5 text-[12px] font-medium text-accent-ink">{{ formatPct(room.five_hour_pct) }}</span>
              <ChevronRight class="size-4 text-ink-3" />
            </div>
          </button>
        </div>
      </div>

      <div v-if="selectedEmail">
        <h2 class="mono mb-3.5 text-[13px] text-ink-3">{{ selectedEmail }}</h2>

        <RoomSkeleton v-if="roomLoading && !roomData" />

        <ErrorCard
          v-else-if="roomError"
          title="Couldn't load this Room"
          :message="roomError"
          @retry="selectRoom(selectedEmail)"
        />

        <RoomView v-else-if="roomData" :data="roomData" :allow-rename="false" />
      </div>
    </main>
  </div>
</template>
