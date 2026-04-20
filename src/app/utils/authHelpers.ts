/**
 * Authentication and Session Management Utilities
 * 
 * This module provides centralized functions for managing authentication state
 * and storage keys to prevent role conflicts between parent and kid sessions.
 * 
 * PRODUCTION-READY: Uses Capacitor Preferences for iOS native storage
 */

import { getStorage, setStorage, setMultiple, removeMultiple, STORAGE_KEYS } from '../../utils/storage';

/**
 * Get current user role SYNCHRONOUSLY.
 *
 * This is a deliberate escape hatch from the async storage abstraction:
 * a handful of render-time guards (e.g. RequireParentRole) need a role
 * answer before an async effect can run. It reads window.localStorage
 * directly, which on web is exactly what the async abstraction falls
 * back to. On native iOS the writer side (setParentSession etc.) mirrors
 * the role to window.localStorage via storage.ts's web fallback, so this
 * still returns correct values inside the Capacitor WebView.
 *
 * Prefer the async {@link getCurrentRole} anywhere you can `await`.
 */
export function getCurrentRoleSync(): 'parent' | 'child' | null {
  // eslint-disable-next-line no-restricted-globals
  const userRole = window.localStorage.getItem('user_role');

  if (userRole === 'parent') return 'parent';
  if (userRole === 'child') return 'child';

  return null;
}

/**
 * Get current user role ASYNCHRONOUSLY
 * This uses async storage (Capacitor Preferences on native)
 */
export async function getCurrentRole(): Promise<'parent' | 'child' | null> {
  const userRole = await getStorage(STORAGE_KEYS.USER_ROLE);
  
  if (userRole === 'parent') return 'parent';
  if (userRole === 'child') return 'child';
  
  return null;
}

/**
 * Check if user has a valid Supabase session (parent mode)
 */
export async function hasSupabaseSession(): Promise<boolean> {
  const userId = await getStorage(STORAGE_KEYS.USER_ID);
  const accessToken = await getStorage(STORAGE_KEYS.ACCESS_TOKEN);
  
  return !!(userId && accessToken);
}

/**
 * Clear all kid-specific session data
 * Called when parent logs in to ensure clean parent session
 */
export async function clearKidSession(): Promise<void> {
  // CRITICAL SAFETY CHECK: Never clear kid session if currently in kid mode
  const userMode = await getStorage('user_mode');
  const userRole = await getStorage('user_role');
  const isKidMode = userMode === 'kid' || userRole === 'child';
  
  if (isKidMode) {
    // Silent block - kid session is protected
    return; // ABORT - do not clear active kid session
  }
  
  await removeMultiple([
    STORAGE_KEYS.CHILD_ID,
    'kid_pin_session',
    'selected_child_id',
    'last_active_child',
    STORAGE_KEYS.KID_SESSION_TOKEN,
    'kid_access_token',
    'kid_id'
  ]);
  
  // CRITICAL: Dispatch a storage event to notify FamilyContext
  // This ensures selectedChildId is cleared immediately when switching to parent mode
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'selected_child_id',
    oldValue: await getStorage('selected_child_id'),
    newValue: null,
    url: window.location.href
  }));
}

/**
 * Clear ALL authentication and session data
 * Called on logout
 */
export async function clearAllSessions(): Promise<void> {
  // CRITICAL SAFETY CHECK: BLOCK logout if in kid mode
  const userMode = await getStorage('user_mode');
  const userRole = await getStorage('user_role');
  const isKidMode = userMode === 'kid' || userRole === 'child';
  
  if (isKidMode) {
    // Silent block - kids cannot logout via this function
    // They must use the parent PIN to switch back
    console.log('🔒 Logout blocked: Kids must use parent PIN to switch modes');
    return; // ABORT - do not allow kid logout
  }
  
  // Clear all user/auth keys in parallel
  await removeMultiple([
    STORAGE_KEYS.USER_ID,
    STORAGE_KEYS.USER_ROLE,
    STORAGE_KEYS.USER_NAME,
    STORAGE_KEYS.USER_EMAIL,
    STORAGE_KEYS.USER_MODE,
    // Legacy keys
    'user_id',
    'fgs_user_name',
    'fgs_user_role'
  ]);
  
  // Clear kid session (safe since we're not in kid mode)
  await clearKidSession();
  
  // Note: We intentionally DO NOT clear FAMILY_ID
  // This allows users to stay logged into the same family
  // even after logout/login cycles
}

/**
 * Clear parent-specific session data
 * Called when kid logs in to ensure clean kid session
 */
export async function clearParentSession(): Promise<void> {
  console.log('🧹 Clearing parent session data...');
  
  await removeMultiple([
    STORAGE_KEYS.USER_ID,
    STORAGE_KEYS.ACCESS_TOKEN,
    'user_id',
    'access_token'
  ]);
  
  console.log('✅ Parent session cleared');
}

/**
 * Set parent session after successful login
 * This sets all required keys for parent mode
 */
export async function setParentSession(
  userId: string,
  userName: string,
  userEmail: string
): Promise<void> {
  console.log('🔐 Setting parent session:', {
    userId,
    userName,
    userEmail
  });
  
  // Clear any kid session first
  await clearKidSession();
  
  // Set parent session keys
  await setStorage(STORAGE_KEYS.USER_ID, userId);
  await setStorage(STORAGE_KEYS.USER_ROLE, 'parent');
  await setStorage(STORAGE_KEYS.USER_NAME, userName);
  await setStorage(STORAGE_KEYS.USER_EMAIL, userEmail);
  await setStorage(STORAGE_KEYS.USER_MODE, 'parent');
  
  // Backwards compatibility keys
  await setMultiple({
    user_role: 'parent',
    fgs_user_mode: 'parent',
    fgs_user_id: userId,
    fgs_user_name: userName,
  });
  
  console.log('✅ Parent session set - dispatching roleChanged event');
  
  // Dispatch event to notify AuthContext
  window.dispatchEvent(new CustomEvent('roleChanged', {
    detail: { role: 'parent', userId }
  }));
}