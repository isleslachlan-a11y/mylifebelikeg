export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15";
  };
  public: {
    Tables: {
      achievements: {
        Row: {
          code: string;
          created_at: string;
          description: string;
          flair_asset: string | null;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          trigger_config: Json;
          trigger_type: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          description: string;
          flair_asset?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          trigger_config?: Json;
          trigger_type: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string;
          flair_asset?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          trigger_config?: Json;
          trigger_type?: string;
        };
        Relationships: [];
      };
      avatar_presets: {
        Row: {
          asset_ref: string;
          category: string;
          code: string;
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          sort_order: number;
          unlock_achievement_id: string | null;
        };
        Insert: {
          asset_ref: string;
          category: string;
          code: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          sort_order?: number;
          unlock_achievement_id?: string | null;
        };
        Update: {
          asset_ref?: string;
          category?: string;
          code?: string;
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          sort_order?: number;
          unlock_achievement_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "avatar_presets_unlock_achievement_id_fkey";
            columns: ["unlock_achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
        ];
      };
      cashflow_items: {
        Row: {
          active_from: string;
          active_to: string | null;
          amount_minor: number;
          created_at: string;
          currency: string;
          deleted_at: string | null;
          frequency: Database["public"]["Enums"]["cadence"];
          id: string;
          kind: Database["public"]["Enums"]["cashflow_kind"];
          label: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_from?: string;
          active_to?: string | null;
          amount_minor: number;
          created_at?: string;
          currency: string;
          deleted_at?: string | null;
          frequency?: Database["public"]["Enums"]["cadence"];
          id?: string;
          kind: Database["public"]["Enums"]["cashflow_kind"];
          label: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_from?: string;
          active_to?: string | null;
          amount_minor?: number;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          frequency?: Database["public"]["Enums"]["cadence"];
          id?: string;
          kind?: Database["public"]["Enums"]["cashflow_kind"];
          label?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      check_ins: {
        Row: {
          capacity_rating: number | null;
          created_at: string;
          id: string;
          note: string | null;
          period_end: string;
          period_start: string;
          submitted_at: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          capacity_rating?: number | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          period_end: string;
          period_start: string;
          submitted_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          capacity_rating?: number | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          period_end?: string;
          period_start?: string;
          submitted_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "check_ins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "check_ins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "check_ins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "check_ins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "check_ins_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      fx_rates: {
        Row: {
          as_of: string;
          base_currency: string;
          created_at: string;
          id: string;
          quote_currency: string;
          rate: number;
          source: string;
        };
        Insert: {
          as_of: string;
          base_currency: string;
          created_at?: string;
          id?: string;
          quote_currency: string;
          rate: number;
          source?: string;
        };
        Update: {
          as_of?: string;
          base_currency?: string;
          created_at?: string;
          id?: string;
          quote_currency?: string;
          rate?: number;
          source?: string;
        };
        Relationships: [];
      };
      goal_participants: {
        Row: {
          goal_id: string;
          id: string;
          invited_by: string | null;
          joined_at: string;
          monthly_allocation_minor: number | null;
          pledged_amount_minor: number | null;
          pledged_currency: string | null;
          pot_id: string | null;
          removed_at: string | null;
          role: Database["public"]["Enums"]["participant_role"];
          user_id: string;
        };
        Insert: {
          goal_id: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          monthly_allocation_minor?: number | null;
          pledged_amount_minor?: number | null;
          pledged_currency?: string | null;
          pot_id?: string | null;
          removed_at?: string | null;
          role?: Database["public"]["Enums"]["participant_role"];
          user_id: string;
        };
        Update: {
          goal_id?: string;
          id?: string;
          invited_by?: string | null;
          joined_at?: string;
          monthly_allocation_minor?: number | null;
          pledged_amount_minor?: number | null;
          pledged_currency?: string | null;
          pot_id?: string | null;
          removed_at?: string | null;
          role?: Database["public"]["Enums"]["participant_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_participants_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_participants_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "goal_participants_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "goal_participants_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_participants_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_invited_by_fkey";
            columns: ["invited_by"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_pot_fk";
            columns: ["pot_id"];
            isOneToOne: false;
            referencedRelation: "pots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_participants_pot_fk";
            columns: ["pot_id"];
            isOneToOne: false;
            referencedRelation: "v_pot_balances";
            referencedColumns: ["pot_id"];
          },
          {
            foreignKeyName: "goal_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      goal_ratings: {
        Row: {
          check_in_id: string;
          created_at: string;
          goal_id: string;
          id: string;
          note: string | null;
          score: number;
          user_id: string;
        };
        Insert: {
          check_in_id: string;
          created_at?: string;
          goal_id: string;
          id?: string;
          note?: string | null;
          score: number;
          user_id: string;
        };
        Update: {
          check_in_id?: string;
          created_at?: string;
          goal_id?: string;
          id?: string;
          note?: string | null;
          score?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "goal_ratings_check_in_id_fkey";
            columns: ["check_in_id"];
            isOneToOne: false;
            referencedRelation: "check_ins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_ratings_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_ratings_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "goal_ratings_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "goal_ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goal_ratings_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      goals: {
        Row: {
          abandon_reason: string | null;
          abandoned_at: string | null;
          archived_at: string | null;
          completed_at: string | null;
          created_at: string;
          currency: string;
          deleted_at: string | null;
          description: string | null;
          funding: Database["public"]["Enums"]["funding_type"];
          id: string;
          kind: Database["public"]["Enums"]["goal_kind"];
          life_area_id: string | null;
          owner_id: string;
          rag_override: Database["public"]["Enums"]["rag_status"] | null;
          rag_override_at: string | null;
          rag_override_by: string | null;
          rag_override_expires_at: string | null;
          rag_override_reason: string | null;
          start_date: string | null;
          state: Database["public"]["Enums"]["goal_state"];
          target_amount_minor: number | null;
          target_date: string | null;
          title: string;
          updated_at: string;
          visibility: Database["public"]["Enums"]["visibility_level"];
        };
        Insert: {
          abandon_reason?: string | null;
          abandoned_at?: string | null;
          archived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          description?: string | null;
          funding?: Database["public"]["Enums"]["funding_type"];
          id?: string;
          kind?: Database["public"]["Enums"]["goal_kind"];
          life_area_id?: string | null;
          owner_id: string;
          rag_override?: Database["public"]["Enums"]["rag_status"] | null;
          rag_override_at?: string | null;
          rag_override_by?: string | null;
          rag_override_expires_at?: string | null;
          rag_override_reason?: string | null;
          start_date?: string | null;
          state?: Database["public"]["Enums"]["goal_state"];
          target_amount_minor?: number | null;
          target_date?: string | null;
          title: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["visibility_level"];
        };
        Update: {
          abandon_reason?: string | null;
          abandoned_at?: string | null;
          archived_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          description?: string | null;
          funding?: Database["public"]["Enums"]["funding_type"];
          id?: string;
          kind?: Database["public"]["Enums"]["goal_kind"];
          life_area_id?: string | null;
          owner_id?: string;
          rag_override?: Database["public"]["Enums"]["rag_status"] | null;
          rag_override_at?: string | null;
          rag_override_by?: string | null;
          rag_override_expires_at?: string | null;
          rag_override_reason?: string | null;
          start_date?: string | null;
          state?: Database["public"]["Enums"]["goal_state"];
          target_amount_minor?: number | null;
          target_date?: string | null;
          title?: string;
          updated_at?: string;
          visibility?: Database["public"]["Enums"]["visibility_level"];
        };
        Relationships: [
          {
            foreignKeyName: "goals_life_area_id_fkey";
            columns: ["life_area_id"];
            isOneToOne: false;
            referencedRelation: "life_areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_rag_override_by_fkey";
            columns: ["rag_override_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_rag_override_by_fkey";
            columns: ["rag_override_by"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_rag_override_by_fkey";
            columns: ["rag_override_by"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_rag_override_by_fkey";
            columns: ["rag_override_by"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_rag_override_by_fkey";
            columns: ["rag_override_by"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          email: string | null;
          expires_at: string;
          id: string;
          invitee_id: string | null;
          inviter_id: string;
          resource_id: string | null;
          resource_type: string | null;
          revoked_at: string | null;
          scope: Database["public"]["Enums"]["share_scope"];
          token_hash: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          invitee_id?: string | null;
          inviter_id: string;
          resource_id?: string | null;
          resource_type?: string | null;
          revoked_at?: string | null;
          scope?: Database["public"]["Enums"]["share_scope"];
          token_hash: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          email?: string | null;
          expires_at?: string;
          id?: string;
          invitee_id?: string | null;
          inviter_id?: string;
          resource_id?: string | null;
          resource_type?: string | null;
          revoked_at?: string | null;
          scope?: Database["public"]["Enums"]["share_scope"];
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_invitee_id_fkey";
            columns: ["invitee_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "invitations_inviter_id_fkey";
            columns: ["inviter_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      ledger_entries: {
        Row: {
          amount_minor: number;
          base_amount_minor: number;
          base_currency: string;
          created_at: string;
          currency: string;
          deleted_at: string | null;
          description: string | null;
          entry_type: Database["public"]["Enums"]["ledger_kind"];
          fx_rate_applied: number;
          goal_id: string | null;
          id: string;
          is_estimate: boolean;
          occurred_on: string;
          pot_id: string | null;
          trip_leg_id: string | null;
          trip_stop_id: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          amount_minor: number;
          base_amount_minor: number;
          base_currency: string;
          created_at?: string;
          currency: string;
          deleted_at?: string | null;
          description?: string | null;
          entry_type: Database["public"]["Enums"]["ledger_kind"];
          fx_rate_applied: number;
          goal_id?: string | null;
          id?: string;
          is_estimate?: boolean;
          occurred_on?: string;
          pot_id?: string | null;
          trip_leg_id?: string | null;
          trip_stop_id?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_minor?: number;
          base_amount_minor?: number;
          base_currency?: string;
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          description?: string | null;
          entry_type?: Database["public"]["Enums"]["ledger_kind"];
          fx_rate_applied?: number;
          goal_id?: string | null;
          id?: string;
          is_estimate?: boolean;
          occurred_on?: string;
          pot_id?: string | null;
          trip_leg_id?: string | null;
          trip_stop_id?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "ledger_entries_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "ledger_entries_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "ledger_entries_pot_id_fkey";
            columns: ["pot_id"];
            isOneToOne: false;
            referencedRelation: "pots";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_pot_id_fkey";
            columns: ["pot_id"];
            isOneToOne: false;
            referencedRelation: "v_pot_balances";
            referencedColumns: ["pot_id"];
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "ledger_entries_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "ledger_trip_leg_fk";
            columns: ["trip_leg_id"];
            isOneToOne: false;
            referencedRelation: "trip_legs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "ledger_trip_stop_fk";
            columns: ["trip_stop_id"];
            isOneToOne: false;
            referencedRelation: "trip_stops";
            referencedColumns: ["id"];
          },
        ];
      };
      life_areas: {
        Row: {
          colour: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          is_system: boolean;
          name: string;
          sort_order: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          colour?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_system?: boolean;
          name: string;
          sort_order?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          colour?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          is_system?: boolean;
          name?: string;
          sort_order?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "life_areas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "life_areas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "life_areas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "life_areas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "life_areas_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      llama_messages: {
        Row: {
          body: string;
          created_at: string;
          dismissed_at: string | null;
          id: string;
          priority: number;
          read_at: string | null;
          resource_id: string | null;
          resource_type: string | null;
          speaker: Database["public"]["Enums"]["llama_speaker"];
          trigger_code: string;
          user_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          priority?: number;
          read_at?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          speaker: Database["public"]["Enums"]["llama_speaker"];
          trigger_code: string;
          user_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          dismissed_at?: string | null;
          id?: string;
          priority?: number;
          read_at?: string | null;
          resource_id?: string | null;
          resource_type?: string | null;
          speaker?: Database["public"]["Enums"]["llama_speaker"];
          trigger_code?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "llama_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "llama_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "llama_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "llama_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "llama_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      milestones: {
        Row: {
          completed_at: string | null;
          created_at: string;
          deleted_at: string | null;
          due_date: string;
          goal_id: string;
          id: string;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          due_date: string;
          goal_id: string;
          id?: string;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          due_date?: string;
          goal_id?: string;
          id?: string;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "milestones_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "milestones_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "milestones_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
        ];
      };
      pots: {
        Row: {
          created_at: string;
          currency: string;
          deleted_at: string | null;
          id: string;
          is_default: boolean;
          name: string;
          opening_balance_minor: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          currency: string;
          deleted_at?: string | null;
          id?: string;
          is_default?: boolean;
          name: string;
          opening_balance_minor?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          currency?: string;
          deleted_at?: string | null;
          id?: string;
          is_default?: boolean;
          name?: string;
          opening_balance_minor?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      profiles: {
        Row: {
          active_goal_limit: number;
          avatar: Json;
          base_currency: string;
          check_in_day: number;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          handle: string;
          id: string;
          llama_frequency: Database["public"]["Enums"]["llama_frequency"];
          onboarded_at: string | null;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          active_goal_limit?: number;
          avatar?: Json;
          base_currency?: string;
          check_in_day?: number;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          handle: string;
          id: string;
          llama_frequency?: Database["public"]["Enums"]["llama_frequency"];
          onboarded_at?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          active_goal_limit?: number;
          avatar?: Json;
          base_currency?: string;
          check_in_day?: number;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          handle?: string;
          id?: string;
          llama_frequency?: Database["public"]["Enums"]["llama_frequency"];
          onboarded_at?: string | null;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rag_snapshots: {
        Row: {
          budget_status: Database["public"]["Enums"]["rag_status"];
          budget_variance_pp: number | null;
          check_in_id: string | null;
          computed_at: string;
          goal_id: string;
          id: string;
          inputs: Json;
          momentum_mean: number | null;
          momentum_status: Database["public"]["Enums"]["rag_status"];
          overall_status: Database["public"]["Enums"]["rag_status"];
          schedule_status: Database["public"]["Enums"]["rag_status"];
          schedule_variance_pp: number | null;
          was_overridden: boolean;
        };
        Insert: {
          budget_status: Database["public"]["Enums"]["rag_status"];
          budget_variance_pp?: number | null;
          check_in_id?: string | null;
          computed_at?: string;
          goal_id: string;
          id?: string;
          inputs?: Json;
          momentum_mean?: number | null;
          momentum_status: Database["public"]["Enums"]["rag_status"];
          overall_status: Database["public"]["Enums"]["rag_status"];
          schedule_status: Database["public"]["Enums"]["rag_status"];
          schedule_variance_pp?: number | null;
          was_overridden?: boolean;
        };
        Update: {
          budget_status?: Database["public"]["Enums"]["rag_status"];
          budget_variance_pp?: number | null;
          check_in_id?: string | null;
          computed_at?: string;
          goal_id?: string;
          id?: string;
          inputs?: Json;
          momentum_mean?: number | null;
          momentum_status?: Database["public"]["Enums"]["rag_status"];
          overall_status?: Database["public"]["Enums"]["rag_status"];
          schedule_status?: Database["public"]["Enums"]["rag_status"];
          schedule_variance_pp?: number | null;
          was_overridden?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "rag_snapshots_check_in_id_fkey";
            columns: ["check_in_id"];
            isOneToOne: false;
            referencedRelation: "check_ins";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rag_snapshots_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rag_snapshots_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "rag_snapshots_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
        ];
      };
      share_grants: {
        Row: {
          created_at: string;
          grantee_id: string;
          grantor_id: string;
          id: string;
          resource_id: string;
          resource_type: string;
          revoked_at: string | null;
          revoked_by: string | null;
          scope: Database["public"]["Enums"]["share_scope"];
        };
        Insert: {
          created_at?: string;
          grantee_id: string;
          grantor_id: string;
          id?: string;
          resource_id: string;
          resource_type: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scope?: Database["public"]["Enums"]["share_scope"];
        };
        Update: {
          created_at?: string;
          grantee_id?: string;
          grantor_id?: string;
          id?: string;
          resource_id?: string;
          resource_type?: string;
          revoked_at?: string | null;
          revoked_by?: string | null;
          scope?: Database["public"]["Enums"]["share_scope"];
        };
        Relationships: [
          {
            foreignKeyName: "share_grants_grantee_id_fkey";
            columns: ["grantee_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_grants_grantee_id_fkey";
            columns: ["grantee_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantee_id_fkey";
            columns: ["grantee_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantee_id_fkey";
            columns: ["grantee_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantee_id_fkey";
            columns: ["grantee_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantor_id_fkey";
            columns: ["grantor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_grants_grantor_id_fkey";
            columns: ["grantor_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantor_id_fkey";
            columns: ["grantor_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantor_id_fkey";
            columns: ["grantor_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_grantor_id_fkey";
            columns: ["grantor_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "share_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "share_grants_revoked_by_fkey";
            columns: ["revoked_by"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      someday_items: {
        Row: {
          country_code: string | null;
          created_at: string;
          currency: string | null;
          deleted_at: string | null;
          id: string;
          latitude: number | null;
          life_area_id: string | null;
          longitude: number | null;
          mapbox_place_id: string | null;
          notes: string | null;
          place_name: string | null;
          promoted_at: string | null;
          rough_cost_minor: number | null;
          title: string;
          unsplash_author_name: string | null;
          unsplash_author_url: string | null;
          unsplash_full_url: string | null;
          unsplash_photo_id: string | null;
          unsplash_thumb_url: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          country_code?: string | null;
          created_at?: string;
          currency?: string | null;
          deleted_at?: string | null;
          id?: string;
          latitude?: number | null;
          life_area_id?: string | null;
          longitude?: number | null;
          mapbox_place_id?: string | null;
          notes?: string | null;
          place_name?: string | null;
          promoted_at?: string | null;
          rough_cost_minor?: number | null;
          title: string;
          unsplash_author_name?: string | null;
          unsplash_author_url?: string | null;
          unsplash_full_url?: string | null;
          unsplash_photo_id?: string | null;
          unsplash_thumb_url?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          country_code?: string | null;
          created_at?: string;
          currency?: string | null;
          deleted_at?: string | null;
          id?: string;
          latitude?: number | null;
          life_area_id?: string | null;
          longitude?: number | null;
          mapbox_place_id?: string | null;
          notes?: string | null;
          place_name?: string | null;
          promoted_at?: string | null;
          rough_cost_minor?: number | null;
          title?: string;
          unsplash_author_name?: string | null;
          unsplash_author_url?: string | null;
          unsplash_full_url?: string | null;
          unsplash_photo_id?: string | null;
          unsplash_thumb_url?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "someday_items_life_area_id_fkey";
            columns: ["life_area_id"];
            isOneToOne: false;
            referencedRelation: "life_areas";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "someday_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "someday_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "someday_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "someday_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "someday_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      task_dependencies: {
        Row: {
          created_at: string;
          dep_type: Database["public"]["Enums"]["dependency_type"];
          id: string;
          lag_days: number;
          predecessor_task_id: string;
          successor_task_id: string;
        };
        Insert: {
          created_at?: string;
          dep_type?: Database["public"]["Enums"]["dependency_type"];
          id?: string;
          lag_days?: number;
          predecessor_task_id: string;
          successor_task_id: string;
        };
        Update: {
          created_at?: string;
          dep_type?: Database["public"]["Enums"]["dependency_type"];
          id?: string;
          lag_days?: number;
          predecessor_task_id?: string;
          successor_task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "task_dependencies_predecessor_task_id_fkey";
            columns: ["predecessor_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "task_dependencies_successor_task_id_fkey";
            columns: ["successor_task_id"];
            isOneToOne: false;
            referencedRelation: "tasks";
            referencedColumns: ["id"];
          },
        ];
      };
      tasks: {
        Row: {
          completed_at: string | null;
          computed_end: string | null;
          computed_start: string | null;
          cost_currency: string | null;
          created_at: string;
          deleted_at: string | null;
          duration_days: number;
          estimated_cost_minor: number | null;
          goal_id: string;
          id: string;
          is_critical: boolean;
          milestone_id: string | null;
          notes: string | null;
          offset_days: number;
          owner_id: string;
          sort_order: number;
          status: Database["public"]["Enums"]["task_status"];
          title: string;
          total_float_days: number | null;
          updated_at: string;
        };
        Insert: {
          completed_at?: string | null;
          computed_end?: string | null;
          computed_start?: string | null;
          cost_currency?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          duration_days?: number;
          estimated_cost_minor?: number | null;
          goal_id: string;
          id?: string;
          is_critical?: boolean;
          milestone_id?: string | null;
          notes?: string | null;
          offset_days?: number;
          owner_id: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title: string;
          total_float_days?: number | null;
          updated_at?: string;
        };
        Update: {
          completed_at?: string | null;
          computed_end?: string | null;
          computed_start?: string | null;
          cost_currency?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          duration_days?: number;
          estimated_cost_minor?: number | null;
          goal_id?: string;
          id?: string;
          is_critical?: boolean;
          milestone_id?: string | null;
          notes?: string | null;
          offset_days?: number;
          owner_id?: string;
          sort_order?: number;
          status?: Database["public"]["Enums"]["task_status"];
          title?: string;
          total_float_days?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "tasks_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "tasks_milestone_id_fkey";
            columns: ["milestone_id"];
            isOneToOne: false;
            referencedRelation: "milestones";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "tasks_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      trip_legs: {
        Row: {
          booking_reference: string | null;
          booking_state: Database["public"]["Enums"]["booking_status"];
          booking_url: string | null;
          cost_minor: number | null;
          created_at: string;
          currency: string | null;
          deleted_at: string | null;
          duration_minutes: number | null;
          from_stop_id: string | null;
          id: string;
          mode: Database["public"]["Enums"]["travel_mode"];
          notes: string | null;
          to_stop_id: string | null;
          trip_id: string;
          updated_at: string;
        };
        Insert: {
          booking_reference?: string | null;
          booking_state?: Database["public"]["Enums"]["booking_status"];
          booking_url?: string | null;
          cost_minor?: number | null;
          created_at?: string;
          currency?: string | null;
          deleted_at?: string | null;
          duration_minutes?: number | null;
          from_stop_id?: string | null;
          id?: string;
          mode?: Database["public"]["Enums"]["travel_mode"];
          notes?: string | null;
          to_stop_id?: string | null;
          trip_id: string;
          updated_at?: string;
        };
        Update: {
          booking_reference?: string | null;
          booking_state?: Database["public"]["Enums"]["booking_status"];
          booking_url?: string | null;
          cost_minor?: number | null;
          created_at?: string;
          currency?: string | null;
          deleted_at?: string | null;
          duration_minutes?: number | null;
          from_stop_id?: string | null;
          id?: string;
          mode?: Database["public"]["Enums"]["travel_mode"];
          notes?: string | null;
          to_stop_id?: string | null;
          trip_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_legs_from_stop_id_fkey";
            columns: ["from_stop_id"];
            isOneToOne: false;
            referencedRelation: "trip_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_legs_to_stop_id_fkey";
            columns: ["to_stop_id"];
            isOneToOne: false;
            referencedRelation: "trip_stops";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_legs_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_legs_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "v_trip_estimates";
            referencedColumns: ["trip_id"];
          },
        ];
      };
      trip_stops: {
        Row: {
          arrival_offset_days: number | null;
          booking_reference: string | null;
          booking_state: Database["public"]["Enums"]["booking_status"];
          booking_url: string | null;
          computed_arrival: string | null;
          computed_departure: string | null;
          country_code: string | null;
          created_at: string;
          currency: string | null;
          deleted_at: string | null;
          estimated_cost_minor: number | null;
          id: string;
          latitude: number | null;
          longitude: number | null;
          mapbox_place_id: string | null;
          name: string;
          nights: number;
          notes: string | null;
          place_name: string | null;
          sequence: number;
          someday_item_id: string | null;
          trip_id: string;
          unsplash_author_name: string | null;
          unsplash_author_url: string | null;
          unsplash_full_url: string | null;
          unsplash_photo_id: string | null;
          unsplash_thumb_url: string | null;
          updated_at: string;
        };
        Insert: {
          arrival_offset_days?: number | null;
          booking_reference?: string | null;
          booking_state?: Database["public"]["Enums"]["booking_status"];
          booking_url?: string | null;
          computed_arrival?: string | null;
          computed_departure?: string | null;
          country_code?: string | null;
          created_at?: string;
          currency?: string | null;
          deleted_at?: string | null;
          estimated_cost_minor?: number | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          mapbox_place_id?: string | null;
          name: string;
          nights?: number;
          notes?: string | null;
          place_name?: string | null;
          sequence: number;
          someday_item_id?: string | null;
          trip_id: string;
          unsplash_author_name?: string | null;
          unsplash_author_url?: string | null;
          unsplash_full_url?: string | null;
          unsplash_photo_id?: string | null;
          unsplash_thumb_url?: string | null;
          updated_at?: string;
        };
        Update: {
          arrival_offset_days?: number | null;
          booking_reference?: string | null;
          booking_state?: Database["public"]["Enums"]["booking_status"];
          booking_url?: string | null;
          computed_arrival?: string | null;
          computed_departure?: string | null;
          country_code?: string | null;
          created_at?: string;
          currency?: string | null;
          deleted_at?: string | null;
          estimated_cost_minor?: number | null;
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          mapbox_place_id?: string | null;
          name?: string;
          nights?: number;
          notes?: string | null;
          place_name?: string | null;
          sequence?: number;
          someday_item_id?: string | null;
          trip_id?: string;
          unsplash_author_name?: string | null;
          unsplash_author_url?: string | null;
          unsplash_full_url?: string | null;
          unsplash_photo_id?: string | null;
          unsplash_thumb_url?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trip_stops_someday_item_id_fkey";
            columns: ["someday_item_id"];
            isOneToOne: false;
            referencedRelation: "someday_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "trips";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trip_stops_trip_id_fkey";
            columns: ["trip_id"];
            isOneToOne: false;
            referencedRelation: "v_trip_estimates";
            referencedColumns: ["trip_id"];
          },
        ];
      };
      trips: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          goal_id: string;
          id: string;
          notes: string | null;
          origin_lat: number | null;
          origin_lng: number | null;
          origin_name: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          goal_id: string;
          id?: string;
          notes?: string | null;
          origin_lat?: number | null;
          origin_lng?: number | null;
          origin_name?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          goal_id?: string;
          id?: string;
          notes?: string | null;
          origin_lat?: number | null;
          origin_lng?: number | null;
          origin_name?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "trips_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: true;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: true;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "trips_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: true;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
        ];
      };
      user_achievements: {
        Row: {
          achievement_id: string;
          context: Json;
          id: string;
          is_pinned: boolean;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          context?: Json;
          id?: string;
          is_pinned?: boolean;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          context?: Json;
          id?: string;
          is_pinned?: boolean;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_id_fkey";
            columns: ["achievement_id"];
            isOneToOne: false;
            referencedRelation: "achievements";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: {
      v_allocation_summary: {
        Row: {
          allocated_minor: number | null;
          base_currency: string | null;
          free_minor: number | null;
          monthly_capacity_minor: number | null;
          over_allocated: boolean | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      v_financial_horizon: {
        Row: {
          horizon_date: string | null;
          user_id: string | null;
        };
        Insert: {
          horizon_date?: never;
          user_id?: string | null;
        };
        Update: {
          horizon_date?: never;
          user_id?: string | null;
        };
        Relationships: [];
      };
      v_goal_affordability: {
        Row: {
          affordable_by_target: boolean | null;
          affordable_from: string | null;
          contributed_minor: number | null;
          currency: string | null;
          funding: Database["public"]["Enums"]["funding_type"] | null;
          goal_id: string | null;
          monthly_rate_minor: number | null;
          owner_id: string | null;
          remaining_minor: number | null;
          slips_by_days: number | null;
          target_amount_minor: number | null;
          target_date: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "goals_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      v_goal_funding: {
        Row: {
          contributed_minor: number | null;
          currency: string | null;
          funding: Database["public"]["Enums"]["funding_type"] | null;
          goal_id: string | null;
          is_underfunded: boolean | null;
          pledged_minor: number | null;
          spent_minor: number | null;
          target_amount_minor: number | null;
        };
        Relationships: [];
      };
      v_monthly_capacity: {
        Row: {
          base_currency: string | null;
          monthly_capacity_minor: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      v_monthly_cashflow: {
        Row: {
          base_currency: string | null;
          expense_monthly_minor: number | null;
          income_monthly_minor: number | null;
          monthly_capacity_minor: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "cashflow_items_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      v_pot_balances: {
        Row: {
          balance_minor: number | null;
          currency: string | null;
          name: string | null;
          pot_id: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_allocation_summary";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_financial_horizon";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_monthly_capacity";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "pots_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "v_user_capacity";
            referencedColumns: ["user_id"];
          },
        ];
      };
      v_rating_divergence: {
        Row: {
          goal_id: string | null;
          max_score: number | null;
          mean_score: number | null;
          min_score: number | null;
          period_start: string | null;
          rater_count: number | null;
          spread: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "goal_ratings_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "goal_ratings_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "goal_ratings_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: false;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
        ];
      };
      v_timeline_items: {
        Row: {
          ends_on: string | null;
          goal_id: string | null;
          is_complete: boolean | null;
          is_point: boolean | null;
          item_id: string | null;
          item_type: string | null;
          kind: string | null;
          life_area_id: string | null;
          owner_id: string | null;
          parent_id: string | null;
          sort_order: number | null;
          starts_on: string | null;
          status: string | null;
          title: string | null;
        };
        Relationships: [];
      };
      v_trip_estimates: {
        Row: {
          currency: string | null;
          goal_id: string | null;
          legs_estimate_minor: number | null;
          stops_estimate_minor: number | null;
          total_estimate_minor: number | null;
          total_nights: number | null;
          trip_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "trips_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: true;
            referencedRelation: "goals";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "trips_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: true;
            referencedRelation: "v_goal_affordability";
            referencedColumns: ["goal_id"];
          },
          {
            foreignKeyName: "trips_goal_id_fkey";
            columns: ["goal_id"];
            isOneToOne: true;
            referencedRelation: "v_goal_funding";
            referencedColumns: ["goal_id"];
          },
        ];
      };
      v_user_capacity: {
        Row: {
          active_goal_count: number | null;
          active_goal_limit: number | null;
          over_limit: boolean | null;
          recent_capacity_mean: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      booking_status: "idea" | "researching" | "booked" | "done" | "cancelled";
      cadence:
        | "one_off"
        | "weekly"
        | "fortnightly"
        | "monthly"
        | "quarterly"
        | "annually";
      cashflow_kind: "income" | "expense";
      dependency_type: "fs" | "ss" | "ff" | "sf";
      funding_type: "none" | "save_toward" | "spend_against";
      goal_kind: "standard" | "trip";
      goal_state: "active" | "someday" | "completed" | "archived" | "abandoned";
      ledger_kind: "contribution" | "expense";
      llama_frequency: "all" | "important_only" | "muted";
      llama_speaker: "derek" | "fluffy";
      participant_role: "owner" | "collaborator" | "viewer";
      rag_status: "green" | "amber" | "red" | "grey";
      share_scope: "view" | "edit";
      task_status:
        "not_started" | "in_progress" | "blocked" | "done" | "cancelled";
      travel_mode:
        | "flight"
        | "train"
        | "bus"
        | "car"
        | "ferry"
        | "boat"
        | "walk"
        | "cycle"
        | "other";
      visibility_level: "private" | "shared";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      booking_status: ["idea", "researching", "booked", "done", "cancelled"],
      cadence: [
        "one_off",
        "weekly",
        "fortnightly",
        "monthly",
        "quarterly",
        "annually",
      ],
      cashflow_kind: ["income", "expense"],
      dependency_type: ["fs", "ss", "ff", "sf"],
      funding_type: ["none", "save_toward", "spend_against"],
      goal_kind: ["standard", "trip"],
      goal_state: ["active", "someday", "completed", "archived", "abandoned"],
      ledger_kind: ["contribution", "expense"],
      llama_frequency: ["all", "important_only", "muted"],
      llama_speaker: ["derek", "fluffy"],
      participant_role: ["owner", "collaborator", "viewer"],
      rag_status: ["green", "amber", "red", "grey"],
      share_scope: ["view", "edit"],
      task_status: [
        "not_started",
        "in_progress",
        "blocked",
        "done",
        "cancelled",
      ],
      travel_mode: [
        "flight",
        "train",
        "bus",
        "car",
        "ferry",
        "boat",
        "walk",
        "cycle",
        "other",
      ],
      visibility_level: ["private", "shared"],
    },
  },
} as const;
