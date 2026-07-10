import type { MyRoomResponse } from '@/types/my-room'

// Shared fetch of the signed-in owner's Room. Every authed page (Overview,
// Members, History, Settings) and the dashboard shell (sidebar + top bar) read
// from this — the fixed `key` makes Nuxt dedupe them into a single request and a
// single reactive payload, so the shell and the page never disagree, and a
// refresh() from one place updates all of them.
export function useMyRoom() {
  const user = useSupabaseUser()
  return useFetch<MyRoomResponse>('/api/my-room', {
    key: 'my-room',
    immediate: !!user.value,
  })
}
