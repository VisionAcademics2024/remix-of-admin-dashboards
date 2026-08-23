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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      packages: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price: number | null
          status: string
          total_sessions: number
          updated_at: string
          validity_days: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number | null
          status?: string
          total_sessions: number
          updated_at?: string
          validity_days?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number | null
          status?: string
          total_sessions?: number
          updated_at?: string
          validity_days?: number | null
        }
        Relationships: []
      }
      session_students: {
        Row: {
          attendance_status: string
          created_at: string
          id: string
          notes: string | null
          session_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          attendance_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          session_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          attendance_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          session_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_students_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          created_at: string
          end_time: string
          id: string
          location: string | null
          notes: string | null
          start_time: string
          status: string
          subject: string | null
          title: string
          tutor_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          location?: string | null
          notes?: string | null
          start_time: string
          status?: string
          subject?: string | null
          title: string
          tutor_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          location?: string | null
          notes?: string | null
          start_time?: string
          status?: string
          subject?: string | null
          title?: string
          tutor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      student_packages: {
        Row: {
          created_at: string
          expiry_date: string | null
          id: string
          notes: string | null
          package_id: string
          purchase_date: string
          sessions_used: number
          status: string
          student_id: string
          total_sessions: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          package_id: string
          purchase_date?: string
          sessions_used?: number
          status?: string
          student_id: string
          total_sessions: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          id?: string
          notes?: string | null
          package_id?: string
          purchase_date?: string
          sessions_used?: number
          status?: string
          student_id?: string
          total_sessions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_packages_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_packages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          created_at: string
          date_of_birth: string | null
          email: string | null
          first_name: string
          grade: string | null
          id: string
          last_name: string
          notes: string | null
          parent_email: string | null
          parent_name: string | null
          parent_phone: string | null
          phone: string | null
          school: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name: string
          grade?: string | null
          id?: string
          last_name: string
          notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          school?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          first_name?: string
          grade?: string | null
          id?: string
          last_name?: string
          notes?: string | null
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string | null
          phone?: string | null
          school?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      tutors: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          status: string
          subjects: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          status?: string
          subjects?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          subjects?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      increment_sessions_used: {
        Args: { _amount?: number; _student_package_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "staff"
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
    Enums: {
      app_role: ["admin", "staff"],
    },
  },
} as const
