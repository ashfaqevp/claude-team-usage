import type { Ref } from 'vue'
import type { MyRoomResponse } from '@/types/my-room'

// Live "active now" count + "synced Ns ago" for a Room, ticking off a 1s clock.
// Shared by the owner shell and the admin room shell so both sidebars show the
// same status card without duplicating the logic.
export function useRoomPresence(data: Ref<MyRoomResponse | null | undefined>) {
  const now = ref(Date.now())
  let clock: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    clock = setInterval(() => { now.value = Date.now() }, 1000)
  })
  onUnmounted(() => {
    if (clock) clearInterval(clock)
  })

  const activeCount = computed(() => {
    const rows = data.value?.latestPerUser ?? []
    return rows.filter(r => r.recorded_at && now.value - new Date(r.recorded_at).getTime() <= 5 * 60_000).length
  })

  const syncedAt = computed(() => {
    const times = (data.value?.latestPerUser ?? [])
      .map(r => (r.recorded_at ? new Date(r.recorded_at).getTime() : 0))
      .filter(Boolean)
    return times.length ? Math.max(...times) : null
  })

  const syncedAgo = computed(() => {
    if (!syncedAt.value) return null
    const s = Math.max(0, Math.floor((now.value - syncedAt.value) / 1000))
    if (s < 60) return `synced ${s}s ago`
    const m = Math.floor(s / 60)
    if (m < 60) return `synced ${m}m ago`
    return `synced ${Math.floor(m / 60)}h ago`
  })

  const primary = computed(() =>
    activeCount.value > 0
      ? `${activeCount.value} member${activeCount.value === 1 ? '' : 's'} active now`
      : 'No one active now',
  )

  return { activeCount, syncedAgo, primary }
}
