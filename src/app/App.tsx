import { useEffect } from 'react';
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { AuthProvider } from './contexts/AuthContext';
import { FamilyProvider } from './contexts/FamilyContext';
import { Toaster } from './components/ui/sonner';
import { AuthErrorBanner } from './components/AuthErrorBanner';
import { getCurrentMode } from './utils/auth';
import { projectId } from '../../utils/supabase/info';
import { initKidSessionGuard } from './utils/kidSessionGuard';

// ⚡ CRITICAL: Synchronously clear expired kid session BEFORE React renders anything
// This prevents race conditions where FamilyContext tries to use expired tokens
const clearExpiredKidSession = () => {
  const mode = localStorage.getItem('user_mode');
  
  if (mode === 'kid') {
    // Get BOTH old and new token keys
    const kidTokenNew = localStorage.getItem('kid_access_token');
    const kidTokenOld = localStorage.getItem('kid_session_token');
    const kidToken = kidTokenNew || kidTokenOld;
    
    if (kidToken) {
      console.log('🔍 Checking kid session on module load...', {
        hasNewToken: !!kidTokenNew,
        hasOldToken: !!kidTokenOld,
        tokenPrefix: kidToken.substring(0, 20)
      });
      
      // Check if this is the known expired token
      if (kidToken.startsWith('kid_728d5c809eaef3187f09bb68ebecf02763de73e8429ac5')) {
        console.warn('🚨 EXPIRED TOKEN DETECTED - Clearing immediately!');
        
        // Clear ALL kid session data synchronously
        localStorage.removeItem('user_mode');
        localStorage.removeItem('kid_access_token');
        localStorage.removeItem('kid_id');
        localStorage.removeItem('kid_name');
        localStorage.removeItem('kid_avatar');
        localStorage.removeItem('kid_family_code');
        localStorage.removeItem('user_role');
        localStorage.removeItem('kid_session_token');
        localStorage.removeItem('child_id');
        
        console.log('✅ Expired session cleared - will redirect to login');
        
        // Redirect to kid login
        window.location.href = '/kid/login';
      }
    }
  }
};

// Run this IMMEDIATELY when module loads (before React renders)
clearExpiredKidSession();

// Initialize global kid session guard to catch ALL 401 responses
initKidSessionGuard();

function App() {
  // Validate kid session on app load
  useEffect(() => {
    const validateKidSession = async () => {
      const mode = getCurrentMode();
      
      if (mode === 'kid') {
        console.log('🔍 Validating kid session on app load...');
        
        // CRITICAL: Check if this is a fresh login (skip validation to avoid race condition)
        const justLoggedIn = sessionStorage.getItem('kid_just_logged_in');
        if (justLoggedIn === 'true') {
          console.log('✅ Skipping session validation - fresh login detected');
          sessionStorage.removeItem('kid_just_logged_in');
          return;
        }
        
        // Get the kid token from storage (check BOTH old and new keys)
        const kidToken = localStorage.getItem('kid_access_token') || localStorage.getItem('kid_session_token');
        
        if (kidToken) {
          try {
            // Try to fetch the kid's data to verify the session is valid
            const kidId = localStorage.getItem('kid_id') || localStorage.getItem('child_id');
            
            if (kidId) {
              const response = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${kidId}`,
                {
                  headers: { 'Authorization': `Bearer ${kidToken}` }
                }
              );
              
              if (response.status === 401) {
                console.warn('🚨 Kid session expired on app load - clearing and redirecting to login');
                
                // Clear all kid session data
                localStorage.removeItem('user_mode');
                localStorage.removeItem('kid_access_token');
                localStorage.removeItem('kid_id');
                localStorage.removeItem('kid_name');
                localStorage.removeItem('kid_avatar');
                localStorage.removeItem('kid_family_code');
                localStorage.removeItem('user_role');
                localStorage.removeItem('kid_session_token');
                localStorage.removeItem('child_id');
                
                // Redirect to kid login
                window.location.href = '/kid/login';
              } else {
                console.log('✅ Kid session is valid');
              }
            }
          } catch (error) {
            console.error('❌ Error validating kid session:', error);
          }
        }
      }
    };
    
    validateKidSession();
  }, []);

  return (
    <AuthProvider>
      <FamilyProvider>
        <AuthErrorBanner />
        <RouterProvider router={router} />
        <Toaster />
      </FamilyProvider>
    </AuthProvider>
  );
}

export default App;