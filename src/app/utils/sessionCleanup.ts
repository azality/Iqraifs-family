/**
 * Session Cleanup Utility
 * 
 * Handles automatic cleanup of invalid sessions when user accounts are deleted
 */

import { supabase } from '../../../utils/supabase/client';
import { removeMultipleSync } from '../../utils/storage';

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

    // Clear all FGS session-related storage (async abstraction covers both web and native)
    removeMultipleSync([
      'user_role',
      'user_mode',
      'fgs_family_id',
      'fgs_selected_child_id',
      'kid_access_token',
      'kid_session_token',
    ]);

    // Supabase stores its own session state directly in window.localStorage, so
    // we have to clean those raw entries here (see note in src/utils/sessionCleanup.ts).
    // eslint-disable-next-line no-restricted-globals
    const allKeys = Object.keys(window.localStorage);
    const supabaseKeys = allKeys.filter((key) =>
      key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'),
    );
    // eslint-disable-next-line no-restricted-globals
    supabaseKeys.forEach((key) => window.localStorage.removeItem(key));
    
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
