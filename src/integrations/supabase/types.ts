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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      feedback_attempts: {
        Row: {
          attempts: number
          key: string
          locked_until: string | null
          updated_at: string
        }
        Insert: {
          attempts?: number
          key: string
          locked_until?: string | null
          updated_at?: string
        }
        Update: {
          attempts?: number
          key?: string
          locked_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      feedback_customers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          pin: string | null
          pin_hash: string | null
          pin_version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          pin?: string | null
          pin_hash?: string | null
          pin_version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          pin?: string | null
          pin_hash?: string | null
          pin_version?: number
        }
        Relationships: []
      }
      feedback_history: {
        Row: {
          action: string
          actor: string
          created_at: string
          customer_id: string | null
          field: string
          id: string
          item_id: string | null
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          customer_id?: string | null
          field?: string
          id?: string
          item_id?: string | null
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          customer_id?: string | null
          field?: string
          id?: string
          item_id?: string | null
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_history_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "feedback_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_history_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "feedback_items"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_imports: {
        Row: {
          actor: string
          created_at: string
          digest: string
          file_name: string
          id: string
          row_count: number
        }
        Insert: {
          actor: string
          created_at?: string
          digest: string
          file_name: string
          id?: string
          row_count: number
        }
        Update: {
          actor?: string
          created_at?: string
          digest?: string
          file_name?: string
          id?: string
          row_count?: number
        }
        Relationships: []
      }
      feedback_items: {
        Row: {
          activity: string
          actor: string
          category: string
          completion_date: string | null
          customer_id: string
          deleted_at: string | null
          detail: string
          estimated_date: string | null
          feature: string
          feedback: string
          id: string
          image: string | null
          needs_review: boolean
          notes: string
          number: number
          report_date: string | null
          status: string
          type: string
          updated_at: string
          version: number
        }
        Insert: {
          activity: string
          actor?: string
          category: string
          completion_date?: string | null
          customer_id: string
          deleted_at?: string | null
          detail?: string
          estimated_date?: string | null
          feature?: string
          feedback: string
          id?: string
          image?: string | null
          needs_review?: boolean
          notes?: string
          number: number
          report_date?: string | null
          status: string
          type: string
          updated_at?: string
          version?: number
        }
        Update: {
          activity?: string
          actor?: string
          category?: string
          completion_date?: string | null
          customer_id?: string
          deleted_at?: string | null
          detail?: string
          estimated_date?: string | null
          feature?: string
          feedback?: string
          id?: string
          image?: string | null
          needs_review?: boolean
          notes?: string
          number?: number
          report_date?: string | null
          status?: string
          type?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "feedback_customers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      feedback_record_failure: {
        Args: { attempt_keys: string[] }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
