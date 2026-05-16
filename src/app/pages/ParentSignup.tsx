import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Mail, Lock, User, Home, UserPlus, ArrowLeft, Sparkles, Shield, Heart, School, Building2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';
import { motion } from 'motion/react';
import { setStorageSync } from '../../utils/storage';
import { setParentSession } from '../utils/authHelpers';
import { createOrganization } from '../../utils/schoolApi';
import { useWorkspace } from '../contexts/WorkspaceContext';

// v22 hotfix: Chrome MUST live outside the ParentSignup function. When it
// was defined inside, every keystroke re-created a fresh component
// reference; React then unmounted and remounted the whole subtree —
// including the form Inputs — which made them lose focus on every char.
// Symptom: typing one letter into Email or Password kicked the cursor
// out and the user had to click back into the field to type the next
// char. Defining it at module scope with `onHome` passed in fixes it.
const Chrome = ({
  onBack,
  onHome,
  children,
}: {
  onBack: () => void;
  onHome: () => void;
  children: React.ReactNode;
}) => (
  <div className="min-h-screen bg-white relative overflow-hidden">
    <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-purple-50/40 to-pink-50/30 pointer-events-none" />
    <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl pointer-events-none" />
    <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-indigo-200/30 blur-3xl pointer-events-none" />

    <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>
      <button
        onClick={onHome}
        className="flex items-center gap-2"
        aria-label="Iqra home"
      >
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold">
          ﷽
        </div>
        <span className="hidden sm:inline font-bold text-gray-900">Iqra</span>
      </button>
    </div>

    <div className="relative z-10 px-4 pb-12 pt-2 sm:pt-4 flex items-center justify-center min-h-[calc(100vh-80px)]">
      {children}
    </div>
  </div>
);

export function ParentSignup() {
  const navigate = useNavigate();
  const { refreshSchoolMe, switchToSchool } = useWorkspace();

  // Three-path selection: new family, join existing family, or
  // school principal (creates a school org instead of a family).
  const [signupType, setSignupType] = useState<'new' | 'join' | 'school' | null>(null);

  // Common fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Join existing family fields
  const [inviteCode, setInviteCode] = useState('');
  const [relationship, setRelationship] = useState('spouse');

  // School path fields
  const [schoolName, setSchoolName] = useState('');

  const [loading, setLoading] = useState(false);
  // v12: when the backend says EMAIL_EXISTS we open an actionable dialog
  // instead of a dead-end toast, so the user can jump to login or kick
  // off Forgot Password right away.
  const [emailExistsOpen, setEmailExistsOpen] = useState(false);

  const handleCreateNewFamily = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      // Call backend to create parent account
      const response = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            email,
            password,
            name,
            role: 'parent'
          })
        }
      );

      const data = await response.json();

      if (!response.ok) {
        // v12: surface the EMAIL_EXISTS case as an actionable dialog
        // (Go to Login) instead of a red dead-end toast.
        if (
          data?.code === 'EMAIL_EXISTS' ||
          /already.*registered/i.test(String(data?.error || ''))
        ) {
          setEmailExistsOpen(true);
          return;
        }
        throw new Error(data.error || `Signup failed: ${response.status}`);
      }

      toast.success('Account created! Redirecting to onboarding...');

      // Auto-login and redirect to onboarding
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError) {
        toast.error('Account created but login failed. Please log in manually.');
        navigate('/login');
        return;
      }

      if (!loginData?.session?.access_token) {
        console.error('❌ No access token in login response');
        toast.error('Login session invalid. Please log in manually.');
        navigate('/login');
        return;
      }

      console.log('✅ Create family login successful:', {
        hasSession: !!loginData.session,
        hasAccessToken: !!loginData.session.access_token,
        tokenLength: loginData.session.access_token.length
      });

      // Set parent mode - Supabase automatically stores the session.
      // v14: setParentSession persists the user's name/email under both the
      // canonical STORAGE_KEYS and the legacy fgs_user_name key, so the
      // header + AuthContext show the real name instead of "User" on the
      // very first dashboard load.
      setParentSession(loginData.session.user.id, name, email);
      setStorageSync('user_role', 'parent');
      setStorageSync('user_mode', 'parent');
      setStorageSync('fgs_mode', 'parent');

      navigate('/onboarding');
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error(error.message || 'Failed to create account');
    } finally {
      setLoading(false);
    }
  };

  // School-principal signup: creates an auth user, then bootstraps an
  // organization with the caller as principal. Lands on the school
  // setup wizard (academic year → campus → first class).
  const handleSchoolSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    if (schoolName.trim().length < 2) {
      toast.error('School name is required');
      return;
    }

    setLoading(true);
    try {
      // Step 1: create the auth user via the existing signup endpoint.
      const signupRes = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`,
          },
          body: JSON.stringify({ email, password, name, role: 'parent', signupIntent: 'school' }),
        },
      );
      const signupData = await signupRes.json();
      if (!signupRes.ok) {
        if (
          signupData?.code === 'EMAIL_EXISTS' ||
          /already.*registered/i.test(String(signupData?.error || ''))
        ) {
          setEmailExistsOpen(true);
          return;
        }
        throw new Error(signupData.error || `Signup failed: ${signupRes.status}`);
      }

      // Step 2: log in so we have a session token for the bootstrap call.
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email, password,
      });
      if (loginError || !loginData?.session?.access_token) {
        toast.error('Account created but login failed. Please log in manually.');
        navigate('/login');
        return;
      }
      setParentSession(loginData.session.user.id, name, email);
      setStorageSync('user_role', 'parent');
      setStorageSync('user_mode', 'parent');
      setStorageSync('fgs_mode', 'parent');

      // Step 3: create the organization (caller becomes principal).
      // schoolApi.createOrganization picks up the freshly-stored session
      // via the standard apiCall token resolution.
      const { organization } = await createOrganization({ name: schoolName.trim() });

      toast.success(`${organization.name} created — let's set it up`);

      // Step 4: refresh /school/me so the workspace switcher knows
      // the user is now a principal, and pre-select the school
      // workspace so the chrome reflects it on arrival.
      await refreshSchoolMe();
      switchToSchool(organization.id, organization.name);

      // Step 5: drop them into the school setup wizard. From there:
      // create academic year → first campus → first class. No
      // family-side onboarding (that's for the family signup path).
      navigate(`/school/orgs/${organization.id}/setup`);
    } catch (error: any) {
      console.error('School signup error:', error);
      toast.error(error.message || 'Failed to create school');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinExistingFamily = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    if (!inviteCode || inviteCode.length < 4) {
      toast.error('Please enter a valid invite code');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create user account
      const signupResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/auth/signup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            email,
            password,
            name,
            role: 'parent'
          })
        }
      );

      const signupData = await signupResponse.json();

      if (!signupResponse.ok) {
        if (
          signupData?.code === 'EMAIL_EXISTS' ||
          /already.*registered/i.test(String(signupData?.error || ''))
        ) {
          setEmailExistsOpen(true);
          return;
        }
        throw new Error(signupData.error || 'Failed to create account');
      }

      // Step 2: Login to get access token
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (loginError) {
        throw new Error('Account created but login failed. Please log in manually.');
      }

      if (!loginData?.session?.access_token) {
        throw new Error('Failed to obtain access token. Please log in manually.');
      }

      console.log('✅ Login successful, access token obtained');

      // Step 3: Submit join request (requires approval)
      const joinResponse = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/families/join-request`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${loginData.session.access_token}`,
            'apikey': publicAnonKey
          },
          body: JSON.stringify({
            inviteCode: inviteCode.trim().toUpperCase(),
            requestedRole: relationship === 'spouse' ? 'parent' : 'caregiver',
            relationship
          })
        }
      );

      const joinData = await joinResponse.json();

      if (!joinResponse.ok) {
        console.error('❌ Join request failed:', joinData);
        throw new Error(joinData.error || 'Failed to submit join request');
      }

      console.log('✅ Join request submitted successfully');

      toast.success('Join request submitted! Waiting for family admin approval...', {
        duration: 5000
      });

      setParentSession(loginData.session.user.id, name, email);
      setStorageSync('user_role', 'parent');
      setStorageSync('user_mode', 'parent');
      setStorageSync('fgs_mode', 'parent');
      setStorageSync('fgs_join_pending', 'true');

      navigate('/join-pending');

    } catch (error: any) {
      console.error('Join request error:', error);
      toast.error(error.message || 'Failed to submit join request');
    } finally {
      setLoading(false);
    }
  };

  // v12: Reusable dialog for the "email already registered" case.
  const emailExistsDialog = (
    <Dialog open={emailExistsOpen} onOpenChange={setEmailExistsOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>This email is already registered</DialogTitle>
          <DialogDescription>
            An account already exists for <strong>{email || 'that email'}</strong>.
            If it's yours, sign in instead. If you've forgotten the password,
            use "Forgot password?" on the login screen to receive a reset link.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setEmailExistsOpen(false)}
          >
            Use a different email
          </Button>
          <Button
            onClick={() => {
              setEmailExistsOpen(false);
              navigate('/login');
            }}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            Go to Login
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // v22 hotfix: Chrome moved to module scope (above) so it isn't a fresh
  // function on every render. If you re-add a Chrome wrapper here later,
  // it MUST live outside this function or the email/password inputs will
  // lose focus on every keystroke.

  // Path Selection Screen
  if (!signupType) {
    return (
      <Chrome onBack={() => navigate('/welcome')} onHome={() => navigate('/welcome')}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-3xl"
        >
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white text-2xl font-bold shadow-lg shadow-blue-600/20 mb-4">
              ﷽
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Let's get you set up</h1>
            <p className="mt-3 text-base text-gray-600">
              Family or school — pick the one that fits.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {/* Create New Family */}
            <motion.button
              type="button"
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSignupType('new')}
              className="group text-left rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 hover:ring-blue-300 p-7 transition-all"
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <Home className="h-7 w-7 text-blue-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1.5">Create a new family</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                I'm the first parent setting things up. I'll add my kids and invite my spouse later.
              </p>
              <div className="mt-5 inline-flex items-center text-sm font-semibold text-blue-600">
                Start fresh →
              </div>
            </motion.button>

            {/* Join Existing Family */}
            <motion.button
              type="button"
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSignupType('join')}
              className="group text-left rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 hover:ring-purple-300 p-7 transition-all"
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <UserPlus className="h-7 w-7 text-purple-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1.5">Join an existing family</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                I have an invite code from my spouse, a guardian, or a caregiver who's already on Iqra.
              </p>
              <div className="mt-5 inline-flex items-center text-sm font-semibold text-purple-600">
                I have a code →
              </div>
            </motion.button>

            {/* I run a school */}
            <motion.button
              type="button"
              whileHover={{ y: -4 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSignupType('school')}
              className="group text-left rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 hover:ring-indigo-400 p-7 transition-all"
            >
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                <School className="h-7 w-7 text-indigo-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1.5">I run a school</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                I'm a principal or administrator. I want to set up Hifz tracking and class behavior for my students.
              </p>
              <div className="mt-5 inline-flex items-center text-sm font-semibold text-indigo-600">
                Set up my school →
              </div>
            </motion.button>
          </div>

          <div className="mt-8 text-center text-sm">
            <span className="text-gray-600">Already have an account? </span>
            <button
              onClick={() => navigate('/login')}
              className="text-blue-600 hover:text-blue-700 hover:underline font-semibold"
            >
              Sign in
            </button>
          </div>

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
      </Chrome>
    );
  }

  // Create New Family Form
  if (signupType === 'new') {
    return (
      <Chrome onBack={() => setSignupType(null)} onHome={() => navigate('/welcome')}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 p-7 sm:p-9">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 mb-4">
                <Home className="h-7 w-7 text-blue-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Create your family</h1>
              <p className="mt-2 text-sm text-gray-600">
                You'll be the family admin. You can invite your spouse and add kids next.
              </p>
            </div>

            <form onSubmit={handleCreateNewFamily} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-blue-500"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

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
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-blue-500"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-blue-500"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-md shadow-blue-600/20"
                disabled={loading}
              >
                {loading ? 'Creating account…' : 'Create family account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-gray-600">Already have an account? </span>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-blue-600 hover:text-blue-700 hover:underline font-semibold"
              >
                Sign in
              </button>
            </div>
          </div>
        </motion.div>
        {emailExistsDialog}
      </Chrome>
    );
  }

  // ---------------------------------------------------------------------------
  // School-principal signup form
  // ---------------------------------------------------------------------------
  if (signupType === 'school') {
    return (
      <Chrome onBack={() => setSignupType(null)} onHome={() => navigate('/welcome')}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          <div className="rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 p-7 sm:p-9">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 mb-4">
                <School className="h-7 w-7 text-indigo-600" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Set up your school</h1>
              <p className="mt-2 text-sm text-gray-600">
                You'll be the principal. Next you'll add a campus, a class, and your first students.
              </p>
            </div>

            <form onSubmit={handleSchoolSignup} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="school-name" className="text-sm font-medium text-gray-700">School name</Label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="school-name"
                    type="text"
                    placeholder="e.g. Iqra Academy"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-indigo-500"
                    required
                    autoComplete="organization"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="principal-name" className="text-sm font-medium text-gray-700">Your name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="principal-name"
                    type="text"
                    placeholder="Principal name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-indigo-500"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="school-email" className="text-sm font-medium text-gray-700">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="school-email"
                    type="email"
                    placeholder="principal@school.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-indigo-500"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="school-password" className="text-sm font-medium text-gray-700">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="school-password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-indigo-500"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="school-confirmPassword" className="text-sm font-medium text-gray-700">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="school-confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-indigo-500"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full h-11 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-semibold shadow-md shadow-indigo-600/20"
                disabled={loading}
              >
                {loading ? 'Setting up school…' : 'Create school account'}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm">
              <span className="text-gray-600">Already have an account? </span>
              <button
                type="button"
                onClick={() => navigate('/login')}
                className="text-indigo-600 hover:text-indigo-700 hover:underline font-semibold"
              >
                Sign in
              </button>
            </div>
          </div>
        </motion.div>
        {emailExistsDialog}
      </Chrome>
    );
  }

  // Join Existing Family Form
  return (
    <Chrome onBack={() => setSignupType(null)} onHome={() => navigate('/welcome')}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-gray-200 p-7 sm:p-9">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 mb-4">
              <UserPlus className="h-7 w-7 text-purple-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Join a family</h1>
            <p className="mt-2 text-sm text-gray-600">
              Enter the invite code your family admin shared with you.
            </p>
          </div>

          <form onSubmit={handleJoinExistingFamily} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="inviteCode" className="text-sm font-medium text-gray-700">Family invite code</Label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="ABC123"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="h-12 rounded-xl border-gray-200 text-center font-mono text-xl tracking-widest focus-visible:ring-purple-500"
                maxLength={10}
                required
              />
              <p className="text-xs text-gray-500">
                Ask your family admin for the code from their Settings page.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="relationship" className="text-sm font-medium text-gray-700">Your relationship</Label>
              <select
                id="relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full h-11 px-3 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="spouse">Spouse</option>
                <option value="caregiver">Caregiver / Nanny</option>
                <option value="teacher">Teacher</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="border-t border-gray-100 pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-sm font-medium text-gray-700">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-purple-500"
                    required
                    autoComplete="name"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-sm font-medium text-gray-700">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-purple-500"
                    required
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-sm font-medium text-gray-700">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="At least 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-purple-500"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-11 rounded-xl border-gray-200 focus-visible:ring-purple-500"
                    required
                    autoComplete="new-password"
                    minLength={8}
                  />
                </div>
              </div>
            </div>

            <div className="rounded-xl bg-purple-50 border border-purple-100 p-3.5 flex gap-3">
              <div className="text-lg leading-none">📝</div>
              <p className="text-sm text-purple-900 leading-relaxed">
                Your request will be sent to the family admin for approval. You'll be notified when you're approved.
              </p>
            </div>

            <Button
              type="submit"
              className="w-full h-11 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold shadow-md shadow-purple-600/20"
              disabled={loading}
            >
              {loading ? 'Submitting request…' : 'Submit join request'}
            </Button>
          </form>

          <div className="mt-6 text-center text-sm">
            <span className="text-gray-600">Already on Iqra? </span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-purple-600 hover:text-purple-700 hover:underline font-semibold"
            >
              Sign in
            </button>
          </div>
        </div>
      </motion.div>
      {emailExistsDialog}
    </Chrome>
  );
}
