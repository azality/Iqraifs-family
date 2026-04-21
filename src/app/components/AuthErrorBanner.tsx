import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { getStorageSync, clearStorageSync } from '../../utils/storage';

export function AuthErrorBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [kidModeDetected, setKidModeDetected] = useState(false);

  useEffect(() => {
    // Initialize kid mode check
    const checkKidMode = async () => {
      const userRole = getStorageSync('user_role');
      const userMode = getStorageSync('user_mode');
      setKidModeDetected(userRole === 'child' || userMode === 'kid');
    };
    checkKidMode();
  }, []);

  useEffect(() => {
    // CRITICAL: Don't show banner at all in kid mode
    if (kidModeDetected) {
      console.log('👶 Kid mode detected - AuthErrorBanner disabled');
      return;
    }

    // Listen for console errors related to authentication
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args) => {
      const errorMessage = args.join(' ');

      // Skip kid-specific errors
      if (errorMessage.includes('Kid session') || errorMessage.includes('kid session')) {
        originalError.apply(console, args);
        return;
      }

      if (
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Invalid JWT') ||
        errorMessage.includes('401') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('Session expired') ||
        errorMessage.includes('expired')
      ) {
        // Double-check we're not in kid mode AND user is logged in before showing banner
        // Note: kidModeDetected is from state set in separate useEffect
        if (!kidModeDetected) {
          // Can't await here, so check banner logic in checkSession instead
          setShowBanner(true);
        }
      }
      originalError.apply(console, args);
    };

    console.warn = (...args) => {
      const warnMessage = args.join(' ');

      // Skip kid-specific warnings
      if (warnMessage.includes('Kid session') || warnMessage.includes('kid session') || warnMessage.includes('👶')) {
        originalWarn.apply(console, args);
        return;
      }

      if (
        warnMessage.includes('Refresh cooldown') ||
        warnMessage.includes('Token is expired') ||
        warnMessage.includes('No access token')
      ) {
        // Double-check we're not in kid mode AND user is logged in before showing banner
        if (!kidModeDetected) {
          setShowBanner(true);
        }
      }
      originalWarn.apply(console, args);
    };

    // Check session on mount
    checkSession();

    // Recheck every 10 seconds
    const interval = setInterval(checkSession, 10000);

    return () => {
      console.error = originalError;
      console.warn = originalWarn;
      clearInterval(interval);
    };
  }, [kidModeDetected]);

  const checkSession = async () => {
    try {
      // CRITICAL: Don't check Supabase session if in kid mode
      if (kidModeDetected) {
        console.log('👶 Kid mode detected - skipping Supabase session check in AuthErrorBanner');
        setShowBanner(false);
        return;
      }

      // CRITICAL: Only check session if user has a stored user_id
      // This prevents showing "Session Expired" to users who aren't logged in
      const storedUserId = getStorageSync('user_id');
      if (!storedUserId) {
        console.log('🔓 No user_id found - user not logged in, skipping session check');
        setShowBanner(false);
        return;
      }

      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session) {
        console.log('🔴 No valid session found, but user_id exists - session expired');
        setShowBanner(true);
      } else {
        // Check if token is expired
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const isExpired = expiresAt && expiresAt < now;

        if (isExpired) {
          console.log('🔴 Token is expired');
          setShowBanner(true);
        } else {
          // Session is valid - hide banner
          setShowBanner(false);
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
      // Only show banner if user_id exists (meaning they were logged in)
      const storedUserId = getStorageSync('user_id');
      if (storedUserId) {
        setShowBanner(true);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        console.error('Failed to refresh session:', error);
        // Redirect to login
        window.location.href = '/parent-login';
      } else {
        console.log('✅ Session refreshed successfully');
        setShowBanner(false);
        // Reload the page to re-fetch data with new token
        window.location.reload();
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
      window.location.href = '/parent-login';
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogin = async () => {
    // Clear any stale session data before navigating
    clearStorageSync();
    supabase.auth.signOut();
    window.location.href = '/parent-login';
  };

  if (!showBanner) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-4">
      <Alert variant="destructive" className="shadow-lg">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Session Expired</AlertTitle>
        <AlertDescription className="mt-2 flex items-center justify-between">
          <span>Your session has expired. Please refresh your session or log in again.</span>
          <div className="flex gap-2 ml-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="bg-white hover:bg-gray-100 border-gray-300"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              {isRefreshing ? 'Refreshing...' : 'Refresh Session'}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleLogin}
              disabled={isRefreshing}
              className="bg-red-600 text-white hover:bg-red-700 border-0"
            >
              Log In Again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}