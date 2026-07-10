import type { AdminRoomListItem } from '@/types/admin'

// Shared list of every Room for the admin shell. The fixed key dedupes the sidebar,
// the /admin overview and the layout's auth-gate watcher into one request/payload.
export function useAdminRooms() {
  const user = useSupabaseUser()
  return useFetch<AdminRoomListItem[]>('/api/admin/rooms', {
    key: 'admin-rooms',
    immediate: !!user.value,
  })
}
