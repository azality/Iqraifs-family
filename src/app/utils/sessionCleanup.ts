/**
 * Session Cleanup Utility
 * 
 * Handles automatic cleanup of invalid sessions when user accounts are deleted
 */

import { supabase } from '../../../utils/supabase/client';

let isClearing = false;

export async function clearInvalidSessionAndRedirect(reason: string) {
  // Prevent multiple simultaneous cleanup attempts
  if (isClearing) {
    console.log('⏭️ Session cleanup already in progress, skipping...');
    return;
  }

  isClearing = true;

  console.error('🚨 CRITICAL: Invalid session detected:', reason);
  console.log('🔄 Auto-clearing invalid session...');
  
  try {
    // Sign out from Supabase
    await supabase.auth.signOut();
    
    // Clear all session-related localStorage
    localStorage.removeItem('user_role');
    localStorage.removeItem('user_mode');
    localStorage.removeItem('fgs_family_id');
    localStorage.removeItem('fgs_selected_child_id');
    localStorage.removeItem('kid_access_token');
    localStorage.removeItem('kid_session_token');
    
    // Clear all Supabase session keys
    const allKeys = Object.keys(localStorage);
    const supabaseKeys = allKeys.filter(key => 
      key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token')
    );
    supabaseKeys.forEach(key => localStorage.removeItem(key));
    
    console.log('✅ Invalid session cleared successfully');
    console.log('🔄 Redirecting to login...');
    
    // Redirect to login
    window.location.href = '/parent-login';
  } catch (error) {
    console.error('❌ Error during session cleanup:', error);
    // Force redirect anyway
    window.location.href = '/parent-login';
  }
}

/**
 * Check if an error response indicates the user account was deleted
 */
export function isUserNotFoundError(error: any): boolean {
  if (!error) return false;

  const errorStr = typeof error === 'string' ? error : JSON.stringify(error);
  
  return (
    errorStr.includes('user_not_found') ||
    errorStr.includes('User from sub claim in JWT does not exist') ||
    errorStr.includes('User does not exist') ||
    (error.status === 403 && errorStr.includes('user'))
  );
}
