import { useEffect, useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router';
import { supabase } from '../../../utils/supabase/client';

export function AuthErrorBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Listen for console errors related to authentication
    const originalError = console.error;
    const originalWarn = console.warn;
    
    console.error = (...args) => {
      const errorMessage = args.join(' ');
      if (
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('Invalid JWT') ||
        errorMessage.includes('401') ||
        errorMessage.includes('Unauthorized') ||
        errorMessage.includes('Session expired') ||
        errorMessage.includes('expired')
      ) {
        setShowBanner(true);
      }
      originalError.apply(console, args);
    };
    
    console.warn = (...args) => {
      const warnMessage = args.join(' ');
      if (
        warnMessage.includes('Refresh cooldown') ||
        warnMessage.includes('Token is expired') ||
        warnMessage.includes('No access token')
      ) {
        setShowBanner(true);
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
  }, []);

  const checkSession = async () => {
    try {
      // CRITICAL: Don't check Supabase session if in kid mode
      const userRole = localStorage.getItem('user_role');
      const userMode = localStorage.getItem('user_mode');
      
      if (userRole === 'child' || userMode === 'kid') {
        console.log('👶 Kid mode detected - skipping Supabase session check in AuthErrorBanner');
        setShowBanner(false);
        return;
      }
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.log('🔴 No valid session found');
        setShowBanner(true);
      } else {
        // Check if token is expired
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        const isExpired = expiresAt && expiresAt < now;
        
        if (isExpired) {
          console.log('🔴 Token is expired');
          setShowBanner(true);
        }
      }
    } catch (error) {
      console.error('Error checking session:', error);
      setShowBanner(true);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const { data, error } = await supabase.auth.refreshSession();
      
      if (error || !data.session) {
        console.error('Failed to refresh session:', error);
        // Redirect to login
        navigate('/parent-login');
      } else {
        console.log('✅ Session refreshed successfully');
        setShowBanner(false);
        // Reload the page to re-fetch data with new token
        window.location.reload();
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
      navigate('/parent-login');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleLogin = () => {
    // Clear any stale session data before navigating
    localStorage.clear();
    supabase.auth.signOut();
    navigate('/parent-login');
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