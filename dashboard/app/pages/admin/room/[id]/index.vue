<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { data, error, status, refresh, email } = useAdminRoomData()
</script>

<template>
  <div v-if="!email" class="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-16 text-center">
    <p class="font-medium">Invalid room link</p>
    <NuxtLink to="/admin" class="text-sm text-accent-ink hover:opacity-80">Back to all rooms</NuxtLink>
  </div>

  <RoomSkeleton v-else-if="status === 'pending' && !data" />
  <ErrorCard
    v-else-if="error"
    title="Couldn't load this Room"
    :message="(error as any).statusMessage || error.message"
    @retry="refresh()"
  />
  <RoomView v-else-if="data" :data="data" :allow-rename="false" />
</template>
