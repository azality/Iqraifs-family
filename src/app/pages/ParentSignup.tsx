import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Users, Mail, Lock, User, Home, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../../utils/supabase/client';
import { projectId, publicAnonKey } from '../../../utils/supabase/info.tsx';
import { motion } from 'motion/react';

export function ParentSignup() {
  const navigate = useNavigate();
  
  // Two-path selection
  const [signupType, setSignupType] = useState<'new' | 'join' | null>(null);
  
  // Common fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // Join existing family fields
  const [inviteCode, setInviteCode] = useState('');
  const [relationship, setRelationship] = useState('spouse');
  
  const [loading, setLoading] = useState(false);

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

      // Set parent mode - Supabase automatically stores the session
      localStorage.setItem('user_role', 'parent');
      localStorage.setItem('user_mode', 'parent');
      localStorage.setItem('fgs_mode', 'parent');
      localStorage.setItem('fgs_user_id', loginData.session.user.id);
      
      navigate('/onboarding');
    } catch (error: any) {
      console.error('Signup error:', error);
      toast.error(error.message || 'Failed to create account');
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

      // Set parent mode - Supabase automatically stores the session
      localStorage.setItem('user_role', 'parent');
      localStorage.setItem('user_mode', 'parent');
      localStorage.setItem('fgs_mode', 'parent');
      localStorage.setItem('fgs_user_id', loginData.session.user.id);
      localStorage.setItem('fgs_join_pending', 'true');
      
      navigate('/join-pending');
      
    } catch (error: any) {
      console.error('Join request error:', error);
      toast.error(error.message || 'Failed to submit join request');
    } finally {
      setLoading(false);
    }
  };

  // Path Selection Screen
  if (!signupType) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 p-4 rounded-full">
                <Users className="h-12 w-12 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-3xl">Welcome to Family Growth System</CardTitle>
            <CardDescription className="text-lg">
              How would you like to get started?
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              {/* Create New Family */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => setSignupType('new')}
                  variant="outline"
                  className="w-full h-auto flex flex-col items-center gap-4 p-8 border-2 hover:border-blue-500 hover:bg-blue-50"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center">
                    <Home className="w-10 h-10 text-blue-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-2">Create New Family</h3>
                    <p className="text-sm text-gray-600">I'm the first parent setting up my family</p>
                  </div>
                </Button>
              </motion.div>

              {/* Join Existing Family */}
              <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  onClick={() => setSignupType('join')}
                  variant="outline"
                  className="w-full h-auto flex flex-col items-center gap-4 p-8 border-2 hover:border-purple-500 hover:bg-purple-50"
                >
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center">
                    <UserPlus className="w-10 h-10 text-purple-600" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-xl font-semibold mb-2">Join Existing Family</h3>
                    <p className="text-sm text-gray-600">I have an invite code from my spouse</p>
                  </div>
                </Button>
              </motion.div>
            </div>

            <div className="mt-6 text-center text-sm">
              <span className="text-gray-600">Already have an account? </span>
              <button
                onClick={() => navigate('/login')}
                className="text-blue-600 hover:underline font-medium"
              >
                Log in
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Create New Family Form
  if (signupType === 'new') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4 py-8">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Button
              variant="ghost"
              onClick={() => setSignupType(null)}
              className="absolute top-4 left-4"
            >
              ← Back
            </Button>
            <div className="flex justify-center mb-4">
              <div className="bg-blue-100 p-4 rounded-full">
                <Home className="h-12 w-12 text-blue-600" />
              </div>
            </div>
            <CardTitle className="text-2xl">Create New Family</CardTitle>
            <CardDescription>
              Set up your family account - you'll be the admin
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateNewFamily} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Creating Account...' : 'Create Family Account'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Join Existing Family Form
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Button
            variant="ghost"
            onClick={() => setSignupType(null)}
            className="absolute top-4 left-4"
          >
            ← Back
          </Button>
          <div className="flex justify-center mb-4">
            <div className="bg-purple-100 p-4 rounded-full">
              <UserPlus className="h-12 w-12 text-purple-600" />
            </div>
          </div>
          <CardTitle className="text-2xl">Join Existing Family</CardTitle>
          <CardDescription>
            Create your account and request to join
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleJoinExistingFamily} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="inviteCode">Family Invite Code</Label>
              <Input
                id="inviteCode"
                type="text"
                placeholder="ABC123"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                className="text-center font-mono text-xl tracking-widest"
                maxLength={10}
                required
              />
              <p className="text-xs text-gray-600">
                Ask your spouse for the invite code from their Settings page
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="relationship">Your Relationship</Label>
              <select
                id="relationship"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="spouse">Spouse</option>
                <option value="caregiver">Caregiver / Nanny</option>
                <option value="teacher">Teacher</option>
                <option value="other">Other</option>
              </select>
            </div>

            <hr className="my-4" />

            <div className="space-y-2">
              <Label htmlFor="name">Full Name</Label>
              <div className="relative">
                <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="your@example.com"
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

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <p className="text-sm text-purple-800">
                <strong>📝 Note:</strong> Your request will be sent to the family admin for approval. You'll be notified when approved!
              </p>
            </div>

            <Button type="submit" className="w-full bg-purple-600 hover:bg-purple-700" disabled={loading}>
              {loading ? 'Submitting Request...' : 'Submit Join Request'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}