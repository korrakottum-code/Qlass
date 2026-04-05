import { createClient } from "@supabase/supabase-js";

// Using hardcoded values as fallback since .env loading seems to have issues
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://hjuvtsjjtucdirlkdgwa.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhqdXZ0c2pqdHVjZGlybGtkZ3dhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNzIyODcsImV4cCI6MjA5MDk0ODI4N30.Why2fJ6oQnZxW_reiQo-RTMdjORlrwfH46kmbtL5Nzg';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
