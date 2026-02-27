import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { supabase } from '../../../utils/supabase/client';
import { clearAllSessions, getCurrentRole, hasSupabaseSession } from '../utils/authHelpers';

export type UserRole = 'parent' | 'child';

interface User {
  id: string;
  name: string;
  email?: string;
}

interface AuthContextType {
  role: UserRole;
  isParentMode: boolean;
  requestParentAccess: (password: string) => boolean;
  switchToChildMode: () => void;
  switchToParentMode: (password: string) => boolean;
  accessToken: string | null;
  userId: string | null;
  user: User | null;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Simple password - in production, this would be stored securely
const PARENT_PASSWORD = '1234'; // Parents can change this

export function AuthProvider({ children }: { children: ReactNode }) {
  // Track if we're currently refreshing to prevent concurrent refreshes
  const isRefreshing = useRef(false);
  const refreshPromise = useRef<Promise<void> | null>(null);
  
  // Remove separate token state - we'll get it from Supabase session on demand
  const [userId, setUserIdState] = useState<string | null>(() => {
    const stored = localStorage.getItem('fgs_user_id');
    console.log('AuthContext Init - UserId from localStorage:', stored);
    return stored;
  });
  
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true); // Start as loading

  const setUserId = (id: string | null) => {
    console.log('AuthContext - Setting userId:', id);
    setUserIdState(id);
    if (id) {
      localStorage.setItem('fgs_user_id', id);
    } else {
      localStorage.removeItem('fgs_user_id');
    }
  };

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
        const userRole = localStorage.getItem('user_role');
        
        if (userRole === 'child') {
          // Kid mode: Use kid session token
          const kidToken = localStorage.getItem('kid_session_token');
          console.log('👶 Kid mode detected, using kid session token:', !!kidToken);
          
          if (kidToken) {
            setAccessTokenState(kidToken);
            const childId = localStorage.getItem('child_id');
            setUserId(childId);
          } else {
            console.log('❌ No kid session token found');
            setAccessTokenState(null);
            setUserId(null);
          }
          setIsLoading(false);
          return;
        }
        
        // Parent mode: Use Supabase session
        console.log('👨‍👩‍👧‍👦 Parent mode detected, using Supabase session...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('Session refresh error:', error);
          // Clear any stale session data (ONLY for parent mode)
          console.log('🧹 Clearing stale parent session data due to error');
          setAccessTokenState(null);
          setUserId(null);
          // Only remove these if we're actually in parent mode
          if (userRole === 'parent') {
            localStorage.removeItem('fgs_user_id');
            localStorage.removeItem('user_role');
          }
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
            
            // Force sign out to clear corrupted session
            console.log('🧹 Signing out to clear corrupted Supabase session');
            await supabase.auth.signOut();
            setAccessTokenState(null);
            setUserId(null);
            localStorage.clear();
            setIsLoading(false);
            return;
          }
          
          console.log('Session refreshed successfully:', {
            userId: session.user?.id,
            tokenPreview: session.access_token.substring(0, 20),
            expiresAt: new Date(session.expires_at! * 1000).toISOString()
          });
          setAccessTokenState(session.access_token);
          setUserId(session.user?.id || null);
        } else {
          console.log('No active session found - clearing all auth data');
          // Clear stored tokens if no session exists (ONLY for parent mode)
          setAccessTokenState(null);
          setUserId(null);
          // Only remove these if we're actually in parent mode
          if (userRole === 'parent' || !userRole) {
            localStorage.removeItem('fgs_user_id');
            localStorage.removeItem('user_role');
          }
        }
        setIsLoading(false);
      } catch (error) {
        console.error('Error refreshing session:', error);
        // Clear stale data on error (ONLY for parent mode)
        console.log('🧹 Clearing stale session data due to exception');
        setAccessTokenState(null);
        setUserId(null);
        // Only remove these if we're actually in parent mode
        const currentUserRole = localStorage.getItem('user_role');
        if (currentUserRole === 'parent' || !currentUserRole) {
          localStorage.removeItem('fgs_user_id');
          localStorage.removeItem('user_role');
        }
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
    // Initial session check
    console.log('🔄 AuthContext: Starting initial session check...');
    
    // Check if we should be on login page
    const checkSessionAndRedirect = async () => {
      // CRITICAL: Check if user is in kid mode FIRST
      const userRole = localStorage.getItem('user_role');
      
      if (userRole === 'child') {
        console.log('👶 Kid mode detected in checkSessionAndRedirect - skipping Supabase session check');
        // Skip Supabase checks for kid mode - just refresh kid session
        await refreshSession();
        return;
      }
      
      // Parent mode: Check Supabase session
      const { data: { session }, error } = await supabase.auth.getSession();
      
      // If no session and we have user_id in localStorage, it means session expired
      // BUT: Only redirect if NOT in kid mode (kids don't use Supabase sessions)
      const storedUserId = localStorage.getItem('fgs_user_id');
      const userMode = localStorage.getItem('user_mode');
      if (storedUserId && (!session || error) && userMode !== 'kid') {
        console.log('🚨 Parent session expired but user_id exists - redirecting to login');
        localStorage.clear();
        window.location.replace('/parent-login');
        return;
      }
      
      // Continue with normal refresh
      await refreshSession();
    };
    
    checkSessionAndRedirect();

    // Set up periodic token refresh (every 30 minutes)
    const refreshInterval = setInterval(async () => {
      const userRole = localStorage.getItem('user_role');
      
      if (userRole === 'parent') {
        console.log('🔄 Periodic token refresh (30min)...');
        const { data: { session }, error } = await supabase.auth.getSession();
        
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

        if (session?.access_token) {
          console.log('✅ Setting accessToken from auth state change');
          setAccessTokenState(session.access_token);
          setUserId(session.user?.id || null);
          setIsLoading(false);
        } else if (event === 'SIGNED_OUT') {
          console.log('🚪 User signed out - clearing tokens');
          setAccessTokenState(null);
          setUserId(null);
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
  }, []);

  const [role, setRole] = useState<UserRole>(() => {
    // Check user_role from localStorage (set during login)
    const userRole = localStorage.getItem('user_role');
    console.log('🔐 AuthContext Init - Determining initial role:', { userRole });
    
    if (userRole === 'parent') {
      return 'parent';
    }
    if (userRole === 'child') {
      return 'child';
    }
    
    // Fallback: If we have a Supabase user session, default to parent
    // Kids never have Supabase sessions - they use PIN only
    const userId = localStorage.getItem('fgs_user_id');
    if (userId) {
      console.log('✅ Found Supabase user ID, defaulting to parent mode');
      return 'parent';
    }
    
    // Final fallback
    const saved = localStorage.getItem('fgs_user_mode');
    return (saved === 'parent' || saved === 'child') ? saved : 'parent';
  });
  
  const isParentMode = role === 'parent';

  useEffect(() => {
    localStorage.setItem('fgs_user_mode', role);
  }, [role]);

  // Sync role with user_role from localStorage when it changes
  useEffect(() => {
    const syncRole = () => {
      const userRole = localStorage.getItem('user_role');
      console.log('🔄 Syncing role from localStorage:', { userRole, currentRole: role });
      
      if (userRole === 'parent' && role !== 'parent') {
        console.log('✅ Updating role to parent');
        setRole('parent');
      } else if (userRole === 'child' && role !== 'child') {
        console.log('✅ Updating role to child');
        setRole('child');
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
    console.log('🔄 Role changed, refreshing session...', role);
    refreshSession();
  }, [role]);

  const requestParentAccess = (password: string): boolean => {
    if (password === PARENT_PASSWORD) {
      setRole('parent');
      return true;
    }
    return false;
  };

  const switchToChildMode = () => {
    setRole('child');
  };

  const switchToParentMode = (password: string): boolean => {
    return requestParentAccess(password);
  };

  // Create user object from localStorage
  const user: User | null = userId ? {
    id: userId,
    name: localStorage.getItem('user_name') || localStorage.getItem('fgs_user_name') || 'User',
    email: localStorage.getItem('user_email') || undefined
  } : null;

  const logout = async () => {
    console.log('Logging out...');
    await supabase.auth.signOut();
    clearAllSessions();
    setAccessTokenState(null);
    setUserId(null);
    setRole('parent');
  };

  return (
    <AuthContext.Provider value={{
      role,
      isParentMode,
      requestParentAccess,
      switchToChildMode,
      switchToParentMode,
      accessToken,
      userId,
      user,
      refreshSession,
      logout,
      isLoading // Now properly managed
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}