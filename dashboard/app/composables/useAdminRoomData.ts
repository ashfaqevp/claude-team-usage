import type { MyRoomResponse } from '@/types/my-room'
import { decodeRoomId } from '@/lib/adminRoom'

// The admin-selected Room's payload (same shape as /api/my-room), keyed off the
// current /admin/room/[id] route param. The fixed key dedupes the admin layout
// (sidebar status + top-bar title) and the room's Overview/Members/History/Settings
// pages into one request, so they never disagree and one refresh updates all.
export function useAdminRoomData() {
  const route = useRoute()
  const id = computed(() => (typeof route.params.id === 'string' ? route.params.id : null))
  const email = computed(() => (id.value ? decodeRoomId(id.value) : ''))

  const state = useFetch<MyRoomResponse>('/api/admin/room', {
    query: { email },
    key: 'admin-room-current',
    immediate: !!email.value,
  })

  return { ...state, id, email }
}
