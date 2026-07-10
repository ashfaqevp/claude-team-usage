<script setup lang="ts">
// Shell for every authed owner page (Overview / Members / History / Settings):
// sidebar + top bar + the routed page. Owns the auth gate and the 30s poll so
// each page doesn't have to. Room data itself comes from useMyRoom() (shared key),
// which the sidebar, top bar and pages all read.
const user = useSupabaseUser()
const { refresh } = useMyRoom()

if (!user.value) {
  await navigateTo('/login')
}

// Session ended elsewhere (sign-out, expiry) while a page is open.
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
</script>

<template>
  <div class="flex min-h-screen bg-background text-foreground">
    <AppSidebar />
    <div class="flex min-w-0 flex-1 flex-col">
      <AppTopbar />
      <main class="mx-auto w-full max-w-[1180px] flex-1 px-4 pb-16 pt-7 sm:px-6 lg:px-8">
        <slot />
      </main>
    </div>
  </div>
</template>
