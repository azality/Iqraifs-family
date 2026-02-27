/**
 * Authentication Utilities
 * 
 * Clean separation between Parent (Supabase JWT) and Kid (custom token) auth modes
 */

// ===== STORAGE KEYS =====
export const STORAGE_KEYS = {
  // Mode tracking
  USER_MODE: 'user_mode', // 'parent' | 'kid' | null
  
  // Parent mode (uses Supabase session - managed by Supabase SDK)
  // No custom localStorage needed - Supabase handles it
  
  // Kid mode
  KID_ACCESS_TOKEN: 'kid_access_token',
  KID_ID: 'kid_id',
  KID_NAME: 'kid_name',
  KID_AVATAR: 'kid_avatar',
  KID_FAMILY_CODE: 'kid_family_code',
  
  // Shared (persists across sessions)
  FAMILY_ID: 'fgs_family_id',
} as const;

export type UserMode = 'parent' | 'kid' | null;

// ===== PARENT AUTH =====

/**
 * Set parent mode after Supabase login
 * Note: Supabase session is managed by Supabase SDK automatically
 */
export function setParentMode(familyId: string): void {
  console.log('🔐 Setting parent mode');
  localStorage.setItem(STORAGE_KEYS.USER_MODE, 'parent');
  localStorage.setItem(STORAGE_KEYS.FAMILY_ID, familyId);
  
  // Backwards compatibility - also set old keys used by AuthContext
  localStorage.setItem('user_role', 'parent');
  localStorage.setItem('fgs_user_mode', 'parent');
  
  // Dispatch custom event to trigger AuthContext refresh
  console.log('📢 Dispatching auth-changed event to trigger AuthContext refresh');
  window.dispatchEvent(new CustomEvent('auth-changed', { 
    detail: { type: 'parent-login', familyId } 
  }));
}

/**
 * Get parent session from Supabase
 * Returns access token if valid session exists
 */
export async function getParentToken(): Promise<string | null> {
  // Import dynamically to avoid circular dependencies
  const { supabase } = await import('../../../utils/supabase/client');
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || null;
}

/**
 * Logout parent - clears Supabase session
 */
export async function logoutParent(): Promise<void> {
  console.log('🔐 Logging out parent');
  const { supabase } = await import('../../../utils/supabase/client');
  await supabase.auth.signOut();
  
  // Clear mode but keep family ID
  localStorage.removeItem(STORAGE_KEYS.USER_MODE);
  
  // Clear old keys (backwards compatibility)
  localStorage.removeItem('user_role');
  localStorage.removeItem('fgs_user_mode');
}

// ===== KID AUTH =====

/**
 * Set kid mode after successful kid login
 * 
 * CRITICAL: This function must ALWAYS set fgs_family_id in localStorage
 * to ensure FamilyContext can load the family data when kid logs in.
 * 
 * @param kidAccessToken - The kid's session token
 * @param kid - Kid info including id, name, avatar, and familyId
 * @param familyCode - The family's invite code
 */
export function setKidMode(
  kidAccessToken: string,
  kid: {
    id: string;
    name: string;
    avatar: string;
    familyId: string;
  },
  familyCode: string
): void {
  console.log('🔐 Setting kid mode for:', kid.name);
  
  // CRITICAL VALIDATION: Ensure we have a familyId
  if (!kid.familyId) {
    console.error('❌ CRITICAL: setKidMode called without familyId!', kid);
    throw new Error('Cannot set kid mode without familyId');
  }
  
  // New storage keys
  localStorage.setItem(STORAGE_KEYS.USER_MODE, 'kid');
  localStorage.setItem(STORAGE_KEYS.KID_ACCESS_TOKEN, kidAccessToken);
  localStorage.setItem(STORAGE_KEYS.KID_ID, kid.id);
  localStorage.setItem(STORAGE_KEYS.KID_NAME, kid.name);
  localStorage.setItem(STORAGE_KEYS.KID_AVATAR, kid.avatar);
  localStorage.setItem(STORAGE_KEYS.KID_FAMILY_CODE, familyCode);
  localStorage.setItem(STORAGE_KEYS.FAMILY_ID, kid.familyId);
  
  // CRITICAL: Verify fgs_family_id was set correctly
  const verifyFamilyId = localStorage.getItem('fgs_family_id');
  if (verifyFamilyId !== kid.familyId) {
    console.error('❌ CRITICAL: fgs_family_id was not set correctly!', {
      expected: kid.familyId,
      actual: verifyFamilyId
    });
    throw new Error('Failed to set fgs_family_id in localStorage');
  }
  
  console.log('✅ Family ID set successfully:', kid.familyId);
  
  // Backwards compatibility - also set old keys used by AuthContext
  localStorage.setItem('user_role', 'child');
  localStorage.setItem('kid_session_token', kidAccessToken);
  localStorage.setItem('child_id', kid.id);
  localStorage.setItem('fgs_user_id', kid.id);
  localStorage.setItem('fgs_user_mode', 'kid');
  
  // CRITICAL: Dispatch custom event to trigger AuthContext refresh
  // This ensures AuthContext picks up the new kid session immediately
  console.log('📢 Dispatching auth-changed event to trigger AuthContext refresh');
  window.dispatchEvent(new CustomEvent('auth-changed', { 
    detail: { type: 'kid-login', kidId: kid.id } 
  }));
}

/**
 * Get kid access token if in kid mode
 */
export function getKidToken(): string | null {
  const mode = localStorage.getItem(STORAGE_KEYS.USER_MODE);
  if (mode !== 'kid') return null;
  
  return localStorage.getItem(STORAGE_KEYS.KID_ACCESS_TOKEN);
}

/**
 * Get current kid info
 */
export function getKidInfo(): {
  id: string;
  name: string;
  avatar: string;
  familyCode: string;
} | null {
  const mode = localStorage.getItem(STORAGE_KEYS.USER_MODE);
  if (mode !== 'kid') return null;
  
  const id = localStorage.getItem(STORAGE_KEYS.KID_ID);
  const name = localStorage.getItem(STORAGE_KEYS.KID_NAME);
  const avatar = localStorage.getItem(STORAGE_KEYS.KID_AVATAR);
  const familyCode = localStorage.getItem(STORAGE_KEYS.KID_FAMILY_CODE);
  
  if (!id || !name) return null;
  
  return { id, name, avatar: avatar || '👶', familyCode: familyCode || '' };
}

/**
 * Logout kid - clears kid session only
 */
export function logoutKid(): void {
  console.log('🔐 Logging out kid');
  
  // Clear new keys
  localStorage.removeItem(STORAGE_KEYS.USER_MODE);
  localStorage.removeItem(STORAGE_KEYS.KID_ACCESS_TOKEN);
  localStorage.removeItem(STORAGE_KEYS.KID_ID);
  localStorage.removeItem(STORAGE_KEYS.KID_NAME);
  localStorage.removeItem(STORAGE_KEYS.KID_AVATAR);
  localStorage.removeItem(STORAGE_KEYS.KID_FAMILY_CODE);
  
  // Clear old keys (backwards compatibility)
  localStorage.removeItem('user_role');
  localStorage.removeItem('kid_session_token');
  localStorage.removeItem('child_id');
  localStorage.removeItem('fgs_user_mode');
  
  // Keep FAMILY_ID and fgs_user_id for future logins
}

// ===== SHARED UTILITIES =====

/**
 * Get current mode
 */
export function getCurrentMode(): UserMode {
  const mode = localStorage.getItem(STORAGE_KEYS.USER_MODE);
  if (mode === 'parent' || mode === 'kid') return mode;
  return null;
}

/**
 * Get family ID (persists across sessions)
 */
export function getFamilyId(): string | null {
  return localStorage.getItem(STORAGE_KEYS.FAMILY_ID);
}

/**
 * Check if user is authenticated (either parent or kid)
 */
export async function isAuthenticated(): Promise<boolean> {
  const mode = getCurrentMode();
  
  if (mode === 'parent') {
    const token = await getParentToken();
    return !!token;
  }
  
  if (mode === 'kid') {
    const token = getKidToken();
    return !!token;
  }
  
  return false;
}

/**
 * Get the appropriate auth token for API calls
 */
export async function getAuthToken(): Promise<{
  token: string | null;
  type: 'parent' | 'kid';
}> {
  const mode = getCurrentMode();
  
  if (mode === 'parent') {
    const token = await getParentToken();
    return { token, type: 'parent' };
  }
  
  if (mode === 'kid') {
    const token = getKidToken();
    return { token, type: 'kid' };
  }
  
  return { token: null, type: 'parent' };
}

/**
 * Logout current user (regardless of mode)
 */
export async function logout(): Promise<void> {
  const mode = getCurrentMode();
  
  if (mode === 'parent') {
    await logoutParent();
  } else if (mode === 'kid') {
    logoutKid();
  }
  
  console.log('✅ Logged out successfully');
}

/**
 * Clear all auth data (including family ID) - for testing only
 */
export function clearAllAuth(): void {
  console.warn('⚠️ Clearing ALL auth data including family ID');
  Object.values(STORAGE_KEYS).forEach(key => {
    localStorage.removeItem(key);
  });
}