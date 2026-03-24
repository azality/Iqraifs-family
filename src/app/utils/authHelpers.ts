/**
 * Authentication and Session Management Utilities
 * 
 * This module provides centralized functions for managing authentication state
 * and storage keys to prevent role conflicts between parent and kid sessions.
 * 
 * PRODUCTION-READY: Uses Capacitor Preferences for iOS native storage
 */

import { getStorage, setStorage, removeStorage, removeMultiple, STORAGE_KEYS } from '../../utils/storage';

/**
 * Get current user role SYNCHRONOUSLY
 * This checks localStorage directly without async operations
 * Used for immediate role checks in contexts
 */
export function getCurrentRoleSync(): 'parent' | 'child' | null {
  const userRole = localStorage.getItem('user_role');
  
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
const KID_SESSION_KEYS = [
  STORAGE_KEYS.CHILD_ID,
  STORAGE_KEYS.KID_SESSION_TOKEN,
  'kid_access_token',
  'kid_pin_session',
  'kid_id',
  'kid_name',
  'kid_avatar',
  'kid_family_code',
  'selected_child_id',
  'fgs_selected_child_id',
  'last_active_child',
  'child_id'
] as const;

async function removeKidSessionKeys(): Promise<void> {
  await removeMultiple([...KID_SESSION_KEYS]);
}

function dispatchChildSelectionCleared() {
  window.dispatchEvent(new StorageEvent('storage', {
    key: 'fgs_selected_child_id',
    oldValue: localStorage.getItem('fgs_selected_child_id'),
    newValue: null,
    url: window.location.href
  }));
}

export async function clearKidSession(): Promise<void> {
  const userMode = localStorage.getItem('user_mode') || localStorage.getItem('fgs_user_mode');
  const userRole = localStorage.getItem('user_role');
  const isKidMode = userMode === 'kid' || userRole === 'child';

  if (isKidMode) {
    return;
  }

  await removeKidSessionKeys();
  dispatchChildSelectionCleared();
}

export async function forceClearKidSessionForParentLogin(): Promise<void> {
  await removeKidSessionKeys();
  localStorage.removeItem('user_mode');
  localStorage.removeItem('fgs_user_mode');
  dispatchChildSelectionCleared();
}

/**
 * Clear ALL authentication and session data
 * Called on logout
 */
export async function clearAllSessions(): Promise<void> {
  // CRITICAL SAFETY CHECK: BLOCK logout if in kid mode
  const userMode = localStorage.getItem('user_mode');
  const userRole = localStorage.getItem('user_role');
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
  
  // Force-clear any stale kid session data first
  await forceClearKidSessionForParentLogin();
  
  // Set parent session keys
  await setStorage(STORAGE_KEYS.USER_ID, userId);
  await setStorage(STORAGE_KEYS.USER_ROLE, 'parent');
  await setStorage(STORAGE_KEYS.USER_NAME, userName);
  await setStorage(STORAGE_KEYS.USER_EMAIL, userEmail);
  await setStorage(STORAGE_KEYS.USER_MODE, 'parent');
  
  // Backwards compatibility keys
  localStorage.setItem('user_role', 'parent');
  localStorage.setItem('user_mode', 'parent');
  localStorage.setItem('fgs_user_mode', 'parent');
  localStorage.setItem('fgs_user_id', userId);
  localStorage.setItem('fgs_user_name', userName);
  localStorage.removeItem('kid_access_token');
  localStorage.removeItem('kid_session_token');
  
  console.log('✅ Parent session set - dispatching roleChanged event');
  
  // Dispatch event to notify AuthContext
  window.dispatchEvent(new CustomEvent('roleChanged', {
    detail: { role: 'parent', userId }
  }));
}