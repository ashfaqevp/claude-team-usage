export interface AdminRoomListItem {
  claude_email: string
  room_name: string | null
  member_count: number | string
  last_active: string | null
  five_hour_pct: number | string | null
}
