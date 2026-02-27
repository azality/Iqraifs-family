import { useEffect, useState } from 'react';
import { Navigate } from 'react-router';
import { supabase } from '../../../utils/supabase/client';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        console.log('🔒 ProtectedRoute - Session check:', {
          hasSession: !!session,
          userId: session?.user?.id,
          error: error?.message
        });
        
        setHasSession(!!session);
      } catch (error) {
        console.error('❌ ProtectedRoute - Session check error:', error);
        setHasSession(false);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Also listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('🔒 ProtectedRoute - Auth state changed:', event, !!session);
      setHasSession(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!hasSession) {
    console.log('🔒 ProtectedRoute - No session, redirecting to login');
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
