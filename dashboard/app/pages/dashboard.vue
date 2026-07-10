<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { data, error, status, refresh } = useMyRoom()

async function handleRename(roomName: string) {
  await $fetch('/api/room-name', { method: 'POST', body: { roomName } })
  if (data.value) data.value.roomName = roomName
}
</script>

<template>
  <RoomSkeleton v-if="status === 'pending' && !data" />
  <ErrorCard
    v-else-if="error"
    :message="error.statusMessage || error.message"
    @retry="refresh()"
  />
  <RoomView v-else-if="data" :data="data" @rename="handleRename" />
</template>
