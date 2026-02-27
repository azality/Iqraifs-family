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
 * Clear all kid-specific session data
 * Called when parent logs in to ensure clean parent session
 */
export async function clearKidSession(): Promise<void> {
  console.log('🧹 Clearing kid session data...');
  
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
  
  console.log('✅ Kid session cleared - removed all kid tokens and IDs');
}

/**
 * Set parent session after successful email/password login
 */
export async function setParentSession(userId: string, name: string, email: string): Promise<void> {
  console.log('👨‍👩‍👧‍👦 Setting parent session for:', email);
  
  // Clear any existing kid session first
  await clearKidSession();
  
  // Set user data in parallel for performance
  await Promise.all([
    setStorage(STORAGE_KEYS.USER_ID, userId),
    setStorage(STORAGE_KEYS.USER_ROLE, 'parent'),
    setStorage(STORAGE_KEYS.USER_NAME, name),
    setStorage(STORAGE_KEYS.USER_EMAIL, email),
    setStorage(STORAGE_KEYS.USER_MODE, 'parent'),
    setStorage('user_mode', 'parent'), // For getCurrentMode() compatibility
    // Legacy keys for backward compatibility
    setStorage('user_id', userId),
    setStorage('fgs_user_name', name),
    setStorage('fgs_user_role', 'parent')
  ]);
  
  // Log what we just set
  console.log('✅ Parent session storage keys set:', {
    user_role: await getStorage(STORAGE_KEYS.USER_ROLE),
    fgs_user_mode: await getStorage(STORAGE_KEYS.USER_MODE),
    user_mode: await getStorage('user_mode'),
    fgs_user_id: await getStorage(STORAGE_KEYS.USER_ID)
  });
  
  // Dispatch custom event to notify ViewModeContext and DashboardRouter
  console.log('📢 Dispatching roleChanged event...');
  window.dispatchEvent(new Event('roleChanged'));
  
  console.log('✅ Parent session set');
}

/**
 * Set kid session after successful PIN login
 */
export async function setKidSession(childId: string, childName: string, familyId: string): Promise<void> {
  console.log('👶 Setting kid session for:', childName);
  
  // Set kid-specific data in parallel
  const operations = [
    setStorage(STORAGE_KEYS.CHILD_ID, childId),
    setStorage(STORAGE_KEYS.USER_ROLE, 'child'),
    setStorage(STORAGE_KEYS.USER_NAME, childName),
    setStorage(STORAGE_KEYS.USER_MODE, 'child')
  ];
  
  // Keep family ID if not already set
  const existingFamilyId = await getStorage(STORAGE_KEYS.FAMILY_ID);
  if (!existingFamilyId) {
    operations.push(setStorage(STORAGE_KEYS.FAMILY_ID, familyId));
  }
  
  await Promise.all(operations);
  
  // Dispatch custom event to notify ViewModeContext
  window.dispatchEvent(new Event('roleChanged'));
  
  console.log('✅ Kid session set');
}

/**
 * Clear ALL authentication and session data
 * Called on logout
 */
export async function clearAllSessions(): Promise<void> {
  console.log('🧹 Clearing all sessions...');
  
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
  
  // Clear kid session
  await clearKidSession();
  
  // Note: We intentionally DO NOT clear FAMILY_ID
  // This allows users to stay logged into the same family
  // even after logout/login cycles
  
  console.log('✅ All sessions cleared');
}

/**
 * Get the current user role from storage
 */
export async function getCurrentRole(): Promise<'parent' | 'child' | null> {
  const role = await getStorage(STORAGE_KEYS.USER_ROLE);
  if (role === 'parent' || role === 'child') {
    return role;
  }
  return null;
}

/**
 * Check if user has an active Supabase session
 * Returns true if we have user_id stored (indicating successful Supabase auth)
 */
export async function hasSupabaseSession(): Promise<boolean> {
  const userId = await getStorage(STORAGE_KEYS.USER_ID);
  return !!userId;
}

/**
 * Check if user is in kid mode
 */
export async function isKidMode(): Promise<boolean> {
  const role = await getStorage(STORAGE_KEYS.USER_ROLE);
  return role === 'child';
}

/**
 * Check if user is in parent mode
 */
export async function isParentMode(): Promise<boolean> {
  const role = await getStorage(STORAGE_KEYS.USER_ROLE);
  return role === 'parent';
}

/**
 * SYNC VERSION: Get current role synchronously (for useState initializers)
 * ⚠️ This uses localStorage directly and won't work reliably on iOS
 * Only use this for initial state - use getCurrentRole() for runtime checks
 */
export function getCurrentRoleSync(): 'parent' | 'child' | null {
  // Direct localStorage access for sync initialization
  const role = localStorage.getItem(STORAGE_KEYS.USER_ROLE);
  if (role === 'parent' || role === 'child') {
    return role;
  }
  return null;
}