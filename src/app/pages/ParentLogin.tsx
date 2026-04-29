import React, { useState } from 'react';
import { setStorage, removeStorage } from '../../utils/storage';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Mail, Lock, ArrowLeft, Sparkles, Shield, Heart } from 'lucide-react';
import { toast } from 'sonner';
import { motion } from 'motion/react';
import { supabase } from '../../../utils/supabase/client';
import { AuthContext } from '../contexts/AuthContext';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';
import { setParentSession } from '../utils/authHelpers';
import { isPushNotificationsSupported, initializePushNotifications } from '../utils/pushNotifications';
import { useContext } from 'react';

export function ParentLogin() {
  const navigate = useNavigate();
  // Use useContext directly to avoid the error if context is not available
  const authContext = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleForgotPassword = async () => {
    if (!email || !email.includes('@')) {
      toast.error('Please enter your email above first, then tap Forgot password.');
      return;
    }
    setResetting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email);
      if (error) throw error;
      toast.success('If that email is registered, a reset link is on its way.');
    } catch (err: any) {
      console.error('❌ Forgot-password error:', err);
      // Privacy: never confirm whether the email exists.
      toast.success('If that email is registered, a reset link is on its way.');
    } finally {
      setResetting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      console.log('🔐 Starting parent login process for:', email);

      // CRITICAL: Clear any stale kid session data BEFORE login
      // This prevents race conditions where FamilyContext tries to use old child data
      console.log('🧹 Pre-login cleanup: Clearing stale kid session data');
      await removeStorage('child_id');
      await removeStorage('fgs_selected_child_id');
      await removeStorage('selected_child_id');
      await removeStorage('last_active_child');
      await removeStorage('kid_pin_session');

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('❌ Login error from Supabase:', error);
        throw error;
      }

      console.log('✅ Login successful:', {
        userId: data.user?.id,
        email: data.user?.email,
        hasSession: !!data.session,
        hasAccessToken: !!data.session?.access_token
      });

      // Use the centralized helper to set parent session
      // This will clear any kid session data and set parent role
      setParentSession(
        data.user.id,
        data.user.user_metadata.name || email,
        email
      );

      // CRITICAL: Wait a bit for Supabase to persist the session to localStorage
      console.log('⏳ Waiting for session persistence...');
      await new Promise(resolve => setTimeout(resolve, 500));

      // CRITICAL: Refresh the session in AuthContext to ensure it has the latest token
      // This prevents race conditions where FamilyContext tries to load before session is ready
      // Only call refreshSession if context is available
      if (authContext?.refreshSession) {
        console.log('🔄 Refreshing AuthContext session...');
        await authContext.refreshSession();
      } else {
        console.warn('⚠️ AuthContext not available, skipping refreshSession');
      }

      // Double-check that we have a valid session before proceeding
      const { data: { session: verifySession } } = await supabase.auth.getSession();
      console.log('✅ Session verification:', {
        hasSession: !!verifySession,
        hasToken: !!verifySession?.access_token,
        tokenLength: verifySession?.access_token?.length
      });

      if (!verifySession?.access_token) {
        throw new Error('Session was not properly established. Please try again.');
      }

      console.log('✅ AuthContext session refreshed and verified');

      // CRITICAL FIX: Fetch and cache family ID from backend
      console.log('🔍 Fetching user\'s family from backend...');
      try {
        const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;
        const fetchUrl = `${API_BASE}/families`;

        // First, do a quick health check to verify the Edge Function is responding
        console.log('🏥 Running health check first...');
        try {
          const healthResponse = await fetch(`${API_BASE}/health`, {
            headers: {
              'apikey': publicAnonKey,
            },
          });
          console.log('✅ Health check response:', {
            ok: healthResponse.ok,
            status: healthResponse.status
          });
        } catch (healthError: any) {
          console.error('❌ Health check failed:', healthError.message);
          throw new Error(
            'Cannot connect to the backend server. Please check your internet connection and try again.'
          );
        }

        console.log('📤 Fetching families:', {
          url: fetchUrl,
          hasToken: !!verifySession.access_token,
          tokenPreview: verifySession.access_token?.substring(0, 30) + '...',
        });

        let familiesResponse;
        try {
          familiesResponse = await fetch(fetchUrl, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${verifySession.access_token}`,
              'Content-Type': 'application/json',
              'apikey': publicAnonKey,
            },
          });
        } catch (networkError: any) {
          console.error('❌ NETWORK ERROR - Failed to fetch families:', {
            error: networkError.message,
            errorType: networkError.name,
            isOnline: navigator.onLine,
            url: fetchUrl
          });

          if (!navigator.onLine) {
            throw new Error('No internet connection. Please check your network and try again.');
          }

          throw new Error(`Cannot connect to server. Please try again.\n\nError: ${networkError.message}`);
        }

        console.log('📥 Families fetch response:', {
          ok: familiesResponse.ok,
          status: familiesResponse.status,
          statusText: familiesResponse.statusText,
        });

        if (familiesResponse.ok) {
          const families = await familiesResponse.json();
          console.log('✅ Families from backend:', families);

          if (families && families.length > 0) {
            const familyId = families[0].id;
            await setStorage('fgs_family_id', familyId);
            console.log('✅ Cached family ID:', familyId);

            // Small delay to ensure localStorage is flushed before navigation
            await new Promise(resolve => setTimeout(resolve, 100));

            toast.success('Welcome back!');

            // Initialize push notifications (non-blocking)
            if (isPushNotificationsSupported()) {
              try {
                console.log('📬 Initializing push notifications...');
                await initializePushNotifications(data.user.id);
                console.log('✅ Push notifications initialized');
              } catch (pushError) {
                // Non-blocking - don't prevent login if push fails
                console.warn('⚠️ Failed to initialize push notifications:', pushError);
              }
            }

            navigate('/');
            return;
          } else {
            console.warn('⚠️ No families found for user - redirecting to onboarding');
            toast.info('Please complete family setup');
            await new Promise(resolve => setTimeout(resolve, 100));
            navigate('/onboarding');
            return;
          }
        } else {
          const errorText = await familiesResponse.text();
          console.error('❌ Failed to fetch families:', {
            status: familiesResponse.status,
            error: errorText
          });
        }
      } catch (fetchError: any) {
        console.error('❌ Error fetching families:', fetchError);
        toast.error(fetchError?.message || 'Cannot connect to server');
      }

      // If we get here, something went wrong but user is authenticated
      // Redirect to onboarding to be safe
      toast.info('Please complete family setup');
      await new Promise(resolve => setTimeout(resolve, 100));
      navigate('/onboarding');
    } catch (error: any) {
      console.error('❌ Login error:', error);
      toast.error(error.message || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Decorative background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50/40 to-pink-50/30 pointer-events-none" />
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl pointer-events-none" />

      {/* Top bar with back-to-landing */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
        <button
          onClick={() => navigate('/welcome')}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center gap-2"
          aria-label="Iqra home"
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
            ﷽
          </div>
          <span className="hidden sm:inline font-bold text-gray-900">Iqra</span>
        </button>
      </div>

      {/* Centered card */}
      <div className="relative z-10 px-4 pb-12 pt-4 sm:pt-8 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 p-7 sm:p-9">
            <div className="text-center mb-7">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-2xl font-bold shadow-lg shadow-blue-600/20 mb-4">
                ﷽
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome back</h1>
              <p className="mt-2 text-sm text-gray-600">
                Sign in to your family command center
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="parent@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-blue-500"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                  <button
                    type="button"
                    onClick={handleForgotPassword}
                    disabled={resetting}
                    className="text-xs text-blue-600 hover:text-blue-700 hover:underline font-medium disabled:opacity-50"
                  >
                    {resetting ? 'Sending…' : 'Forgot password?'}
                  </button>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-blue-500"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md shadow-blue-600/20"
                disabled={loading}
              >
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white text-gray-500 uppercase tracking-wider">Or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => navigate('/kid-login')}
                className="mt-4 w-full h-11 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-800 font-medium inline-flex items-center justify-center gap-2 transition-colors"
              >
                <span className="text-xl">👶</span>
                I'm a kid — PIN login
              </button>

              <div className="mt-6 text-center text-sm">
                <span className="text-gray-600">New to Iqra? </span>
                <button
                  type="button"
                  onClick={() => navigate('/signup')}
                  className="text-blue-600 hover:text-blue-700 hover:underline font-semibold"
                >
                  Create a family
                </button>
              </div>
            </div>
          </div>

          {/* Trust line under the card */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-500">
            <span className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Family-private by design
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Heart className="h-3.5 w-3.5" /> Built for the Muslim home
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" /> Web, iOS &amp; Android
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
