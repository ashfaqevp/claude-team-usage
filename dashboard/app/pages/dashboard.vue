<script setup lang="ts">
import type { MyRoomResponse } from '@/types/my-room'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CircleAlert, LogOut } from '@lucide/vue'

const user = useSupabaseUser()
const supabase = useSupabaseClient()

if (!user.value) {
  await navigateTo('/')
}

const { data, error, status, refresh } = await useFetch<MyRoomResponse>('/api/my-room', {
  key: 'my-room',
  immediate: !!user.value,
})

// Session ended (sign-out elsewhere, expiry) while this page is open.
watch(user, (u) => {
  if (!u) navigateTo('/')
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

async function signOut() {
  await supabase.auth.signOut()
  await navigateTo('/')
}

async function handleRename(roomName: string) {
  await $fetch('/api/room-name', { method: 'POST', body: { roomName } })
  if (data.value) data.value.roomName = roomName
}
</script>

<template>
  <div class="min-h-screen bg-background">
    <header class="border-b">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
        <span class="font-semibold tracking-tight">Claude Room</span>
        <div class="flex items-center gap-3">
          <span class="hidden text-sm text-muted-foreground sm:inline">{{ user?.email }}</span>
          <Button variant="ghost" size="sm" @click="signOut">
            <LogOut class="size-3.5" />
            Sign out
          </Button>
        </div>
      </div>
    </header>

    <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div v-if="status === 'pending' && !data" class="space-y-8">
        <Skeleton class="h-40 w-full rounded-lg" />
        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Skeleton v-for="i in 4" :key="i" class="h-20 rounded-lg" />
        </div>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton v-for="i in 3" :key="i" class="h-32 rounded-lg" />
        </div>
      </div>

      <div v-else-if="error" class="flex flex-col items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 py-16 text-center">
        <CircleAlert class="size-8 text-destructive" />
        <p class="font-medium">Couldn't load your Room</p>
        <p class="text-sm text-muted-foreground">{{ error.statusMessage || error.message }}</p>
        <Button variant="outline" size="sm" class="mt-2" @click="refresh()">Try again</Button>
      </div>

      <RoomView v-else-if="data" :data="data" @rename="handleRename" />
    </main>
  </div>
</template>
