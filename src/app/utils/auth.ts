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
  USER_ROLE: 'user_role' // NEW: Add USER_ROLE key
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
export function setKidMode(kidAccessToken: string, kid: { id: string; name: string; avatar: string; familyId: string }, familyCode: string) {
  console.log('🔐 setKidMode called with:', {
    hasToken: !!kidAccessToken,
    tokenLength: kidAccessToken?.length,
    kidId: kid.id,
    kidName: kid.name,
    kidAvatar: kid.avatar,
    familyCode
  });
  
  // Note: Global localStorage protection is installed in App.tsx
  // No need for duplicate protection here
  
  console.log('📝 Starting to write storage keys...');
  
  // CRITICAL VALIDATION: Ensure we have a valid access token
  if (!kidAccessToken) {
    console.error('❌ CRITICAL: setKidMode called with empty kidAccessToken!');
    throw new Error('Cannot set kid mode without access token (token is empty/null/undefined)');
  }
  
  if (typeof kidAccessToken !== 'string') {
    console.error('❌ CRITICAL: kidAccessToken is not a string!', {
      type: typeof kidAccessToken,
      value: kidAccessToken
    });
    throw new Error(`Cannot set kid mode - token must be a string, got ${typeof kidAccessToken}`);
  }
  
  if (kidAccessToken.length < 10) {
    console.error('❌ CRITICAL: kidAccessToken is too short!', {
      length: kidAccessToken.length,
      preview: kidAccessToken
    });
    throw new Error(`Cannot set kid mode - token is too short (${kidAccessToken.length} chars)`);
  }
  
  // CRITICAL VALIDATION: Ensure we have a familyId
  if (!kid.familyId) {
    console.error('❌ CRITICAL: setKidMode called without familyId!', kid);
    throw new Error('Cannot set kid mode without familyId');
  }
  
  console.log('✅ Token validation passed:', {
    tokenLength: kidAccessToken.length,
    tokenPreview: kidAccessToken.substring(0, 30) + '...',
    familyId: kid.familyId
  });
  
  // CRITICAL: Test localStorage write capability first
  console.log('🧪 Testing localStorage write capability...');
  try {
    localStorage.setItem('__test_write__', 'test_value');
    const testRead = localStorage.getItem('__test_write__');
    if (testRead !== 'test_value') {
      console.error('❌ CRITICAL: localStorage write failed silently!', {
        wrote: 'test_value',
        read: testRead
      });
      throw new Error('localStorage is not functioning correctly');
    }
    localStorage.removeItem('__test_write__');
    console.log('✅ localStorage write test passed');
  } catch (error) {
    console.error('❌ CRITICAL: localStorage is not available!', error);
    throw new Error('localStorage is not available - cannot store kid session');
  }
  
  // New storage keys
  console.log('📝 Writing to localStorage - STORAGE_KEYS.USER_MODE...');
  localStorage.setItem(STORAGE_KEYS.USER_MODE, 'kid');
  console.log('✅ Written USER_MODE, verifying...');
  const verifyUserMode = localStorage.getItem(STORAGE_KEYS.USER_MODE);
  console.log('   Read back:', verifyUserMode);
  if (verifyUserMode !== 'kid') {
    throw new Error(`USER_MODE verification failed: expected 'kid', got '${verifyUserMode}'`);
  }
  
  console.log('📝 Writing to localStorage - STORAGE_KEYS.KID_ACCESS_TOKEN...');
  console.log('   Token to write:', {
    length: kidAccessToken.length,
    preview: kidAccessToken.substring(0, 20),
    fullToken: kidAccessToken
  });
  localStorage.setItem(STORAGE_KEYS.KID_ACCESS_TOKEN, kidAccessToken);
  console.log('✅ Written KID_ACCESS_TOKEN, verifying...');
  const verifyKidAccessToken = localStorage.getItem(STORAGE_KEYS.KID_ACCESS_TOKEN);
  console.log('   Read back:', {
    exists: !!verifyKidAccessToken,
    length: verifyKidAccessToken?.length,
    preview: verifyKidAccessToken?.substring(0, 20),
    matches: verifyKidAccessToken === kidAccessToken
  });
  if (!verifyKidAccessToken || verifyKidAccessToken !== kidAccessToken) {
    throw new Error(`KID_ACCESS_TOKEN verification failed: token not stored correctly`);
  }
  
  console.log('📝 Writing to localStorage - STORAGE_KEYS.KID_ID...');
  localStorage.setItem(STORAGE_KEYS.KID_ID, kid.id);
  console.log('✅ Written KID_ID, verifying...');
  const verifyKidId = localStorage.getItem(STORAGE_KEYS.KID_ID);
  console.log('   Read back:', verifyKidId);
  if (verifyKidId !== kid.id) {
    throw new Error(`KID_ID verification failed: expected '${kid.id}', got '${verifyKidId}'`);
  }
  
  console.log('📝 Writing to localStorage - STORAGE_KEYS.KID_NAME...');
  localStorage.setItem(STORAGE_KEYS.KID_NAME, kid.name);
  console.log('✅ Written KID_NAME, verifying...');
  const verifyKidName = localStorage.getItem(STORAGE_KEYS.KID_NAME);
  console.log('   Read back:', verifyKidName);
  if (verifyKidName !== kid.name) {
    throw new Error(`KID_NAME verification failed: expected '${kid.name}', got '${verifyKidName}'`);
  }
  
  console.log('📝 Writing to localStorage - STORAGE_KEYS.KID_AVATAR...');
  localStorage.setItem(STORAGE_KEYS.KID_AVATAR, kid.avatar);
  console.log('✅ Written KID_AVATAR, verifying...');
  const verifyKidAvatar = localStorage.getItem(STORAGE_KEYS.KID_AVATAR);
  console.log('   Read back:', verifyKidAvatar);
  if (verifyKidAvatar !== kid.avatar) {
    throw new Error(`KID_AVATAR verification failed: expected '${kid.avatar}', got '${verifyKidAvatar}'`);
  }
  
  console.log('📝 Writing to localStorage - STORAGE_KEYS.KID_FAMILY_CODE...');
  localStorage.setItem(STORAGE_KEYS.KID_FAMILY_CODE, familyCode);
  console.log('✅ Written KID_FAMILY_CODE, verifying...');
  const verifyKidFamilyCode = localStorage.getItem(STORAGE_KEYS.KID_FAMILY_CODE);
  console.log('   Read back:', verifyKidFamilyCode);
  if (verifyKidFamilyCode !== familyCode) {
    throw new Error(`KID_FAMILY_CODE verification failed: expected '${familyCode}', got '${verifyKidFamilyCode}'`);
  }
  
  console.log('📝 Writing to localStorage - STORAGE_KEYS.FAMILY_ID...');
  localStorage.setItem(STORAGE_KEYS.FAMILY_ID, kid.familyId);
  console.log('✅ Written FAMILY_ID, verifying...');
  const verifyFamilyId = localStorage.getItem(STORAGE_KEYS.FAMILY_ID);
  console.log('   Read back:', verifyFamilyId);
  if (verifyFamilyId !== kid.familyId) {
    throw new Error(`FAMILY_ID verification failed: expected '${kid.familyId}', got '${verifyFamilyId}'`);
  }
  
  console.log('✅ All new storage keys written');
  
  // Backwards compatibility - also set old keys used by AuthContext
  console.log('📝 Writing backwards compatibility keys...');
  localStorage.setItem(STORAGE_KEYS.USER_ROLE, 'child'); // NEW: Use STORAGE_KEYS constant
  localStorage.setItem('user_role', 'child');
  localStorage.setItem('kid_session_token', kidAccessToken);
  localStorage.setItem('child_id', kid.id);
  localStorage.setItem('fgs_user_id', kid.id);
  localStorage.setItem('fgs_user_mode', 'kid');
  
  // Final verification of backwards compat keys
  const verifySessionToken = localStorage.getItem('kid_session_token');
  console.log('✅ Backwards compatibility keys set:', {
    hasKidSessionToken: !!verifySessionToken,
    sessionTokenLength: verifySessionToken?.length,
    hasChildId: !!localStorage.getItem('child_id'),
    hasUserRole: localStorage.getItem('user_role') === 'child',
    userRoleValue: localStorage.getItem('user_role')
  });
  
  // CRITICAL: Set up a watcher to detect if localStorage gets cleared
  console.log('🔐 Setting up localStorage watcher to detect clearing...');
  const watcherInterval = setInterval(() => {
    const currentToken = localStorage.getItem('kid_access_token');
    const currentRole = localStorage.getItem('user_role');
    
    if (!currentToken || currentRole !== 'child') {
      console.error('🚨 CRITICAL: Kid token was CLEARED after setKidMode completed!', {
        timestamp: new Date().toISOString(),
        hasToken: !!currentToken,
        userRole: currentRole,
        allKeys: Object.keys(localStorage).filter(k => 
          k.includes('kid') || k.includes('child') || k.includes('user') || k.includes('family')
        )
      });
      console.error('🚨 Stack trace:', new Error('localStorage cleared').stack);
      clearInterval(watcherInterval);
    }
  }, 50); // Check every 50ms for 5 seconds
  
  setTimeout(() => {
    clearInterval(watcherInterval);
    console.log('✅ localStorage watcher stopped - tokens still present:', {
      hasKidAccessToken: !!localStorage.getItem('kid_access_token'),
      hasKidSessionToken: !!localStorage.getItem('kid_session_token')
    });
  }, 5000); // Stop watching after 5 seconds
  
  // CRITICAL: Dispatch custom event to trigger AuthContext refresh
  // This ensures AuthContext picks up the new kid session immediately
  console.log('📢 Dispatching auth-changed event to trigger AuthContext refresh');
  window.dispatchEvent(new CustomEvent('auth-changed', { 
    detail: { type: 'kid-login', kidId: kid.id } 
  }));
  
  console.log('✅ setKidMode completed successfully!');
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
  // CRITICAL FIX: Check both 'fgs_user_mode' (new) and 'user_mode' (legacy)
  // The system sets 'fgs_user_mode' but some code was reading 'user_mode'
  const mode = localStorage.getItem('fgs_user_mode') || localStorage.getItem(STORAGE_KEYS.USER_MODE);
  if (mode === 'parent' || mode === 'kid') return mode;
  
  // Fallback: Check user_role if user_mode is not set
  const role = localStorage.getItem('user_role');
  if (role === 'parent') return 'parent';
  if (role === 'child') return 'kid';
  
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