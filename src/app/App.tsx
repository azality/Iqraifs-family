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
import { suppressRechartsWarnings } from './utils/suppressRechartsWarnings';
import { getStorageSync, removeMultipleSync } from '../utils/storage';

// Keys cleared when we abandon a kid session (both the expired-token check
// below and the on-mount re-validation). Kept in one place so the two paths
// stay in sync.
const KID_SESSION_KEYS = [
  'user_mode',
  'kid_access_token',
  'kid_id',
  'kid_name',
  'kid_avatar',
  'kid_family_code',
  'user_role',
  'kid_session_token',
  'child_id',
];

// ⚡ CRITICAL: Synchronously clear the known-expired kid token BEFORE React
// renders anything. This prevents race conditions where FamilyContext tries
// to use an expired token before an async effect could run.
//
// This is a deliberate escape hatch from the async storage abstraction — it
// runs at module import time. window.localStorage is also what the web side
// of storage.ts falls back to, so the values match. On native we follow up
// with an async removeMultipleSync() to wipe the same keys from Capacitor
// Preferences.
const clearExpiredKidSession = () => {
  // eslint-disable-next-line no-restricted-globals
  const mode = window.localStorage.getItem('user_mode');

  if (mode === 'kid') {
    // eslint-disable-next-line no-restricted-globals
    const kidTokenNew = window.localStorage.getItem('kid_access_token');
    // eslint-disable-next-line no-restricted-globals
    const kidTokenOld = window.localStorage.getItem('kid_session_token');
    const kidToken = kidTokenNew || kidTokenOld;

    if (kidToken) {
      console.log('🔍 Checking kid session on module load...', {
        hasNewToken: !!kidTokenNew,
        hasOldToken: !!kidTokenOld,
        tokenPrefix: kidToken.substring(0, 20),
      });

      // Check if this is the known expired token
      if (kidToken.startsWith('kid_728d5c809eaef3187f09bb68ebecf02763de73e8429ac5')) {
        console.warn('🚨 EXPIRED TOKEN DETECTED - Clearing immediately!');

        // Clear synchronously on web.
        KID_SESSION_KEYS.forEach((key) => {
          try {
            // eslint-disable-next-line no-restricted-globals
            window.localStorage.removeItem(key);
          } catch (e) {
            console.error('Failed to remove', key, e);
          }
        });

        // Mirror the wipe via the sync localStorage abstraction.
        try {
          removeMultipleSync(KID_SESSION_KEYS);
        } catch (e) {
          console.error('Error clearing kid session from sync storage:', e);
        }

        console.log('✅ Expired session cleared - will redirect to login');
        window.location.href = '/kid/login';
      }
    }
  }
};

// Run this IMMEDIATELY when module loads (before React renders)
clearExpiredKidSession();

// Initialize global kid session guard to catch ALL 401 responses
initKidSessionGuard();

// Suppress known Recharts console warnings
suppressRechartsWarnings();

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
        const kidToken =
          (getStorageSync('kid_access_token')) ||
          (getStorageSync('kid_session_token'));

        if (kidToken) {
          try {
            // Try to fetch the kid's data to verify the session is valid
            const kidId =
              (getStorageSync('kid_id')) || (getStorageSync('child_id'));

            if (kidId) {
              const response = await fetch(
                `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/children/${kidId}`,
                {
                  headers: { Authorization: `Bearer ${kidToken}` },
                },
              );

              if (response.status === 401) {
                console.warn('🚨 Kid session expired on app load - clearing and redirecting to login');

                // Clear all kid session data via the abstraction (covers web + native)
                removeMultipleSync(KID_SESSION_KEYS);

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
