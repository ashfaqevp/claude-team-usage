export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admins: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      rooms: {
        Row: {
          claude_email: string
          created_at: string
          room_name: string | null
        }
        Insert: {
          claude_email: string
          created_at?: string
          room_name?: string | null
        }
        Update: {
          claude_email?: string
          created_at?: string
          room_name?: string | null
        }
        Relationships: []
      }
      usage_snapshots: {
        Row: {
          account_email: string | null
          cost_usd: number | null
          five_hour_pct: number | null
          five_hour_resets_at: string | null
          id: number
          input_tokens: number | null
          inserted_at: string
          machine: string | null
          model: string | null
          output_tokens: number | null
          recorded_at: string
          session_id: string | null
          seven_day_pct: number | null
          seven_day_resets_at: string | null
          user_name: string
        }
        Insert: {
          account_email?: string | null
          cost_usd?: number | null
          five_hour_pct?: number | null
          five_hour_resets_at?: string | null
          id?: never
          input_tokens?: number | null
          inserted_at?: string
          machine?: string | null
          model?: string | null
          output_tokens?: number | null
          recorded_at: string
          session_id?: string | null
          seven_day_pct?: number | null
          seven_day_resets_at?: string | null
          user_name: string
        }
        Update: {
          account_email?: string | null
          cost_usd?: number | null
          five_hour_pct?: number | null
          five_hour_resets_at?: string | null
          id?: never
          input_tokens?: number | null
          inserted_at?: string
          machine?: string | null
          model?: string | null
          output_tokens?: number | null
          recorded_at?: string
          session_id?: string | null
          seven_day_pct?: number | null
          seven_day_resets_at?: string | null
          user_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      daily_usage: {
        Row: {
          account_email: string | null
          day: string | null
          peak_5h: number | null
          peak_7d: number | null
          session_count: number | null
          total_cost_usd: number | null
          user_name: string | null
        }
        Relationships: []
      }
      latest_per_user: {
        Row: {
          account_email: string | null
          cost_usd: number | null
          five_hour_pct: number | null
          five_hour_resets_at: string | null
          id: number | null
          input_tokens: number | null
          inserted_at: string | null
          machine: string | null
          model: string | null
          output_tokens: number | null
          recorded_at: string | null
          session_id: string | null
          seven_day_pct: number | null
          seven_day_resets_at: string | null
          user_name: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_room_name: { Args: { p_email: string }; Returns: string }
      get_room_window_summary: {
        Args: { p_email: string }
        Returns: {
          account_five_hour_pct: number
          account_seven_day_pct: number
          five_hour_resets_at: string
          seven_day_resets_at: string
          user_name: string
          window_cost_usd: number
        }[]
      }
      get_team_window_summary: {
        Args: never
        Returns: {
          account_five_hour_pct: number
          account_seven_day_pct: number
          five_hour_resets_at: string
          seven_day_resets_at: string
          user_name: string
          window_cost_usd: number
        }[]
      }
      list_rooms: {
        Args: never
        Returns: {
          claude_email: string
          five_hour_pct: number
          last_active: string
          member_count: number
          room_name: string
        }[]
      }
      session_cost_deltas: {
        Args: never
        Returns: {
          cost_delta: number
          recorded_at: string
          session_id: string
          user_name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
