export interface RoomWindowSummaryRow {
  user_name: string
  window_cost_usd: number | string
  account_five_hour_pct: number | string | null
  account_seven_day_pct: number | string | null
  five_hour_resets_at: string | null
  seven_day_resets_at: string | null
}

export interface LatestPerUserRow {
  user_name: string
  model: string | null
  input_tokens: number | string | null
  output_tokens: number | string | null
  recorded_at: string | null
  five_hour_pct: number | string | null
  seven_day_pct: number | string | null
  five_hour_resets_at: string | null
  seven_day_resets_at: string | null
}

export interface DailyUsageRow {
  day: string
  user_name: string
  peak_5h: number | string | null
  peak_7d: number | string | null
  total_cost_usd: number | string
  session_count: number | string
}

export interface MyRoomResponse {
  claudeEmail: string
  roomName: string | null
  isAdmin: boolean
  account: {
    fiveHourPct: number | string | null
    sevenDayPct: number | string | null
    fiveHourResetsAt: string | null
    sevenDayResetsAt: string | null
  }
  roomWindowSummary: RoomWindowSummaryRow[]
  latestPerUser: LatestPerUserRow[]
  dailyUsage: DailyUsageRow[]
}
