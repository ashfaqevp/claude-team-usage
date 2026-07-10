<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { CircleAlert } from 'lucide-vue-next'

defineProps<{ title?: string, message?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="flex flex-col items-center gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 py-16 text-center">
    <CircleAlert class="size-8 text-destructive" />
    <p class="font-medium">{{ title ?? "Couldn't load your Room" }}</p>
    <p class="text-sm text-ink-3">{{ message }}</p>
    <Button variant="outline" size="sm" class="mt-2" @click="$emit('retry')">Try again</Button>
  </div>
</template>
