/**
 * Authentication and Session Management Utilities
 * 
 * This module provides centralized functions for managing authentication state
 * and localStorage keys to prevent role conflicts between parent and kid sessions.
 */

/**
 * All localStorage keys used by the FGS application
 */
const STORAGE_KEYS = {
  // User/Auth keys
  USER_ID: 'fgs_user_id',
  USER_ROLE: 'user_role',
  USER_NAME: 'user_name',
  USER_EMAIL: 'user_email',
  USER_MODE: 'fgs_user_mode',
  
  // Legacy keys (kept for backwards compatibility)
  LEGACY_USER_ID: 'user_id',
  LEGACY_USER_NAME: 'fgs_user_name',
  LEGACY_USER_ROLE: 'fgs_user_role',
  
  // Family keys
  FAMILY_ID: 'fgs_family_id',
  
  // Kid-specific keys
  CHILD_ID: 'child_id',
  KID_PIN_SESSION: 'kid_pin_session',
  SELECTED_CHILD_ID: 'selected_child_id',
  LAST_ACTIVE_CHILD: 'last_active_child',
} as const;

/**
 * Clear all kid-specific session data
 * Called when parent logs in to ensure clean parent session
 */
export function clearKidSession() {
  console.log('🧹 Clearing kid session data...');
  
  localStorage.removeItem(STORAGE_KEYS.CHILD_ID);
  localStorage.removeItem(STORAGE_KEYS.KID_PIN_SESSION);
  localStorage.removeItem(STORAGE_KEYS.SELECTED_CHILD_ID);
  localStorage.removeItem(STORAGE_KEYS.LAST_ACTIVE_CHILD);
  
  // CRITICAL: Clear BOTH kid token keys to prevent API calls from using stale kid tokens
  localStorage.removeItem('kid_session_token'); // Clear the kid session token
  localStorage.removeItem('kid_access_token'); // ALSO clear kid access token
  localStorage.removeItem('kid_id'); // Also clear kid_id
  
  // CRITICAL: Also dispatch a storage event to notify FamilyContext
  // This ensures selectedChildId is cleared immediately when switching to parent mode
  window.dispatchEvent(new StorageEvent('storage', {
    key: STORAGE_KEYS.SELECTED_CHILD_ID,
    oldValue: localStorage.getItem(STORAGE_KEYS.SELECTED_CHILD_ID),
    newValue: null,
    url: window.location.href
  }));
  
  console.log('✅ Kid session cleared - removed all kid tokens and IDs');
}

/**
 * Set parent session after successful email/password login
 */
export function setParentSession(userId: string, name: string, email: string) {
  console.log('👨‍👩‍👧‍👦 Setting parent session for:', email);
  
  // Clear any existing kid session first
  clearKidSession();
  
  // Set user data
  localStorage.setItem(STORAGE_KEYS.USER_ID, userId);
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, 'parent');
  localStorage.setItem(STORAGE_KEYS.USER_NAME, name);
  localStorage.setItem(STORAGE_KEYS.USER_EMAIL, email);
  localStorage.setItem(STORAGE_KEYS.USER_MODE, 'parent');
  
  // CRITICAL: Also set user_mode for getCurrentMode() compatibility
  localStorage.setItem('user_mode', 'parent');
  
  // Also set legacy keys for backward compatibility
  localStorage.setItem(STORAGE_KEYS.LEGACY_USER_ID, userId);
  localStorage.setItem(STORAGE_KEYS.LEGACY_USER_NAME, name);
  localStorage.setItem(STORAGE_KEYS.LEGACY_USER_ROLE, 'parent');
  
  // Log what we just set
  console.log('✅ Parent session localStorage keys set:', {
    user_role: localStorage.getItem('user_role'),
    fgs_user_mode: localStorage.getItem('fgs_user_mode'),
    user_mode: localStorage.getItem('user_mode'),
    fgs_user_id: localStorage.getItem('fgs_user_id')
  });
  
  // Dispatch custom event to notify ViewModeContext and DashboardRouter
  console.log('📢 Dispatching roleChanged event...');
  window.dispatchEvent(new Event('roleChanged'));
  
  console.log('✅ Parent session set');
}

/**
 * Set kid session after successful PIN login
 */
export function setKidSession(childId: string, childName: string, familyId: string) {
  console.log('👶 Setting kid session for:', childName);
  
  // Set kid-specific data
  localStorage.setItem(STORAGE_KEYS.CHILD_ID, childId);
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, 'child');
  localStorage.setItem(STORAGE_KEYS.USER_NAME, childName);
  localStorage.setItem(STORAGE_KEYS.USER_MODE, 'child');
  
  // Keep family ID if not already set
  if (!localStorage.getItem(STORAGE_KEYS.FAMILY_ID)) {
    localStorage.setItem(STORAGE_KEYS.FAMILY_ID, familyId);
  }
  
  // Dispatch custom event to notify ViewModeContext
  window.dispatchEvent(new Event('roleChanged'));
  
  console.log('✅ Kid session set');
}

/**
 * Clear ALL authentication and session data
 * Called on logout
 */
export function clearAllSessions() {
  console.log('🧹 Clearing all sessions...');
  
  // Clear all user/auth keys
  localStorage.removeItem(STORAGE_KEYS.USER_ID);
  localStorage.removeItem(STORAGE_KEYS.USER_ROLE);
  localStorage.removeItem(STORAGE_KEYS.USER_NAME);
  localStorage.removeItem(STORAGE_KEYS.USER_EMAIL);
  localStorage.removeItem(STORAGE_KEYS.USER_MODE);
  
  // Clear legacy keys
  localStorage.removeItem(STORAGE_KEYS.LEGACY_USER_ID);
  localStorage.removeItem(STORAGE_KEYS.LEGACY_USER_NAME);
  localStorage.removeItem(STORAGE_KEYS.LEGACY_USER_ROLE);
  
  // Clear kid session
  clearKidSession();
  
  // Note: We intentionally DO NOT clear FAMILY_ID
  // This allows users to stay logged into the same family
  // even after logout/login cycles
  
  console.log('✅ All sessions cleared');
}

/**
 * Get the current user role from localStorage
 */
export function getCurrentRole(): 'parent' | 'child' | null {
  const role = localStorage.getItem(STORAGE_KEYS.USER_ROLE);
  if (role === 'parent' || role === 'child') {
    return role;
  }
  return null;
}

/**
 * Check if user has an active Supabase session
 * Returns true if we have user_id stored (indicating successful Supabase auth)
 */
export function hasSupabaseSession(): boolean {
  return !!localStorage.getItem(STORAGE_KEYS.USER_ID);
}

/**
 * Check if user is in kid mode
 */
export function isKidMode(): boolean {
  return localStorage.getItem(STORAGE_KEYS.USER_ROLE) === 'child';
}

/**
 * Check if user is in parent mode
 */
export function isParentMode(): boolean {
  return localStorage.getItem(STORAGE_KEYS.USER_ROLE) === 'parent';
}