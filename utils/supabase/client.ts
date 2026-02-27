import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { projectId, publicAnonKey } from "./info.tsx";

export const supabaseUrl = `https://${projectId}.supabase.co`;

// CRITICAL: Create ONLY ONE singleton instance to ensure session consistency
// All imports of this client will reference the same instance and session
const supabaseInstance = createSupabaseClient(supabaseUrl, publicAnonKey, {
  auth: {
    // Store session in localStorage for persistence
    storage: window.localStorage,
    // Use default Supabase storage key format (DO NOT customize)
    // Supabase uses: supabase.auth.token
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

// Log singleton creation
console.log('🔧 Supabase client singleton created:', {
  url: supabaseUrl,
  hasLocalStorage: typeof window !== 'undefined' && !!window.localStorage
});

// Export the singleton instance
export const supabase = supabaseInstance;

// Backwards compatibility - return the same singleton instance
export function createClient(url?: string, key?: string) {
  console.log('⚠️ createClient called - returning singleton instance');
  return supabaseInstance;
}