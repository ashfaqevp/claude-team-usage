<script setup lang="ts">
import type { AdminRoomListItem } from '@/types/admin'
import type { MyRoomResponse } from '@/types/my-room'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CircleAlert, LogOut, Inbox } from '@lucide/vue'

const user = useSupabaseUser()
const supabase = useSupabaseClient()
const router = useRouter()

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

  <div v-else class="min-h-screen bg-background">
    <header class="border-b">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <span class="font-semibold tracking-tight">Claude Room — Admin</span>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-muted-foreground sm:inline">{{ user.email }}</span>
          <Button variant="ghost" size="sm" @click="signOut">
            <LogOut class="size-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      <div>
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">Rooms</h2>

        <div v-if="roomsStatus === 'pending' && !rooms" class="space-y-2">
          <Skeleton class="h-10 w-full rounded-lg" />
          <Skeleton class="h-10 w-full rounded-lg" />
          <Skeleton class="h-10 w-full rounded-lg" />
        </div>

        <div v-else-if="roomsError" class="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-12 text-center">
          <CircleAlert class="size-8 text-destructive" />
          <p class="font-medium">Couldn't load Rooms</p>
          <p class="text-sm text-muted-foreground">{{ roomsError.statusMessage || roomsError.message }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="refreshRooms()">Try again</Button>
        </div>

        <Card v-else-if="!sortedRooms.length" class="border-dashed">
          <CardContent class="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox class="size-8 text-muted-foreground" />
            <p class="font-medium">No Rooms yet</p>
            <p class="text-sm text-muted-foreground">A Room appears once its first usage snapshot is synced.</p>
          </CardContent>
        </Card>

        <Card v-else class="overflow-hidden py-0">
          <div class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Room</TableHead>
                  <TableHead>Members</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>5h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="room in sortedRooms"
                  :key="room.claude_email"
                  class="cursor-pointer"
                  :class="{ 'bg-muted/50': selectedEmail === room.claude_email }"
                  @click="selectRoom(room.claude_email)"
                >
                  <TableCell>
                    <div class="font-medium">{{ room.room_name || room.claude_email }}</div>
                    <div v-if="room.room_name" class="text-xs text-muted-foreground">{{ room.claude_email }}</div>
                  </TableCell>
                  <TableCell class="tabular-nums">{{ room.member_count }}</TableCell>
                  <TableCell>{{ formatLastActive(room.last_active) }}</TableCell>
                  <TableCell><Badge variant="secondary">{{ formatPct(room.five_hour_pct) }}</Badge></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>

      <div v-if="selectedEmail">
        <h2 class="mb-3 text-sm font-medium text-muted-foreground">{{ selectedEmail }}</h2>

        <div v-if="roomLoading && !roomData" class="space-y-8">
          <Skeleton class="h-40 w-full rounded-lg" />
          <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Skeleton v-for="i in 3" :key="i" class="h-32 rounded-lg" />
          </div>
        </div>

        <div v-else-if="roomError" class="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
          <CircleAlert class="size-8 text-destructive" />
          <p class="font-medium">Couldn't load this Room</p>
          <p class="text-sm text-muted-foreground">{{ roomError }}</p>
          <Button variant="outline" size="sm" class="mt-2" @click="selectRoom(selectedEmail)">Try again</Button>
        </div>

        <RoomView v-else-if="roomData" :data="roomData" :allow-rename="false" />
      </div>
    </main>
  </div>
</template>
