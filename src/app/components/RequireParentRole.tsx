import { useEffect } from 'react';
import { Navigate } from 'react-router';
import { getCurrentMode } from '../utils/auth';
import { Card, CardContent } from './ui/card';
import { Lock } from 'lucide-react';
import { getStorage } from '../../utils/storage';

/**
 * ✅ NAV-003: Prevents kids from accessing parent routes
 * ✅ NAV-005: Ensures user is authenticated as parent
 *
 * This guard protects routes that should ONLY be accessible by parents.
 * Kids attempting to access parent routes will be redirected to kid dashboard.
 */
export function RequireParentRole({ children }: { children: JSX.Element }) {
  // FIXME(localStorage-migration): getCurrentMode() in ../utils/auth is still
  // sync; long-term that module should move onto the async storage abstraction
  // so this guard can render the correct result on native (Capacitor Preferences)
  // on first paint instead of only on the web localStorage fallback.
  const mode = getCurrentMode();

  // Debug logging for the raw storage keys is done async so no render-time
  // localStorage reads are needed.
  useEffect(() => {
    (async () => {
      const [userMode, userRole] = await Promise.all([
        getStorage('user_mode'),
        getStorage('user_role'),
      ]);
      console.log('🔒 RequireParentRole check:', {
        mode,
        userMode,
        userRole,
        pathname: window.location.pathname,
      });
    })();
  }, [mode]);
  
  // ✅ NAV-003: Block kid access to parent routes
  if (mode === 'kid') {
    console.log('❌ RequireParentRole: Kid trying to access parent route, blocking!');
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center space-y-4">
            <Lock className="h-16 w-16 mx-auto text-red-500" />
            <div>
              <h2 className="text-xl font-bold mb-2">Parent Access Required</h2>
              <p className="text-muted-foreground mb-4">
                This page is only accessible to parents. Please ask your parent if you need something from this page.
              </p>
              <a 
                href="/kid/home" 
                className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Go to Kid Dashboard
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  // ✅ NAV-005: Ensure parent is authenticated
  if (mode !== 'parent') {
    console.log('❌ RequireParentRole: No parent auth, redirecting to login');
    return <Navigate to="/login" replace />;
  }
  
  console.log('✅ RequireParentRole: Parent mode detected, allowing access');
  return children;
}
