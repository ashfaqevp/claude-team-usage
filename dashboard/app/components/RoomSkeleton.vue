<script setup lang="ts">
import { Skeleton } from '@/components/ui/skeleton'
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Skeleton class="h-36 rounded-2xl" />
      <Skeleton class="h-36 rounded-2xl" />
    </div>
    <div class="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton v-for="i in 3" :key="i" class="h-44 rounded-2xl" />
    </div>
    <div class="grid gap-3.5 lg:grid-cols-[1fr_1.5fr]">
      <Skeleton class="h-56 rounded-2xl" />
      <Skeleton class="h-56 rounded-2xl" />
    </div>
  </div>
</template>
