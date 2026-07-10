<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const { data, error, status, refresh } = useAdminRoomData()
</script>

<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="font-serif text-[26px] font-medium">Members</h1>
      <p class="mt-1 text-sm text-ink-3">Each member's estimated slice of the shared limit — sorted by name, never ranked.</p>
    </div>

    <RoomSkeleton v-if="status === 'pending' && !data" />
    <ErrorCard
      v-else-if="error"
      title="Couldn't load this Room"
      :message="(error as any).statusMessage || error.message"
      @retry="refresh()"
    />
    <MembersContent v-else-if="data" :data="data" />
  </div>
</template>
