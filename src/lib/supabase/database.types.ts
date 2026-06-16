/**
 * Hand-written database types for the BRUTHA Supabase schema.
 *
 * Generated equivalents can be produced with:
 *   npm run supabase:types   (supabase gen types typescript --local)
 *
 * Shape matches what @supabase/postgrest-js expects (GenericSchema): each table
 * carries Row/Insert/Update + a Relationships array, and the schema exposes
 * Tables/Views/Functions/Enums/CompositeTypes. Missing any of these collapses
 * the client's query builders to `never`.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          name: string | null;
          avatar_url: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          name?: string | null;
          avatar_url?: string | null;
        };
        Update: {
          id?: string;
          email?: string | null;
          name?: string | null;
          avatar_url?: string | null;
        };
        Relationships: [];
      };
      contacts: {
        Row: {
          id: number;
          owner: string;
          name: string;
          email: string | null;
          phone: string | null;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          owner?: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
        };
        Update: {
          owner?: string;
          name?: string;
          email?: string | null;
          phone?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          id: number;
          owner: string;
          title: string | null;
          content: string;
          created_at: string;
        };
        Insert: {
          owner?: string;
          title?: string | null;
          content: string;
        };
        Update: {
          owner?: string;
          title?: string | null;
          content?: string;
        };
        Relationships: [];
      };
      tasks: {
        Row: {
          id: number;
          owner: string;
          task: string;
          due: string | null;
          done: boolean;
          created_at: string;
        };
        Insert: {
          owner?: string;
          task: string;
          due?: string | null;
          done?: boolean;
        };
        Update: {
          owner?: string;
          task?: string;
          due?: string | null;
          done?: boolean;
        };
        Relationships: [];
      };
      settings: {
        Row: {
          owner: string;
          key: string;
          value: string;
          updated_at: string;
        };
        Insert: { owner?: string; key: string; value: string };
        Update: { owner?: string; key?: string; value?: string };
        Relationships: [];
      };
      workers: {
        Row: {
          id: string;
          owner: string;
          title: string;
          task: string;
          status: "queued" | "running" | "done" | "error";
          result: string | null;
          error: string | null;
          progress: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          owner?: string;
          title: string;
          task: string;
          status?: "queued" | "running" | "done" | "error";
        };
        Update: {
          status?: "queued" | "running" | "done" | "error";
          result?: string | null;
          error?: string | null;
          progress?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      search_notes: {
        Args: { q: string; max_results?: number };
        Returns: {
          id: number;
          title: string | null;
          content: string;
          created_at: string;
        }[];
      };
    };
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
