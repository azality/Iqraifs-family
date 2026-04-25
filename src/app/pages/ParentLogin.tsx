import React, { useState } from 'react';
import { clearStorage, getStorage, setStorage, removeStorage } from '../../../utils/storage';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Users, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';
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
            'Cannot connect to the backend server. ' +
            'This usually means the Supabase Edge Function is not deployed or not responding. ' +
            'Please run the network diagnostics for more details.'
          );
        }
        
        console.log('📤 Fetching families:', {
          url: fetchUrl,
          hasToken: !!verifySession.access_token,
          tokenPreview: verifySession.access_token?.substring(0, 30) + '...',
          headers: {
            hasAuthorization: true,
            hasApikey: true,
            contentType: 'application/json'
          }
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
            errorStack: networkError.stack?.split('\n').slice(0, 3),
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
          headers: Object.fromEntries(familiesResponse.headers.entries())
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
      } catch (fetchError) {
        console.error('❌ Error fetching families:', fetchError);
        // Show network test link if fetch fails
        toast.error('Cannot connect to server', {
          description: 'Click here to run diagnostics',
          action: {
            label: 'Test Network',
            onClick: () => navigate('/network-test')
          }
        });
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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-100 p-4 rounded-full">
              <Users className="h-12 w-12 text-blue-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Parent Login</CardTitle>
          <CardDescription>
            Sign in to manage your family
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="parent@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>

            <div className="text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={resetting}
                className="text-sm text-blue-600 hover:underline font-medium disabled:opacity-50"
              >
                {resetting ? 'Sending reset email...' : 'Forgot password?'}
              </button>
            </div>
          </form>

          <div className="mt-6 space-y-4">
            <div className="text-center text-sm">
              <span className="text-gray-600">Don't have an account? </span>
              <button
                onClick={() => navigate('/signup')}
                className="text-blue-600 hover:underline font-medium"
              >
                Sign up
              </button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Or</span>
              </div>
            </div>

            <Button
              variant="outline"
              onClick={() => navigate('/kid-login')}
              className="w-full"
            >
              <span className="text-2xl mr-2">👶</span>
              Kid Login
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/network-test')}
              className="w-full text-xs text-gray-500 hover:text-gray-700"
            >
              🔬 Network Diagnostics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}