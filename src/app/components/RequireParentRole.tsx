import { Navigate } from 'react-router';
import { getCurrentMode } from '../utils/auth';
import { Card, CardContent } from './ui/card';
import { Lock } from 'lucide-react';

/**
 * ✅ NAV-003: Prevents kids from accessing parent routes
 * ✅ NAV-005: Ensures user is authenticated as parent
 * 
 * This guard protects routes that should ONLY be accessible by parents.
 * Kids attempting to access parent routes will be redirected to kid dashboard.
 */
export function RequireParentRole({ children }: { children: JSX.Element }) {
  const mode = getCurrentMode();
  
  console.log('🔒 RequireParentRole check:', {
    mode,
    userMode: localStorage.getItem('user_mode'),
    userRole: localStorage.getItem('user_role'),
    pathname: window.location.pathname
  });
  
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
