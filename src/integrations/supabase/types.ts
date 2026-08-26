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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          email: string
          full_name: string
          note: string | null
          requested_at: string
          user_id: string
        }
        Insert: {
          email: string
          full_name: string
          note?: string | null
          requested_at?: string
          user_id: string
        }
        Update: {
          email?: string
          full_name?: string
          note?: string | null
          requested_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          airtable_id: string | null
          att_type: Database["public"]["Enums"]["attendance_type"]
          code: string
          correction_note: string | null
          created_at: string
          enrolment_id: string
          id: string
          package_id: string | null
          seq: number
          session_id: string
          source_attendance_id: string | null
          status: Database["public"]["Enums"]["attendance_status"]
        }
        Insert: {
          airtable_id?: string | null
          att_type?: Database["public"]["Enums"]["attendance_type"]
          code?: string
          correction_note?: string | null
          created_at?: string
          enrolment_id: string
          id?: string
          package_id?: string | null
          seq?: number
          session_id: string
          source_attendance_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Update: {
          airtable_id?: string | null
          att_type?: Database["public"]["Enums"]["attendance_type"]
          code?: string
          correction_note?: string | null
          created_at?: string
          enrolment_id?: string
          id?: string
          package_id?: string | null
          seq?: number
          session_id?: string
          source_attendance_id?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_pay"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_source_attendance_id_fkey"
            columns: ["source_attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_source_attendance_id_fkey"
            columns: ["source_attendance_id"]
            isOneToOne: false
            referencedRelation: "v_attendance"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          adjustment: number
          airtable_id: string | null
          attendance_id: string | null
          code: string
          created_at: string
          id: string
          invoice_date: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          package_id: string | null
          paid_date: string | null
          payer_id: string | null
          payment_ref: string | null
          route: Database["public"]["Enums"]["charge_route"]
          seq: number
          source: Database["public"]["Enums"]["charge_source"]
          standard_amount: number
          status: Database["public"]["Enums"]["charge_status"]
          student_id: string
          xero_invoice_no: string | null
        }
        Insert: {
          adjustment?: number
          airtable_id?: string | null
          attendance_id?: string | null
          code?: string
          created_at?: string
          id?: string
          invoice_date?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          package_id?: string | null
          paid_date?: string | null
          payer_id?: string | null
          payment_ref?: string | null
          route?: Database["public"]["Enums"]["charge_route"]
          seq?: number
          source: Database["public"]["Enums"]["charge_source"]
          standard_amount?: number
          status?: Database["public"]["Enums"]["charge_status"]
          student_id: string
          xero_invoice_no?: string | null
        }
        Update: {
          adjustment?: number
          airtable_id?: string | null
          attendance_id?: string | null
          code?: string
          created_at?: string
          id?: string
          invoice_date?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          package_id?: string | null
          paid_date?: string | null
          payer_id?: string | null
          payment_ref?: string | null
          route?: Database["public"]["Enums"]["charge_route"]
          seq?: number
          source?: Database["public"]["Enums"]["charge_source"]
          standard_amount?: number
          status?: Database["public"]["Enums"]["charge_status"]
          student_id?: string
          xero_invoice_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charges_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "v_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_offerings: {
        Row: {
          airtable_id: string | null
          capacity: number
          code: string
          created_at: string
          ends_on: string
          id: string
          notes: string | null
          offering_type: Database["public"]["Enums"]["offering_type"]
          operating_period_id: string
          price_override: number | null
          primary_tutor_id: string | null
          program_id: string
          recurrence: Database["public"]["Enums"]["recurrence_pattern"]
          recurrence_start: string | null
          room: string | null
          seq: number
          session_duration_hours: number
          starts_on: string
          status: Database["public"]["Enums"]["offering_status"]
        }
        Insert: {
          airtable_id?: string | null
          capacity?: number
          code?: string
          created_at?: string
          ends_on: string
          id?: string
          notes?: string | null
          offering_type?: Database["public"]["Enums"]["offering_type"]
          operating_period_id: string
          price_override?: number | null
          primary_tutor_id?: string | null
          program_id: string
          recurrence?: Database["public"]["Enums"]["recurrence_pattern"]
          recurrence_start?: string | null
          room?: string | null
          seq?: number
          session_duration_hours?: number
          starts_on: string
          status?: Database["public"]["Enums"]["offering_status"]
        }
        Update: {
          airtable_id?: string | null
          capacity?: number
          code?: string
          created_at?: string
          ends_on?: string
          id?: string
          notes?: string | null
          offering_type?: Database["public"]["Enums"]["offering_type"]
          operating_period_id?: string
          price_override?: number | null
          primary_tutor_id?: string | null
          program_id?: string
          recurrence?: Database["public"]["Enums"]["recurrence_pattern"]
          recurrence_start?: string | null
          room?: string | null
          seq?: number
          session_duration_hours?: number
          starts_on?: string
          status?: Database["public"]["Enums"]["offering_status"]
        }
        Relationships: [
          {
            foreignKeyName: "class_offerings_operating_period_id_fkey"
            columns: ["operating_period_id"]
            isOneToOne: false
            referencedRelation: "operating_periods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_offerings_primary_tutor_id_fkey"
            columns: ["primary_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_offerings_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      enrolments: {
        Row: {
          adjustment: Database["public"]["Enums"]["adjustment_type"]
          adjustment_value: number
          airtable_id: string | null
          base_price: number | null
          class_offering_id: string
          closure: Database["public"]["Enums"]["closure_reason"] | null
          code: string
          created_at: string
          default_package_id: string | null
          ends_on: string | null
          hours_override: number | null
          id: string
          method: Database["public"]["Enums"]["billing_method"] | null
          notes: string | null
          seq: number
          standard_price_id: string | null
          starts_on: string
          status: Database["public"]["Enums"]["enrolment_status"]
          student_id: string
        }
        Insert: {
          adjustment?: Database["public"]["Enums"]["adjustment_type"]
          adjustment_value?: number
          airtable_id?: string | null
          base_price?: number | null
          class_offering_id: string
          closure?: Database["public"]["Enums"]["closure_reason"] | null
          code?: string
          created_at?: string
          default_package_id?: string | null
          ends_on?: string | null
          hours_override?: number | null
          id?: string
          method?: Database["public"]["Enums"]["billing_method"] | null
          notes?: string | null
          seq?: number
          standard_price_id?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["enrolment_status"]
          student_id: string
        }
        Update: {
          adjustment?: Database["public"]["Enums"]["adjustment_type"]
          adjustment_value?: number
          airtable_id?: string | null
          base_price?: number | null
          class_offering_id?: string
          closure?: Database["public"]["Enums"]["closure_reason"] | null
          code?: string
          created_at?: string
          default_package_id?: string | null
          ends_on?: string | null
          hours_override?: number | null
          id?: string
          method?: Database["public"]["Enums"]["billing_method"] | null
          notes?: string | null
          seq?: number
          standard_price_id?: string | null
          starts_on?: string
          status?: Database["public"]["Enums"]["enrolment_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_default_package_fkey"
            columns: ["default_package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_default_package_fkey"
            columns: ["default_package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_standard_price_id_fkey"
            columns: ["standard_price_id"]
            isOneToOne: false
            referencedRelation: "standard_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          airtable_id: string | null
          code: string
          created_at: string
          email: string | null
          full_name: string
          id: string
          mobile: string | null
          notes: string | null
          seq: number
          status: Database["public"]["Enums"]["person_status"]
        }
        Insert: {
          airtable_id?: string | null
          code?: string
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          mobile?: string | null
          notes?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["person_status"]
        }
        Update: {
          airtable_id?: string | null
          code?: string
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          mobile?: string | null
          notes?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["person_status"]
        }
        Relationships: []
      }
      hours_packages: {
        Row: {
          admin_note: string | null
          airtable_id: string | null
          approved_on: string
          code: string
          courtesy_reason: string | null
          created_at: string
          hours_purchased: number
          id: string
          low_balance_threshold: number
          package_type: Database["public"]["Enums"]["package_type"]
          price: number
          seq: number
          standard_price_id: string | null
          status: Database["public"]["Enums"]["package_status"]
          student_id: string
        }
        Insert: {
          admin_note?: string | null
          airtable_id?: string | null
          approved_on?: string
          code?: string
          courtesy_reason?: string | null
          created_at?: string
          hours_purchased: number
          id?: string
          low_balance_threshold?: number
          package_type?: Database["public"]["Enums"]["package_type"]
          price?: number
          seq?: number
          standard_price_id?: string | null
          status?: Database["public"]["Enums"]["package_status"]
          student_id: string
        }
        Update: {
          admin_note?: string | null
          airtable_id?: string | null
          approved_on?: string
          code?: string
          courtesy_reason?: string | null
          created_at?: string
          hours_purchased?: number
          id?: string
          low_balance_threshold?: number
          package_type?: Database["public"]["Enums"]["package_type"]
          price?: number
          seq?: number
          standard_price_id?: string | null
          status?: Database["public"]["Enums"]["package_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hours_packages_standard_price_id_fkey"
            columns: ["standard_price_id"]
            isOneToOne: false
            referencedRelation: "standard_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_packages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contacts: {
        Row: {
          channel: Database["public"]["Enums"]["contact_channel"]
          contacted_at: string
          contacted_by: string | null
          created_at: string
          id: string
          lead_id: string
          next_action_on: string | null
          summary: string
        }
        Insert: {
          channel: Database["public"]["Enums"]["contact_channel"]
          contacted_at?: string
          contacted_by?: string | null
          created_at?: string
          id?: string
          lead_id: string
          next_action_on?: string | null
          summary: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["contact_channel"]
          contacted_at?: string
          contacted_by?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          next_action_on?: string | null
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contacts_contacted_by_fkey"
            columns: ["contacted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contacts_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          airtable_id: string | null
          assigned_to: string | null
          code: string | null
          converted_at: string | null
          converted_enrolment_id: string | null
          converted_student_id: string | null
          created_at: string
          guardian_email: string | null
          guardian_mobile: string | null
          guardian_name: string
          id: string
          lost_reason: string | null
          next_action_on: string | null
          notes: string | null
          program_interest_id: string | null
          seq: number
          source: Database["public"]["Enums"]["lead_source"]
          source_detail: string | null
          status: Database["public"]["Enums"]["lead_status"]
          student_name: string
          subject_interest: string | null
          updated_at: string
          year_level: string | null
        }
        Insert: {
          airtable_id?: string | null
          assigned_to?: string | null
          code?: string | null
          converted_at?: string | null
          converted_enrolment_id?: string | null
          converted_student_id?: string | null
          created_at?: string
          guardian_email?: string | null
          guardian_mobile?: string | null
          guardian_name: string
          id?: string
          lost_reason?: string | null
          next_action_on?: string | null
          notes?: string | null
          program_interest_id?: string | null
          seq?: number
          source?: Database["public"]["Enums"]["lead_source"]
          source_detail?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          student_name: string
          subject_interest?: string | null
          updated_at?: string
          year_level?: string | null
        }
        Update: {
          airtable_id?: string | null
          assigned_to?: string | null
          code?: string | null
          converted_at?: string | null
          converted_enrolment_id?: string | null
          converted_student_id?: string | null
          created_at?: string
          guardian_email?: string | null
          guardian_mobile?: string | null
          guardian_name?: string
          id?: string
          lost_reason?: string | null
          next_action_on?: string | null
          notes?: string | null
          program_interest_id?: string | null
          seq?: number
          source?: Database["public"]["Enums"]["lead_source"]
          source_detail?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          student_name?: string
          subject_interest?: string | null
          updated_at?: string
          year_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_converted_enrolment_id_fkey"
            columns: ["converted_enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_enrolment_id_fkey"
            columns: ["converted_enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_program_interest_id_fkey"
            columns: ["program_interest_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      operating_periods: {
        Row: {
          airtable_id: string | null
          code: string
          created_at: string
          ends_on: string
          id: string
          name: string
          period_type: Database["public"]["Enums"]["period_type"]
          starts_on: string
          status: Database["public"]["Enums"]["period_status"]
        }
        Insert: {
          airtable_id?: string | null
          code: string
          created_at?: string
          ends_on: string
          id?: string
          name: string
          period_type?: Database["public"]["Enums"]["period_type"]
          starts_on: string
          status?: Database["public"]["Enums"]["period_status"]
        }
        Update: {
          airtable_id?: string | null
          code?: string
          created_at?: string
          ends_on?: string
          id?: string
          name?: string
          period_type?: Database["public"]["Enums"]["period_type"]
          starts_on?: string
          status?: Database["public"]["Enums"]["period_status"]
        }
        Relationships: []
      }
      package_eligibility: {
        Row: {
          enrolment_id: string
          package_id: string
        }
        Insert: {
          enrolment_id: string
          package_id: string
        }
        Update: {
          enrolment_id?: string
          package_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "package_eligibility_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_eligibility_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_eligibility_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "package_eligibility_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          airtable_id: string | null
          code: string
          created_at: string
          default_offering_type:
            | Database["public"]["Enums"]["offering_type"]
            | null
          default_price_id: string | null
          exam_focus: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          standard_duration_hours: number
          subject: string | null
          year_level: string | null
        }
        Insert: {
          airtable_id?: string | null
          code: string
          created_at?: string
          default_offering_type?:
            | Database["public"]["Enums"]["offering_type"]
            | null
          default_price_id?: string | null
          exam_focus?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          standard_duration_hours?: number
          subject?: string | null
          year_level?: string | null
        }
        Update: {
          airtable_id?: string | null
          code?: string
          created_at?: string
          default_offering_type?:
            | Database["public"]["Enums"]["offering_type"]
            | null
          default_price_id?: string | null
          exam_focus?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          standard_duration_hours?: number
          subject?: string | null
          year_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "programs_default_price_id_fkey"
            columns: ["default_price_id"]
            isOneToOne: false
            referencedRelation: "standard_prices"
            referencedColumns: ["id"]
          },
        ]
      }
      proto_packages: {
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
      proto_session_students: {
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
            referencedRelation: "proto_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "proto_students"
            referencedColumns: ["id"]
          },
        ]
      }
      proto_sessions: {
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
            referencedRelation: "proto_tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      proto_student_packages: {
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
            referencedRelation: "proto_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_packages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "proto_students"
            referencedColumns: ["id"]
          },
        ]
      }
      proto_students: {
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
      proto_tutors: {
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
      session_pay_adjustments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          note: string
          session_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          session_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_pay_adjustments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_pay_adjustments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_pay"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "session_pay_adjustments_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          airtable_id: string | null
          class_offering_id: string
          code: string
          created_at: string
          ends_at: string
          id: string
          notes: string | null
          original_ends_at: string | null
          original_starts_at: string | null
          replaces_session_id: string | null
          room: string | null
          seq: number
          session_type: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status: Database["public"]["Enums"]["session_status"]
          tutor_id: string | null
          updated_at: string
        }
        Insert: {
          airtable_id?: string | null
          class_offering_id: string
          code?: string
          created_at?: string
          ends_at: string
          id?: string
          notes?: string | null
          original_ends_at?: string | null
          original_starts_at?: string | null
          replaces_session_id?: string | null
          room?: string | null
          seq?: number
          session_type?: Database["public"]["Enums"]["session_type"]
          starts_at: string
          status?: Database["public"]["Enums"]["session_status"]
          tutor_id?: string | null
          updated_at?: string
        }
        Update: {
          airtable_id?: string | null
          class_offering_id?: string
          code?: string
          created_at?: string
          ends_at?: string
          id?: string
          notes?: string | null
          original_ends_at?: string | null
          original_starts_at?: string | null
          replaces_session_id?: string | null
          room?: string | null
          seq?: number
          session_type?: Database["public"]["Enums"]["session_type"]
          starts_at?: string
          status?: Database["public"]["Enums"]["session_status"]
          tutor_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_replaces_session_id_fkey"
            columns: ["replaces_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_replaces_session_id_fkey"
            columns: ["replaces_session_id"]
            isOneToOne: false
            referencedRelation: "v_session_pay"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "sessions_replaces_session_id_fkey"
            columns: ["replaces_session_id"]
            isOneToOne: false
            referencedRelation: "v_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tutor_id_fkey1"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          created_at: string
          email: string
          full_name: string
          is_active: boolean
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          is_active?: boolean
          role?: Database["public"]["Enums"]["staff_role"]
          user_id?: string
        }
        Relationships: []
      }
      standard_prices: {
        Row: {
          airtable_id: string | null
          basis: Database["public"]["Enums"]["pricing_basis"]
          code: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          name: string
          notes: string | null
          quantity: number
          scope: string | null
          status: Database["public"]["Enums"]["price_status"]
          unit_rate: number
          year_group: string | null
        }
        Insert: {
          airtable_id?: string | null
          basis: Database["public"]["Enums"]["pricing_basis"]
          code: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          name: string
          notes?: string | null
          quantity?: number
          scope?: string | null
          status?: Database["public"]["Enums"]["price_status"]
          unit_rate?: number
          year_group?: string | null
        }
        Update: {
          airtable_id?: string | null
          basis?: Database["public"]["Enums"]["pricing_basis"]
          code?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
          scope?: string | null
          status?: Database["public"]["Enums"]["price_status"]
          unit_rate?: number
          year_group?: string | null
        }
        Relationships: []
      }
      student_guardians: {
        Row: {
          guardian_id: string
          relationship: string | null
          student_id: string
        }
        Insert: {
          guardian_id: string
          relationship?: string | null
          student_id: string
        }
        Update: {
          guardian_id?: string
          relationship?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          airtable_id: string | null
          code: string
          created_at: string
          current_school: string | null
          date_of_birth: string | null
          default_payer_id: string | null
          full_name: string
          how_they_found_us: string | null
          id: string
          joined_on: string | null
          notes: string | null
          seq: number
          status: Database["public"]["Enums"]["person_status"]
          year_level: string | null
        }
        Insert: {
          airtable_id?: string | null
          code?: string
          created_at?: string
          current_school?: string | null
          date_of_birth?: string | null
          default_payer_id?: string | null
          full_name: string
          how_they_found_us?: string | null
          id?: string
          joined_on?: string | null
          notes?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["person_status"]
          year_level?: string | null
        }
        Update: {
          airtable_id?: string | null
          code?: string
          created_at?: string
          current_school?: string | null
          date_of_birth?: string | null
          default_payer_id?: string | null
          full_name?: string
          how_they_found_us?: string | null
          id?: string
          joined_on?: string | null
          notes?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["person_status"]
          year_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_default_payer_id_fkey"
            columns: ["default_payer_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
        ]
      }
      trials: {
        Row: {
          airtable_id: string | null
          class_offering_id: string | null
          code: string | null
          conducted_by: string | null
          created_at: string
          enrolment_id: string | null
          id: string
          kind: Database["public"]["Enums"]["trial_kind"]
          lead_id: string
          outcome_notes: string | null
          recommendation:
            | Database["public"]["Enums"]["diagnostic_recommendation"]
            | null
          recommended_program_id: string | null
          scheduled_for: string | null
          score: string | null
          seq: number
          session_id: string | null
          status: Database["public"]["Enums"]["trial_status"]
          updated_at: string
        }
        Insert: {
          airtable_id?: string | null
          class_offering_id?: string | null
          code?: string | null
          conducted_by?: string | null
          created_at?: string
          enrolment_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["trial_kind"]
          lead_id: string
          outcome_notes?: string | null
          recommendation?:
            | Database["public"]["Enums"]["diagnostic_recommendation"]
            | null
          recommended_program_id?: string | null
          scheduled_for?: string | null
          score?: string | null
          seq?: number
          session_id?: string | null
          status?: Database["public"]["Enums"]["trial_status"]
          updated_at?: string
        }
        Update: {
          airtable_id?: string | null
          class_offering_id?: string | null
          code?: string | null
          conducted_by?: string | null
          created_at?: string
          enrolment_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["trial_kind"]
          lead_id?: string
          outcome_notes?: string | null
          recommendation?:
            | Database["public"]["Enums"]["diagnostic_recommendation"]
            | null
          recommended_program_id?: string | null
          scheduled_for?: string | null
          score?: string | null
          seq?: number
          session_id?: string | null
          status?: Database["public"]["Enums"]["trial_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trials_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_conducted_by_fkey"
            columns: ["conducted_by"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "v_leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_recommended_program_id_fkey"
            columns: ["recommended_program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_pay"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "trials_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_pay_rates: {
        Row: {
          created_at: string
          effective_from: string
          hourly_rate: number
          id: string
          note: string | null
          tutor_id: string
        }
        Insert: {
          created_at?: string
          effective_from: string
          hourly_rate: number
          id?: string
          note?: string | null
          tutor_id: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          hourly_rate?: number
          id?: string
          note?: string | null
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_pay_rates_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutor_payouts: {
        Row: {
          adjustment_reason: string | null
          amount_adjustment: number
          code: string
          created_at: string
          fortnight_start: string
          hours_adjustment: number
          hours_worked: number
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          paid_date: string | null
          payment_ref: string | null
          rate_at_payout: number
          seq: number
          status: Database["public"]["Enums"]["payout_status"]
          tutor_id: string
        }
        Insert: {
          adjustment_reason?: string | null
          amount_adjustment?: number
          code?: string
          created_at?: string
          fortnight_start: string
          hours_adjustment?: number
          hours_worked?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          paid_date?: string | null
          payment_ref?: string | null
          rate_at_payout?: number
          seq?: number
          status?: Database["public"]["Enums"]["payout_status"]
          tutor_id: string
        }
        Update: {
          adjustment_reason?: string | null
          amount_adjustment?: number
          code?: string
          created_at?: string
          fortnight_start?: string
          hours_adjustment?: number
          hours_worked?: number
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          paid_date?: string | null
          payment_ref?: string | null
          rate_at_payout?: number
          seq?: number
          status?: Database["public"]["Enums"]["payout_status"]
          tutor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutor_payouts_tutor_id_fkey"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      tutors: {
        Row: {
          airtable_id: string | null
          code: string
          colour: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          mobile: string | null
          notes: string | null
          seq: number
          status: Database["public"]["Enums"]["person_status"]
        }
        Insert: {
          airtable_id?: string | null
          code?: string
          colour?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          mobile?: string | null
          notes?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["person_status"]
        }
        Update: {
          airtable_id?: string | null
          code?: string
          colour?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          mobile?: string | null
          notes?: string | null
          seq?: number
          status?: Database["public"]["Enums"]["person_status"]
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
      v_attendance: {
        Row: {
          att_type: Database["public"]["Enums"]["attendance_type"] | null
          billing_method: Database["public"]["Enums"]["billing_method"] | null
          class_offering_id: string | null
          code: string | null
          correction_note: string | null
          created_at: string | null
          effective_status: string | null
          enrolment_id: string | null
          hours_consumed: number | null
          id: string | null
          lesson_starts_at: string | null
          lesson_tutor_id: string | null
          make_up_state: string | null
          package_id: string | null
          session_date: string | null
          session_id: string | null
          source_attendance_id: string | null
          status: Database["public"]["Enums"]["attendance_status"] | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_enrolment_id_fkey"
            columns: ["enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_session_pay"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "v_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_source_attendance_id_fkey"
            columns: ["source_attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_source_attendance_id_fkey"
            columns: ["source_attendance_id"]
            isOneToOne: false
            referencedRelation: "v_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tutor_id_fkey1"
            columns: ["lesson_tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_charges: {
        Row: {
          adjustment: number | null
          attendance_id: string | null
          code: string | null
          created_at: string | null
          final_amount: number | null
          id: string | null
          invoice_date: string | null
          method: Database["public"]["Enums"]["payment_method"] | null
          notes: string | null
          package_id: string | null
          paid_date: string | null
          payer_id: string | null
          payment_ref: string | null
          route: Database["public"]["Enums"]["charge_route"] | null
          source: Database["public"]["Enums"]["charge_source"] | null
          standard_amount: number | null
          status: Database["public"]["Enums"]["charge_status"] | null
          student_id: string | null
          xero_invoice_no: string | null
        }
        Insert: {
          adjustment?: number | null
          attendance_id?: string | null
          code?: string | null
          created_at?: string | null
          final_amount?: never
          id?: string | null
          invoice_date?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          package_id?: string | null
          paid_date?: string | null
          payer_id?: string | null
          payment_ref?: string | null
          route?: Database["public"]["Enums"]["charge_route"] | null
          source?: Database["public"]["Enums"]["charge_source"] | null
          standard_amount?: number | null
          status?: Database["public"]["Enums"]["charge_status"] | null
          student_id?: string | null
          xero_invoice_no?: string | null
        }
        Update: {
          adjustment?: number | null
          attendance_id?: string | null
          code?: string | null
          created_at?: string | null
          final_amount?: never
          id?: string | null
          invoice_date?: string | null
          method?: Database["public"]["Enums"]["payment_method"] | null
          notes?: string | null
          package_id?: string | null
          paid_date?: string | null
          payer_id?: string | null
          payment_ref?: string | null
          route?: Database["public"]["Enums"]["charge_route"] | null
          source?: Database["public"]["Enums"]["charge_source"] | null
          standard_amount?: number | null
          status?: Database["public"]["Enums"]["charge_status"] | null
          student_id?: string | null
          xero_invoice_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "charges_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "v_attendance"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_payer_id_fkey"
            columns: ["payer_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_enrolments: {
        Row: {
          adjustment: Database["public"]["Enums"]["adjustment_type"] | null
          adjustment_value: number | null
          base_price: number | null
          class_offering_id: string | null
          closure: Database["public"]["Enums"]["closure_reason"] | null
          code: string | null
          created_at: string | null
          default_package_id: string | null
          ends_on: string | null
          final_agreed_price: number | null
          hours_override: number | null
          id: string | null
          method: Database["public"]["Enums"]["billing_method"] | null
          notes: string | null
          standard_price_id: string | null
          starts_on: string | null
          status: Database["public"]["Enums"]["enrolment_status"] | null
          student_id: string | null
        }
        Insert: {
          adjustment?: Database["public"]["Enums"]["adjustment_type"] | null
          adjustment_value?: number | null
          base_price?: number | null
          class_offering_id?: string | null
          closure?: Database["public"]["Enums"]["closure_reason"] | null
          code?: string | null
          created_at?: string | null
          default_package_id?: string | null
          ends_on?: string | null
          final_agreed_price?: never
          hours_override?: number | null
          id?: string | null
          method?: Database["public"]["Enums"]["billing_method"] | null
          notes?: string | null
          standard_price_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["enrolment_status"] | null
          student_id?: string | null
        }
        Update: {
          adjustment?: Database["public"]["Enums"]["adjustment_type"] | null
          adjustment_value?: number | null
          base_price?: number | null
          class_offering_id?: string | null
          closure?: Database["public"]["Enums"]["closure_reason"] | null
          code?: string | null
          created_at?: string | null
          default_package_id?: string | null
          ends_on?: string | null
          final_agreed_price?: never
          hours_override?: number | null
          id?: string | null
          method?: Database["public"]["Enums"]["billing_method"] | null
          notes?: string | null
          standard_price_id?: string | null
          starts_on?: string | null
          status?: Database["public"]["Enums"]["enrolment_status"] | null
          student_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrolments_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_default_package_fkey"
            columns: ["default_package_id"]
            isOneToOne: false
            referencedRelation: "hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_default_package_fkey"
            columns: ["default_package_id"]
            isOneToOne: false
            referencedRelation: "v_hours_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_standard_price_id_fkey"
            columns: ["standard_price_id"]
            isOneToOne: false
            referencedRelation: "standard_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrolments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_hours_packages: {
        Row: {
          admin_note: string | null
          approved_on: string | null
          code: string | null
          courtesy_reason: string | null
          created_at: string | null
          hours_purchased: number | null
          hours_remaining: number | null
          hours_used: number | null
          id: string | null
          is_low: boolean | null
          is_overdrawn: boolean | null
          low_balance_threshold: number | null
          package_type: Database["public"]["Enums"]["package_type"] | null
          price: number | null
          standard_price_id: string | null
          status: Database["public"]["Enums"]["package_status"] | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hours_packages_standard_price_id_fkey"
            columns: ["standard_price_id"]
            isOneToOne: false
            referencedRelation: "standard_prices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hours_packages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_leads: {
        Row: {
          airtable_id: string | null
          assigned_name: string | null
          assigned_to: string | null
          code: string | null
          contact_count: number | null
          converted_at: string | null
          converted_enrolment_id: string | null
          converted_student_id: string | null
          created_at: string | null
          days_in_pipeline: number | null
          days_since_contact: number | null
          guardian_email: string | null
          guardian_mobile: string | null
          guardian_name: string | null
          id: string | null
          is_overdue: boolean | null
          latest_contact_at: string | null
          lost_reason: string | null
          next_action_on: string | null
          notes: string | null
          program_interest_id: string | null
          program_interest_name: string | null
          seq: number | null
          source: Database["public"]["Enums"]["lead_source"] | null
          source_detail: string | null
          status: Database["public"]["Enums"]["lead_status"] | null
          student_name: string | null
          subject_interest: string | null
          trial_count: number | null
          updated_at: string | null
          year_level: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "leads_converted_enrolment_id_fkey"
            columns: ["converted_enrolment_id"]
            isOneToOne: false
            referencedRelation: "enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_enrolment_id_fkey"
            columns: ["converted_enrolment_id"]
            isOneToOne: false
            referencedRelation: "v_enrolments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_converted_student_id_fkey"
            columns: ["converted_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_program_interest_id_fkey"
            columns: ["program_interest_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      v_needs_attention: {
        Row: {
          code: string | null
          entity: string | null
          id: string | null
          issue: string | null
        }
        Relationships: []
      }
      v_session_pay: {
        Row: {
          adjustment: number | null
          base_pay: number | null
          class_offering_id: string | null
          code: string | null
          fortnight_start: string | null
          hourly_rate: number | null
          pay: number | null
          payable_hours: number | null
          session_date: string | null
          session_id: string | null
          tutor_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tutor_id_fkey1"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_sessions: {
        Row: {
          class_offering_id: string | null
          code: string | null
          created_at: string | null
          duration_hours: number | null
          ends_at: string | null
          fortnight_end: string | null
          fortnight_start: string | null
          id: string | null
          is_this_fortnight: boolean | null
          is_today: boolean | null
          notes: string | null
          payable_hours: number | null
          replaces_session_id: string | null
          room: string | null
          session_date: string | null
          session_type: Database["public"]["Enums"]["session_type"] | null
          starts_at: string | null
          status: Database["public"]["Enums"]["session_status"] | null
          tutor_id: string | null
        }
        Insert: {
          class_offering_id?: string | null
          code?: string | null
          created_at?: string | null
          duration_hours?: never
          ends_at?: string | null
          fortnight_end?: never
          fortnight_start?: never
          id?: string | null
          is_this_fortnight?: never
          is_today?: never
          notes?: string | null
          payable_hours?: never
          replaces_session_id?: string | null
          room?: string | null
          session_date?: never
          session_type?: Database["public"]["Enums"]["session_type"] | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          tutor_id?: string | null
        }
        Update: {
          class_offering_id?: string | null
          code?: string | null
          created_at?: string | null
          duration_hours?: never
          ends_at?: string | null
          fortnight_end?: never
          fortnight_start?: never
          id?: string | null
          is_this_fortnight?: never
          is_today?: never
          notes?: string | null
          payable_hours?: never
          replaces_session_id?: string | null
          room?: string | null
          session_date?: never
          session_type?: Database["public"]["Enums"]["session_type"] | null
          starts_at?: string | null
          status?: Database["public"]["Enums"]["session_status"] | null
          tutor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_class_offering_id_fkey"
            columns: ["class_offering_id"]
            isOneToOne: false
            referencedRelation: "class_offerings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_replaces_session_id_fkey"
            columns: ["replaces_session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_replaces_session_id_fkey"
            columns: ["replaces_session_id"]
            isOneToOne: false
            referencedRelation: "v_session_pay"
            referencedColumns: ["session_id"]
          },
          {
            foreignKeyName: "sessions_replaces_session_id_fkey"
            columns: ["replaces_session_id"]
            isOneToOne: false
            referencedRelation: "v_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_tutor_id_fkey1"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
      v_tutor_fortnight_pay: {
        Row: {
          adjustments: number | null
          fortnight_end: string | null
          fortnight_start: string | null
          hours: number | null
          lessons: number | null
          total_pay: number | null
          tutor_id: string | null
          tutor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_tutor_id_fkey1"
            columns: ["tutor_id"]
            isOneToOne: false
            referencedRelation: "tutors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      bootstrap_first_owner: {
        Args: { p_full_name: string }
        Returns: {
          created_at: string
          email: string
          full_name: string
          is_active: boolean
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "staff"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fortnight_start: { Args: { d: string }; Returns: string }
      generate_sessions: { Args: { p_offering_id: string }; Returns: number }
      increment_sessions_used: {
        Args: { _amount?: number; _student_package_id: string }
        Returns: undefined
      }
      is_owner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      seed_roll: { Args: { p_session_id: string }; Returns: number }
      seed_roll_for_offering: {
        Args: { p_offering_id: string }
        Returns: number
      }
      syd_date: { Args: { ts: string }; Returns: string }
    }
    Enums: {
      adjustment_type:
        | "none"
        | "percentage"
        | "fixed_amount"
        | "final_price_override"
      app_role: "admin" | "staff"
      attendance_status: "not_marked" | "present" | "absent"
      attendance_type: "regular" | "trial" | "make_up"
      billing_method: "hours" | "payg"
      charge_route: "parent" | "internal"
      charge_source: "hours" | "payg"
      charge_status: "to_invoice" | "invoiced" | "paid" | "cancelled"
      closure_reason: "completed" | "withdrawn" | "transferred" | "other"
      contact_channel:
        | "phone"
        | "sms"
        | "email"
        | "whatsapp"
        | "in_person"
        | "other"
      diagnostic_recommendation:
        | "ready_for_class"
        | "needs_foundation"
        | "accelerate"
        | "not_suitable"
        | "undecided"
      enrolment_status: "trial" | "active" | "closed"
      lead_source:
        | "referral"
        | "google"
        | "social_media"
        | "walk_in"
        | "event"
        | "website"
        | "other"
      lead_status:
        | "new"
        | "contacted"
        | "nurturing"
        | "trial_booked"
        | "converted"
        | "lost"
      offering_status: "planned" | "active" | "closed" | "cancelled"
      offering_type: "group_class" | "private_tuition"
      package_status: "draft" | "active" | "closed" | "expired"
      package_type: "purchased" | "courtesy"
      payment_method: "cash" | "bank_transfer" | "other"
      payout_status: "draft" | "approved" | "paid"
      period_status: "planned" | "active" | "closed"
      period_type: "standard_term" | "holiday_intensive" | "other"
      person_status: "active" | "inactive"
      price_status: "active" | "inactive"
      pricing_basis: "per_hour" | "per_session" | "fixed_hours_price"
      recurrence_pattern:
        | "weekly"
        | "fortnightly"
        | "daily"
        | "one_off"
        | "ad_hoc"
      session_status: "scheduled" | "completed" | "cancelled" | "rescheduled"
      session_type: "regular" | "dedicated_make_up"
      staff_role: "owner" | "admin"
      trial_kind: "class_trial" | "diagnostic_test"
      trial_status:
        | "proposed"
        | "scheduled"
        | "attended"
        | "no_show"
        | "converted"
        | "declined"
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
      adjustment_type: [
        "none",
        "percentage",
        "fixed_amount",
        "final_price_override",
      ],
      app_role: ["admin", "staff"],
      attendance_status: ["not_marked", "present", "absent"],
      attendance_type: ["regular", "trial", "make_up"],
      billing_method: ["hours", "payg"],
      charge_route: ["parent", "internal"],
      charge_source: ["hours", "payg"],
      charge_status: ["to_invoice", "invoiced", "paid", "cancelled"],
      closure_reason: ["completed", "withdrawn", "transferred", "other"],
      contact_channel: [
        "phone",
        "sms",
        "email",
        "whatsapp",
        "in_person",
        "other",
      ],
      diagnostic_recommendation: [
        "ready_for_class",
        "needs_foundation",
        "accelerate",
        "not_suitable",
        "undecided",
      ],
      enrolment_status: ["trial", "active", "closed"],
      lead_source: [
        "referral",
        "google",
        "social_media",
        "walk_in",
        "event",
        "website",
        "other",
      ],
      lead_status: [
        "new",
        "contacted",
        "nurturing",
        "trial_booked",
        "converted",
        "lost",
      ],
      offering_status: ["planned", "active", "closed", "cancelled"],
      offering_type: ["group_class", "private_tuition"],
      package_status: ["draft", "active", "closed", "expired"],
      package_type: ["purchased", "courtesy"],
      payment_method: ["cash", "bank_transfer", "other"],
      payout_status: ["draft", "approved", "paid"],
      period_status: ["planned", "active", "closed"],
      period_type: ["standard_term", "holiday_intensive", "other"],
      person_status: ["active", "inactive"],
      price_status: ["active", "inactive"],
      pricing_basis: ["per_hour", "per_session", "fixed_hours_price"],
      recurrence_pattern: [
        "weekly",
        "fortnightly",
        "daily",
        "one_off",
        "ad_hoc",
      ],
      session_status: ["scheduled", "completed", "cancelled", "rescheduled"],
      session_type: ["regular", "dedicated_make_up"],
      staff_role: ["owner", "admin"],
      trial_kind: ["class_trial", "diagnostic_test"],
      trial_status: [
        "proposed",
        "scheduled",
        "attended",
        "no_show",
        "converted",
        "declined",
      ],
    },
  },
} as const
