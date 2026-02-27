import { useState, useEffect } from "react";
import * as ReactRouter from "react-router";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { createFamily, createChild, initializeDefaultData, setTemporaryToken, joinFamilyByCode } from "../../utils/api";
import { signup, login } from "../../utils/auth";
import { useAuth } from "../contexts/AuthContext";
import { Users, UserPlus, Mail, Lock, User, Copy, Check, Globe } from "lucide-react";
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { supabase } from '/utils/supabase/client';
import { COMMON_TIMEZONES, getUserTimezone } from '../utils/timezone';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

export function Onboarding() {
  const navigate = ReactRouter.useNavigate();
  const { refreshSession, accessToken, userId } = useAuth();
  
  const [step, setStep] = useState(0); // Start at 0 for auth
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [familyTimezone, setFamilyTimezone] = useState(getUserTimezone());
  const [familyId, setFamilyId] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [childName, setChildName] = useState("");
  const [childPin, setChildPin] = useState(""); // Add PIN state
  const [children, setChildren] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSignup, setIsSignup] = useState(true);
  const [showJoinFamily, setShowJoinFamily] = useState(false);
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [existingFamilyId, setExistingFamilyId] = useState<string | null>(null);
  const [existingFamilyName, setExistingFamilyName] = useState<string | null>(null);
  const [existingChildren, setExistingChildren] = useState<any[]>([]);
  const [hasInviteCode, setHasInviteCode] = useState(false); // New state for invite-based signup

  // Check if user is already authenticated on mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        console.log('🔍 Onboarding - Initial auth check:', {
          hasSession: !!session,
          userId: session?.user?.id,
          currentStep: step
        });
        
        if (session?.user?.id) {
          // User is already authenticated
          console.log('✅ User already authenticated');
          
          // Check if they already have a family in localStorage
          const cachedFamilyId = localStorage.getItem('fgs_family_id');
          
          if (cachedFamilyId) {
            // User already has a family - redirect to dashboard
            console.log('✅ User already has family in cache, redirecting to dashboard');
            toast.success('Welcome back!');
            navigate('/');
            return;
          }
          
          // No cached family - user is in onboarding flow
          // Just move them to family creation step
          console.log('⚠️ User authenticated but no family, moving to family setup');
          setStep(1);
        }
      } catch (error) {
        console.error('Error checking auth on mount:', error);
      }
    };
    
    checkAuth();
  }, []); // Run only on mount

  const handleAuth = async () => {
    if (!email || !password || (isSignup && !name)) {
      toast.error("Please fill in all fields");
      return;
    }

    setLoading(true);
    try {
      console.log('🔐 Starting authentication...');
      
      // Step 1: Signup or Login
      let loginResult;
      if (isSignup) {
        console.log('📝 Creating new account...');
        await signup({ email, password, name, role: 'parent' });
        toast.success("Account created! Logging you in...");
      }
      
      // Login to get session (for both signup and login flows)
      console.log('🔑 Logging in to get session...');
      loginResult = await login(email, password);
      
      console.log('✅ Login successful:', {
        userId: loginResult.user?.id,
        hasAccessToken: !!loginResult.accessToken,
        tokenLength: loginResult.accessToken?.length
      });

      // CRITICAL: Store token in temporary cache IMMEDIATELY
      if (loginResult.accessToken) {
        setTemporaryToken(loginResult.accessToken);
        console.log('💾 Token stored in temporary cache');
      } else {
        throw new Error('No access token received from login');
      }

      // CRITICAL: Wait for session to persist and verify it's available
      console.log('⏳ Waiting for session to persist...');
      let sessionVerified = false;
      let retries = 0;
      const maxRetries = 5;
      
      while (!sessionVerified && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retries * 200)); // Exponential backoff
        
        const { data: { session }, error } = await supabase.auth.getSession();
        console.log(`🔍 Session verification attempt ${retries + 1}/${maxRetries}:`, {
          hasSession: !!session,
          hasAccessToken: !!session?.access_token,
          userId: session?.user?.id,
          error: error?.message
        });
        
        if (session?.access_token && session.access_token === loginResult.accessToken) {
          sessionVerified = true;
          console.log('✅ Session verified and persisted!');
        } else {
          retries++;
        }
      }
      
      if (!sessionVerified) {
        console.error('❌ Session failed to persist after', maxRetries, 'retries');
        // Continue anyway - we have the token in temporary cache
      }

      // Update auth context
      await refreshSession();

      // Move to family creation
      setStep(1);
      toast.success(isSignup ? "Welcome! Let's set up your family." : "Welcome back!");
    } catch (error: any) {
      console.error('❌ Authentication error:', error);
      toast.error(error.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFamily = async () => {
    if (!familyName.trim()) {
      toast.error("Please enter a family name");
      return;
    }

    setLoading(true);
    try {
      // Get current session to ensure we have the latest user ID
      const { data: { session } } = await supabase.auth.getSession();
      const currentUserId = session?.user?.id || userId;
      
      console.log('📝 Pre-createFamily debug info:', {
        hasSession: !!session,
        sessionUserId: session?.user?.id,
        contextUserId: userId,
        currentUserId,
        hasAccessToken: !!session?.access_token,
        accessTokenLength: session?.access_token?.length,
        accessTokenPreview: session?.access_token ? 
          `${session.access_token.substring(0, 40)}...${session.access_token.substring(session.access_token.length - 30)}` : 
          'none',
        familyName,
        expiresAt: session?.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A'
      });
      
      if (!currentUserId) {
        console.error('❌ No user ID available:', {
          session,
          userId,
          accessToken,
          localStorageKeys: Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('auth') || k.includes('sb-'))
        });
        throw new Error('User not logged in - no session found');
      }
      
      console.log('📝 Creating family with userId:', currentUserId);
      
      // CRITICAL DEBUG: Log the exact token being used
      console.log('🔐 Token that will be used for createFamily:', {
        hasSessionToken: !!session?.access_token,
        hasContextToken: !!accessToken,
        willUseToken: session?.access_token || accessToken,
        tokenLength: (session?.access_token || accessToken)?.length,
        tokenPreview: (session?.access_token || accessToken) ? 
          `${(session?.access_token || accessToken).substring(0, 40)}...${(session?.access_token || accessToken).substring((session?.access_token || accessToken).length - 30)}` : 
          'none'
      });
      
      // Create family
      const family = await createFamily(familyName, [currentUserId], familyTimezone);
      setFamilyId(family.id);
      
      // Cache family ID immediately
      localStorage.setItem('fgs_family_id', family.id);
      console.log('✅ Cached family ID:', family.id);
      
      // Initialize default trackable items and providers
      await initializeDefaultData(family.id);
      
      // Store the invite code from family creation response
      if (family.inviteCode) {
        setInviteCode(family.inviteCode);
        console.log('✅ Invite code from family:', family.inviteCode);
      }
      
      toast.success("Family created successfully!");
      setStep(2);
    } catch (error) {
      console.error('Error creating family:', error);
      toast.error("Failed to create family");
    } finally {
      setLoading(false);
    }
  };

  const handleAddChild = async () => {
    if (!childName.trim()) {
      toast.error("Please enter a child name");
      return;
    }
    
    if (!childPin || !/^\d{4}$/.test(childPin)) {
      toast.error("Please enter a 4-digit PIN for the child");
      return;
    }

    setLoading(true);
    try {
      await createChild(childName, familyId, childPin);
      setChildren([...children, childName]);
      setChildName("");
      setChildPin("");
      toast.success(`${childName} added to family!`);
    } catch (error) {
      console.error('Error adding child:', error);
      toast.error("Failed to add child");
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = async () => {
    if (children.length === 0) {
      toast.error("Please add at least one child");
      return;
    }

    // Store family ID in localStorage before navigating
    localStorage.setItem('fgs_family_id', familyId);
    
    await new Promise(resolve => setTimeout(resolve, 100));
    navigate('/');
    toast.success("Setup complete! Welcome to Family Growth System 🎉");
  };

  const handleJoinFamily = async () => {
    if (!inviteCodeInput.trim()) {
      toast.error("Please enter an invite code");
      return;
    }

    setLoading(true);
    try {
      console.log('🔗 Joining family with invite code:', inviteCodeInput);
      
      // Use the new joinFamilyByCode API
      const result = await joinFamilyByCode(inviteCodeInput.trim().toUpperCase());
      
      console.log('✅ Join family result:', result);
      
      // Extract family info from result
      const family = result.family;
      setFamilyId(family.id);
      
      // Cache family ID immediately
      localStorage.setItem('fgs_family_id', family.id);
      console.log('✅ Cached family ID:', family.id);
      
      toast.success(result.message || `Successfully joined ${family.name}!`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Skip to completion - family already has children
      navigate('/');
      toast.success("Welcome to your family! 🎉");
    } catch (error: any) {
      console.error('Error joining family:', error);
      toast.error(error.message || "Invalid invite code. Please check and try again.");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteCode = () => {
    navigator.clipboard.writeText(inviteCode);
    setCopiedInvite(true);
    toast.success("Invite code copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {step === 0 ? (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <Users className="h-12 w-12 text-blue-600" />
              </div>
              <CardTitle className="text-2xl">
                {isSignup ? "Welcome to Family Growth System" : "Welcome Back"}
              </CardTitle>
              <CardDescription>
                {isSignup ? "Create your parent account to get started" : "Sign in to your account"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {isSignup && (
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      id="name"
                      placeholder="Ahmed Ali"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
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
                    onKeyPress={(e) => e.key === 'Enter' && handleAuth()}
                    className="pl-10"
                  />
                </div>
              </div>

              <Button 
                onClick={handleAuth} 
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? "Please wait..." : (isSignup ? "Create Account" : "Sign In")}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setIsSignup(!isSignup)}
                  className="text-sm text-blue-600 hover:underline"
                >
                  {isSignup ? "Already have an account? Sign in" : "Don't have an account? Sign up"}
                </button>
              </div>
            </CardContent>
          </Card>
        ) : step === 1 ? (
          existingFamilyId ? (
            // User already has a family - show welcome back screen
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <Users className="h-12 w-12 text-green-600" />
                </div>
                <CardTitle className="text-2xl">Welcome Back!</CardTitle>
                <CardDescription>
                  You're already part of {existingFamilyName || 'a family'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <h3 className="font-medium text-green-900 mb-2">Your Family</h3>
                  <p className="text-sm text-green-800">
                    <strong>Family:</strong> {existingFamilyName}
                  </p>
                  {existingChildren.length > 0 && (
                    <>
                      <p className="text-sm text-green-800 mt-2">
                        <strong>Children:</strong>
                      </p>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {existingChildren.map((child, index) => (
                          <span
                            key={index}
                            className="px-2 py-1 bg-green-200 rounded text-xs text-green-900"
                          >
                            {child.name}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <Button
                  onClick={() => {
                    navigate('/');
                    toast.success("Welcome back!");
                  }}
                  className="w-full"
                >
                  Continue to Dashboard
                </Button>
              </CardContent>
            </Card>
          ) : showJoinFamily ? (
            // Join existing family with invite code
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <Users className="h-12 w-12 text-purple-600" />
                </div>
                <CardTitle className="text-2xl">Join a Family</CardTitle>
                <CardDescription>
                  Enter the invite code shared by your spouse
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="inviteCode">Invite Code</Label>
                  <Input
                    id="inviteCode"
                    placeholder="ABC123XYZ"
                    value={inviteCodeInput}
                    onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                    onKeyPress={(e) => e.key === 'Enter' && handleJoinFamily()}
                  />
                  <p className="text-xs text-gray-600">
                    Ask your spouse to create a family and share the invite code with you
                  </p>
                </div>

                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <h3 className="font-medium text-purple-900 mb-2">What Happens Next?</h3>
                  <ul className="space-y-1 text-sm text-purple-800">
                    <li>✓ You'll be added to the existing family</li>
                    <li>✓ All children and data will be accessible</li>
                    <li>✓ Both parents can track and manage behaviors</li>
                    <li>✓ Full audit trail for transparency</li>
                  </ul>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowJoinFamily(false)}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleJoinFamily}
                    className="flex-1"
                    disabled={loading || !inviteCodeInput.trim()}
                  >
                    {loading ? 'Joining...' : 'Join Family'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            // Create new family
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <Users className="h-12 w-12 text-blue-600" />
                </div>
                <CardTitle className="text-2xl">Set Up Your Family</CardTitle>
                <CardDescription>
                  Create a new family or join an existing one
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="familyName">Family Name</Label>
                  <Input
                    id="familyName"
                    placeholder="The Ahmed Family"
                    value={familyName}
                    onChange={(e) => setFamilyName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleCreateFamily()}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="familyTimezone">Timezone</Label>
                  <Select
                    value={familyTimezone}
                    onValueChange={setFamilyTimezone}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select timezone">
                        {familyTimezone}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent className="w-full">
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label} ({tz.offset})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h3 className="font-medium text-blue-900 mb-2">What You'll Get:</h3>
                  <ul className="space-y-1 text-sm text-blue-800">
                    <li>✓ Multi-parent collaboration with governance rules</li>
                    <li>✓ Behavior tracking with positive reinforcement</li>
                    <li>✓ Islamic values integration (Salah, Quran)</li>
                    <li>✓ Attendance & billing management</li>
                    <li>✓ Weekly analytics and family reviews</li>
                    <li>✓ Complete audit trail for transparency</li>
                  </ul>
                </div>

                <Button
                  onClick={handleCreateFamily}
                  className="w-full"
                  disabled={loading || !familyName.trim()}
                >
                  {loading ? 'Creating...' : 'Create Family'}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-white text-gray-500">OR</span>
                  </div>
                </div>

                <Button
                  onClick={() => setShowJoinFamily(true)}
                  variant="outline"
                  className="w-full"
                >
                  Join Existing Family
                </Button>
                
                <div className="pt-4 border-t">
                  <Button
                    onClick={async () => {
                      // Clear all auth tokens and data
                      await supabase.auth.signOut();
                      localStorage.clear();
                      sessionStorage.clear();
                      toast.success("Logged out successfully");
                      // Reset to login screen
                      setStep(0);
                      setEmail("");
                      setPassword("");
                      setName("");
                    }}
                    variant="ghost"
                    className="w-full text-gray-600 hover:text-gray-900"
                  >
                    ← Back to Login
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        ) : step === 2 ? (
          inviteCode ? (
            // Show invite code after family creation
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <Check className="h-12 w-12 text-green-600" />
                </div>
                <CardTitle className="text-2xl">Family Created!</CardTitle>
                <CardDescription>
                  Share this invite code with your spouse
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-100 rounded-lg border-2 border-blue-200">
                  <Label className="text-sm text-gray-600 mb-2 block">Your Family Invite Code</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-3xl font-bold text-blue-600 tracking-wider text-center py-2">
                      {inviteCode}
                    </code>
                    <Button
                      onClick={copyInviteCode}
                      variant="outline"
                      size="sm"
                      className="flex-shrink-0"
                    >
                      {copiedInvite ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <h3 className="font-medium text-amber-900 mb-2">📱 How to Share</h3>
                  <ol className="space-y-1 text-sm text-amber-800 list-decimal list-inside">
                    <li>Copy the invite code above</li>
                    <li>Send it to your spouse via text or email</li>
                    <li>They should sign up and use "Join Existing Family"</li>
                    <li>Enter this code to join your family</li>
                  </ol>
                </div>

                <Button
                  onClick={() => setStep(3)}
                  className="w-full"
                >
                  Continue - Add Children
                </Button>
              </CardContent>
            </Card>
          ) : (
            // Add children screen
            <Card>
              <CardHeader className="text-center">
                <div className="flex justify-center mb-4">
                  <UserPlus className="h-12 w-12 text-green-600" />
                </div>
                <CardTitle className="text-2xl">Add Your Children</CardTitle>
                <CardDescription>
                  Add the children who will participate in the growth system
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="childName">Child Name & 4-Digit PIN</Label>
                  <div className="flex gap-2">
                    <Input
                      id="childName"
                      placeholder="Yusuf"
                      value={childName}
                      onChange={(e) => setChildName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddChild()}
                      className="flex-1"
                    />
                    <Input
                      id="childPin"
                      type="tel"
                      placeholder="1234"
                      value={childPin}
                      onChange={(e) => setChildPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      onKeyPress={(e) => e.key === 'Enter' && handleAddChild()}
                      maxLength={4}
                      className="w-28"
                    />
                    <Button
                      onClick={handleAddChild}
                      disabled={loading}
                    >
                      Add
                    </Button>
                  </div>
                  <p className="text-xs text-gray-600">Each child needs a 4-digit PIN for Kid Mode login</p>
                </div>

                {children.length > 0 && (
                  <div className="space-y-2">
                    <Label>Children Added ({children.length})</Label>
                    <div className="flex flex-wrap gap-2">
                      {children.map((name, index) => (
                        <div
                          key={index}
                          className="px-3 py-2 bg-green-100 border border-green-200 rounded-md text-sm font-medium text-green-900"
                        >
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setStep(1)}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button
                    onClick={handleComplete}
                    disabled={children.length === 0}
                    className="flex-1"
                  >
                    Complete Setup
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <UserPlus className="h-12 w-12 text-green-600" />
              </div>
              <CardTitle className="text-2xl">Add Your Children</CardTitle>
              <CardDescription>
                Add the children who will participate in the growth system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="childName">Child Name</Label>
                <div className="flex gap-2">
                  <Input
                    id="childName"
                    placeholder="Yusuf"
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddChild()}
                  />
                  <Input
                    id="childPin"
                    placeholder="PIN"
                    value={childPin}
                    onChange={(e) => setChildPin(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddChild()}
                  />
                  <Button 
                    onClick={handleAddChild}
                    disabled={loading}
                  >
                    Add
                  </Button>
                </div>
              </div>

              {children.length > 0 && (
                <div className="space-y-2">
                  <Label>Children Added ({children.length})</Label>
                  <div className="flex flex-wrap gap-2">
                    {children.map((name, index) => (
                      <div 
                        key={index}
                        className="px-3 py-2 bg-green-100 border border-green-200 rounded-md text-sm font-medium text-green-900"
                      >
                        {name}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <Button 
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button 
                  onClick={handleComplete}
                  disabled={children.length === 0}
                  className="flex-1"
                >
                  Complete Setup
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}