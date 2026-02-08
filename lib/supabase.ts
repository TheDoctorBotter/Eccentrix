import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  },
});

export type Database = {
  public: {
    Tables: {
      templates: {
        Row: {
          id: string;
          name: string;
          note_type: string;
          content: string;
          style_settings: any;
          required_sections: any;
          is_default: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          note_type: string;
          content: string;
          style_settings?: any;
          required_sections?: any;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          note_type?: string;
          content?: string;
          style_settings?: any;
          required_sections?: any;
          is_default?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      notes: {
        Row: {
          id: string;
          note_type: string;
          input_data: any;
          output_text: string;
          billing_justification: string | null;
          hep_summary: string | null;
          template_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          note_type: string;
          input_data: any;
          output_text: string;
          billing_justification?: string | null;
          hep_summary?: string | null;
          template_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          note_type?: string;
          input_data?: any;
          output_text?: string;
          billing_justification?: string | null;
          hep_summary?: string | null;
          template_id?: string | null;
          created_at?: string;
        };
      };
      intervention_library: {
        Row: {
          id: string;
          name: string;
          category: string;
          default_dosage: string | null;
          default_cues: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          category: string;
          default_dosage?: string | null;
          default_cues?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          category?: string;
          default_dosage?: string | null;
          default_cues?: string | null;
          created_at?: string;
        };
      };
      user_settings: {
        Row: {
          id: string;
          setting_key: string;
          setting_value: any;
          updated_at: string;
        };
        Insert: {
          id?: string;
          setting_key: string;
          setting_value: any;
          updated_at?: string;
        };
        Update: {
          id?: string;
          setting_key?: string;
          setting_value?: any;
          updated_at?: string;
        };
      };
    };
  };
};
