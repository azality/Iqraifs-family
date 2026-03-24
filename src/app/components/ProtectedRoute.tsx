import { useEffect, useState, useContext } from 'react';
import { Navigate } from 'react-router';
import { AuthContext } from '../contexts/AuthContext';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const authContext = useContext(AuthContext);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // CRITICAL: Use AuthContext instead of checking Supabase directly
        // This prevents lock contention from multiple components calling getSession()
        
        const localUserId = localStorage.getItem('user_id') || localStorage.getItem('fgs_user_id');
        
        console.log('🔒 ProtectedRoute - Auth check:', {
          hasLocalUserId: !!localUserId,
          hasAuthContext: !!authContext,
          authContextUser: authContext?.user,
          authContextLoading: authContext?.loading
        });
        
        // Wait a moment for AuthContext to initialize
        await new Promise(resolve => setTimeout(resolve, 100));
        
        setLoading(false);
      } catch (error) {
        console.error('❌ ProtectedRoute - Auth check error:', error);
        setLoading(false);
      }
    };

    checkAuth();
  }, [authContext]);

  // Show loading while AuthContext is initializing
  if (loading || authContext?.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Check if user is authenticated
  const localUserId = localStorage.getItem('user_id') || localStorage.getItem('fgs_user_id');
  const hasAuth = !!(authContext?.user || localUserId);

  if (!hasAuth) {
    console.log('🔒 ProtectedRoute - No auth, redirecting to login');
    return <Navigate to="/parent-login" replace />;
  }

  return <>{children}</>;
}