/**
 * AuthContext - Production-Ready Async Storage Version
 * 
 * This version uses Capacitor Preferences for native iOS storage,
 * ensuring auth persistence works reliably on iOS devices.
 */

import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { supabase } from '../../../utils/supabase/client';
import { clearAllSessions, getCurrentRole, hasSupabaseSession } from '../utils/authHelpers';
import { getStorageSync, setStorageSync, removeStorageSync, getMultipleSync, STORAGE_KEYS } from '../../utils/storage';

export type UserRole = 'parent' | 'child';

interface User {
  id: string;
  name: string;
  email?: string;
}

interface AuthContextType {
  role: UserRole;
  isParentMode: boolean;
  /**
   * Set the current role to 'child'. Does NOT start a kid session — that's
   * kidLogin's job. Use this only when a real kid session already exists.
   */
  switchToChildMode: () => void;
  accessToken: string | null;
  userId: string | null;
  user: User | null;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Track if we're currently refreshing to prevent concurrent refreshes
  const isRefreshing = useRef(false);
  const refreshPromise = useRef<Promise<void> | null>(null);
  const hasInitialized = useRef(false);
  
  // CRITICAL: Add session cache to prevent concurrent getSession() calls
  const sessionCache = useRef<{
    session: any;
    timestamp: number;
  } | null>(null);
  const SESSION_CACHE_TTL = 30_000; // Cache session for 30 seconds
  
  // State - Initialize with null, load from storage in useEffect
  const [userId, setUserIdState] = useState<string | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRoleState] = useState<UserRole>('parent');
  const [user, setUser] = useState<User | null>(null);
  
  const isParentMode = role === 'parent';

  // Helper function to get session with caching
  const getCachedSession = async () => {
    const now = Date.now();
    
    // Return cached session if it's still fresh
    if (sessionCache.current && (now - sessionCache.current.timestamp) < SESSION_CACHE_TTL) {
      console.log('🔄 Using cached Supabase session');
      return sessionCache.current.session;
    }
    
    // Fetch fresh session
    console.log('🌐 Fetching fresh Supabase session');
    const { data: { session }, error } = await supabase.auth.getSession();
    
    // Cache the result
    sessionCache.current = {
      session: { session, error },
      timestamp: now
    };
    
    return { session, error };
  };

  // Helper to update userId with storage persistence
  const setUserId = async (id: string | null) => {
    console.log('AuthContext - Setting userId:', id);
    setUserIdState(id);
    if (id) {
      setStorageSync(STORAGE_KEYS.USER_ID, id);
    } else {
      removeStorageSync(STORAGE_KEYS.USER_ID);
    }
  };

  // Helper to update role with storage persistence
  const setRole = async (newRole: UserRole) => {
    console.log('AuthContext - Setting role:', newRole);
    setRoleState(newRole);
    setStorageSync(STORAGE_KEYS.USER_MODE, newRole);
  };

  // Load initial auth state from storage
  useEffect(() => {
    const loadInitialState = async () => {
      console.log('🔄 AuthContext: Loading initial state from storage...');
      
      try {
        // Load all auth-related values in parallel
        const stored = getMultipleSync([
          STORAGE_KEYS.USER_ID,
          STORAGE_KEYS.USER_ROLE,
          STORAGE_KEYS.USER_MODE,
          STORAGE_KEYS.USER_NAME,
          STORAGE_KEYS.USER_EMAIL,
          'fgs_user_name' // Legacy key
        ]);

        console.log('📦 Loaded from storage:', {
          userId: stored[STORAGE_KEYS.USER_ID] ? '✓' : '✗',
          userRole: stored[STORAGE_KEYS.USER_ROLE],
          userMode: stored[STORAGE_KEYS.USER_MODE]
        });

        // Set userId if available
        if (stored[STORAGE_KEYS.USER_ID]) {
          setUserIdState(stored[STORAGE_KEYS.USER_ID]);
        }

        // Determine role
        let initialRole: UserRole = 'parent';
        
        if (stored[STORAGE_KEYS.USER_ROLE] === 'child') {
          initialRole = 'child';
        } else if (stored[STORAGE_KEYS.USER_ROLE] === 'parent') {
          initialRole = 'parent';
        } else if (stored[STORAGE_KEYS.USER_ID]) {
          // If we have a Supabase user ID, default to parent
          initialRole = 'parent';
        } else if (stored[STORAGE_KEYS.USER_MODE] === 'child') {
          initialRole = 'child';
        }
        
        setRoleState(initialRole);
        console.log('🔐 AuthContext: Initial role determined:', initialRole);

        // Set user object if we have user data
        if (stored[STORAGE_KEYS.USER_ID]) {
          const userName = stored[STORAGE_KEYS.USER_NAME] || stored['fgs_user_name'] || 'User';
          const userEmail = stored[STORAGE_KEYS.USER_EMAIL];
          
          setUser({
            id: stored[STORAGE_KEYS.USER_ID],
            name: userName,
            email: userEmail || undefined
          });
        }

        hasInitialized.current = true;
      } catch (error) {
        console.error('❌ Error loading initial auth state:', error);
        hasInitialized.current = true;
      }
    };

    loadInitialState();
  }, []);

  // Function to refresh the session and update token
  const refreshSession = async () => {
    // If already refreshing, return the existing promise
    if (isRefreshing.current && refreshPromise.current) {
      console.log('⏳ Session refresh already in progress, waiting...');
      return refreshPromise.current;
    }

    // Create new refresh promise
    isRefreshing.current = true;
    refreshPromise.current = (async () => {
      try {
        // Check if user is in kid mode
        const userRole = getStorageSync(STORAGE_KEYS.USER_ROLE);

        if (userRole === 'child') {
          // Kid mode: Use kid session token
          const kidToken = getStorageSync(STORAGE_KEYS.KID_SESSION_TOKEN);
          console.log('👶 Kid mode detected, using kid session token:', !!kidToken);

          if (kidToken) {
            setAccessTokenState(kidToken);
            const childId = getStorageSync(STORAGE_KEYS.CHILD_ID);
            await setUserId(childId);
          } else {
            console.log('❌ No kid session token found');
            setAccessTokenState(null);
            await setUserId(null);
          }
          setIsLoading(false);
          return;
        }

        // Parent mode: Use Supabase session.
        //
        // refreshSession is an EXPLICIT "give me fresh state" call (e.g. right
        // after signInWithPassword). We must bypass the 30s session cache here
        // or we'll hit a stale post-logout null and nuke the fresh login. We
        // still update the cache afterward so other callers get the benefit.
        console.log('👨‍👩‍👧‍👦 Parent mode detected, using Supabase session (bypassing cache)...');
        sessionCache.current = null;
        const { data: { session }, error } = await supabase.auth.getSession();
        sessionCache.current = {
          session: { session, error },
          timestamp: Date.now(),
        };
        
        if (error) {
          // Same rule as the no-session branch below: a transient Supabase
          // error must NOT wipe persisted auth keys, or a post-login cache
          // race bounces the user back to /parent-login. Storage clears
          // belong to the explicit logout path. Note: we call the raw
          // setUserIdState (not the setUserId helper) so we only clear
          // in-memory state — the helper would also remove fgs_user_id.
          console.error('Session refresh error (storage preserved):', error);
          setAccessTokenState(null);
          setUserIdState(null);
          setIsLoading(false);
          return;
        }

        if (session?.access_token) {
          // CRITICAL: Validate that token is not the string "null" or other invalid values
          const token = session.access_token;
          const isValidToken = token && 
                               token !== 'null' && 
                               token !== 'undefined' && 
                               token.length > 20 &&
                               token.split('.').length === 3; // JWT has 3 parts
          
          if (!isValidToken) {
            console.error('❌ Invalid token detected in Supabase session:', {
              token: token?.substring(0, 50),
              isNullString: token === 'null',
              length: token?.length,
              parts: token?.split('.').length
            });
            
            // CRITICAL FIX: Check if we're in kid mode before clearing sessions
            const userMode = getStorageSync('user_mode');
            const userRole = getStorageSync('user_role');
            const isKidMode = userMode === 'kid' || userRole === 'child';
            
            console.log('🔍 Checking if kid mode before clearing:', {
              userMode,
              userRole,
              isKidMode
            });
            
            if (isKidMode) {
              console.log('👶 Kid mode detected - skipping Supabase session clear to preserve kid session');
              setAccessTokenState(null);
              setIsLoading(false);
              return;
            }
            
            // Only clear sessions if NOT in kid mode
            // Force sign out to clear corrupted PARENT session
            console.log('🧹 Signing out to clear corrupted Supabase PARENT session');
            await supabase.auth.signOut();
            setAccessTokenState(null);
            await setUserId(null);
            await clearAllSessions();
            setIsLoading(false);
            return;
          }
          
          console.log('Session refreshed successfully:', {
            userId: session.user?.id,
            tokenPreview: session.access_token.substring(0, 20),
            expiresAt: new Date(session.expires_at! * 1000).toISOString()
          });
          setAccessTokenState(session.access_token);
          await setUserId(session.user?.id || null);
          
          // Update user object
          if (session.user?.id) {
            const userName = getStorageSync(STORAGE_KEYS.USER_NAME) || 
                           getStorageSync('fgs_user_name') || 
                           'User';
            const userEmail = getStorageSync(STORAGE_KEYS.USER_EMAIL);
            
            setUser({
              id: session.user.id,
              name: userName,
              email: userEmail || undefined
            });
          }
        } else {
          // No active Supabase session. Reflect that in local auth state but
          // DO NOT touch persisted storage keys (fgs_user_id, user_role).
          // That's a race-bomb: right after signInWithPassword writes those
          // keys, a stale no-session read would nuke them and bounce the
          // user back to /parent-login. Storage is cleared authoritatively
          // by logout() → clearAllSessions(). Stale in-memory state on its
          // own does no harm — the next explicit refresh will fix it.
          // NOTE: call the raw setUserIdState (not setUserId) so we only
          // clear memory — the helper also removes fgs_user_id.
          console.log('No active session found - clearing in-memory auth (storage preserved)');
          setAccessTokenState(null);
          setUserIdState(null);
          setUser(null);
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Error refreshing session:', error);
        // Same rule as above: wipe in-memory state, leave storage alone.
        // The authoritative storage clear path is logout().
        console.log('🧹 Clearing in-memory session after exception (storage preserved)');
        setAccessTokenState(null);
        setUserIdState(null);
        setUser(null);
        setIsLoading(false);
      } finally {
        isRefreshing.current = false;
        refreshPromise.current = null;
      }
    })();

    return refreshPromise.current;
  };

  // Check and refresh session on mount and periodically
  useEffect(() => {
    // Wait for initial state to load
    if (!hasInitialized.current) {
      console.log('⏳ Waiting for initial state to load...');
      return;
    }

    // Initial session check
    console.log('🔄 AuthContext: Starting initial session check...');
    
    // Check if we should be on login page
    const checkSessionAndRedirect = async () => {
      // CRITICAL: Check if user is in kid mode FIRST
      const userRole = getStorageSync(STORAGE_KEYS.USER_ROLE);
      
      if (userRole === 'child') {
        console.log('👶 Kid mode detected in checkSessionAndRedirect - skipping Supabase session check');
        // Skip Supabase checks for kid mode - just refresh kid session
        await refreshSession();
        return;
      }
      
      // Parent mode: Check Supabase session
      const { session, error } = await getCachedSession();
      
      // If no session and we have user_id in storage, it means session expired
      // BUT: Only redirect if NOT in kid mode (kids don't use Supabase sessions)
      // AND: Don't redirect if we're already on a login page
      const storedUserId = getStorageSync(STORAGE_KEYS.USER_ID);
      const userMode = getStorageSync('user_mode');
      const isOnLoginPage = window.location.pathname.includes('login') || 
                            window.location.pathname.includes('signup') ||
                            window.location.pathname.includes('welcome');
      
      if (storedUserId && (!session || error) && userMode !== 'kid' && !isOnLoginPage) {
        console.log('🚨 Parent session expired but user_id exists - redirecting to login');
        await clearAllSessions();
        window.location.replace('/parent-login');
        return;
      }
      
      // Continue with normal refresh
      await refreshSession();
    };
    
    checkSessionAndRedirect();

    // Set up periodic token refresh (every 30 minutes)
    const refreshInterval = setInterval(async () => {
      const userRole = getStorageSync(STORAGE_KEYS.USER_ROLE);
      
      if (userRole === 'parent') {
        console.log('🔄 Periodic token refresh (30min)...');
        const { session, error } = await getCachedSession();
        
        if (session?.access_token) {
          console.log('✅ Token refreshed automatically');
          setAccessTokenState(session.access_token);
        } else if (error) {
          console.error('❌ Token refresh failed:', error);
          // Try to refresh the session
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            await refreshSession();
          }
        }
      }
    }, 30 * 60 * 1000); // 30 minutes

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 Auth state changed:', event, {
          hasSession: !!session,
          userId: session?.user?.id,
          hasToken: !!session?.access_token,
          tokenPreview: session?.access_token ? session.access_token.substring(0, 30) + '...' : 'none'
        });

        // CRITICAL: keep the session cache in sync with the real Supabase
        // state on EVERY auth event. Without this, a post-logout null can
        // linger in the cache for 30s and overwrite a fresh post-login state
        // when something (e.g. ParentLogin) calls refreshSession().
        sessionCache.current = {
          session: { session, error: null },
          timestamp: Date.now(),
        };

        if (session?.access_token) {
          console.log('✅ Setting accessToken from auth state change');
          setAccessTokenState(session.access_token);
          await setUserId(session.user?.id || null);
          setIsLoading(false);
        } else if (event === 'SIGNED_OUT') {
          console.log('🚪 User signed out - clearing tokens');
          setAccessTokenState(null);
          await setUserId(null);
          setUser(null);
          setIsLoading(false);
          
          // Redirect to login if we're not already there
          if (!window.location.pathname.includes('login') && !window.location.pathname.includes('welcome')) {
            console.log('🚪 Redirecting to login after sign out');
            window.location.replace('/parent-login');
          }
        }
      }
    );

    // CRITICAL: Listen for custom auth-changed event from kid login
    const handleAuthChanged = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('📢 Received auth-changed event:', customEvent.detail);
      // Immediately refresh session to pick up new kid token
      refreshSession();
    };
    
    window.addEventListener('auth-changed', handleAuthChanged);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener('auth-changed', handleAuthChanged);
      clearInterval(refreshInterval);
    };
  }, [hasInitialized.current]); // Re-run when initialization completes

  // Sync role with user_role from storage when it changes
  useEffect(() => {
    const syncRole = async () => {
      const userRole = getStorageSync(STORAGE_KEYS.USER_ROLE);
      console.log('🔄 Syncing role from storage:', { userRole, currentRole: role });
      
      if (userRole === 'parent' && role !== 'parent') {
        console.log('✅ Updating role to parent');
        setRoleState('parent');
      } else if (userRole === 'child' && role !== 'child') {
        console.log('✅ Updating role to child');
        setRoleState('child');
      }
    };

    // Check immediately
    syncRole();

    // Listen for roleChanged event (fired by setParentSession/setKidSession)
    window.addEventListener('roleChanged', syncRole);
    
    // Also check when storage changes (e.g., after login in another tab)
    window.addEventListener('storage', syncRole);
    
    return () => {
      window.removeEventListener('roleChanged', syncRole);
      window.removeEventListener('storage', syncRole);
    };
  }, [role]);
  
  // Re-fetch token when role changes (e.g., switching between parent/kid mode)
  useEffect(() => {
    if (!hasInitialized.current) return;
    
    console.log('🔄 Role changed, refreshing session...', role);
    refreshSession();
  }, [role]);

  const switchToChildMode = () => {
    setRoleState('child');
  };

  const logout = async () => {
    console.log('Logging out...');
    // Drop the cached session before we actually sign out so nothing
    // downstream can read a stale handle during the logout → login cycle.
    sessionCache.current = null;
    await supabase.auth.signOut();
    await clearAllSessions();
    setAccessTokenState(null);
    await setUserId(null);
    setUser(null);
    setRoleState('parent');
  };

  return (
    <AuthContext.Provider value={{
      role,
      isParentMode,
      switchToChildMode,
      accessToken,
      userId,
      user,
      refreshSession,
      logout,
      isLoading
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    // Enhanced error message to help debug where this is being called from
    console.error('❌ useAuth called outside AuthProvider!');
    console.error('Stack trace:', new Error().stack);
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}