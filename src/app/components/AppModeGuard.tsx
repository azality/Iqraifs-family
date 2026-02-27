import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router';
import { getAppMode, isRouteAllowed, getDefaultRoute } from '../utils/appMode';
import { toast } from 'sonner';

/**
 * App Mode Guard
 * 
 * Prevents cross-app route access in iOS builds:
 * - Parent app cannot access kid routes
 * - Kids app cannot access parent routes
 * 
 * This is the FIRST LINE OF DEFENSE against URL manipulation attacks.
 * 
 * SECURITY: Critical iOS blocker #5 - Route Isolation
 */
export function AppModeGuard({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const appMode = getAppMode();
  
  useEffect(() => {
    const currentPath = location.pathname;
    
    // Check if current route is allowed in this app
    if (!isRouteAllowed(currentPath)) {
      const defaultRoute = getDefaultRoute();
      
      console.error(`🚫 AppModeGuard: Route "${currentPath}" not allowed in ${appMode} app`);
      console.log(`↩️  Redirecting to: ${defaultRoute}`);
      
      // Show error toast
      if (appMode === 'kids') {
        toast.error('This page is only for parents', {
          description: 'Please ask your parent if you need help'
        });
      } else if (appMode === 'parent') {
        toast.error('This is a kids-only page', {
          description: 'Please use the parent dashboard'
        });
      }
      
      // Redirect to default route
      navigate(defaultRoute, { replace: true });
    }
  }, [location.pathname, appMode, navigate]);
  
  // Only render children if route is allowed
  if (!isRouteAllowed(location.pathname)) {
    return null;
  }
  
  return <>{children}</>;
}
