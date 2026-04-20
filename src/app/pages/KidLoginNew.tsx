import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { supabase } from '../../../utils/supabase/client';
import { motion } from 'motion/react';
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { setKidMode } from '../utils/auth';
import { getStorage, setStorage, removeStorage } from '../../../utils/storage';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

interface Kid {
  id: string;
  name: string;
  avatar: string;
}

export function KidLoginNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState<'code' | 'select' | 'pin'>('code');
  const [familyCode, setFamilyCode] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [kids, setKids] = useState<Kid[]>([]);
  const [selectedKid, setSelectedKid] = useState<Kid | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (familyCode.length < 4) {
      toast.error('Please enter your family code');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/public/verify-family-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': publicAnonKey
        },
        body: JSON.stringify({
          familyCode: familyCode.trim().toUpperCase()
        })
      });

      const response = await res.json();

      if (response.success) {
        setFamilyId(response.familyId);
        setFamilyName(response.familyName);
        setKids(response.kids);
        toast.success(response.message);
        setStep('select');
      } else {
        toast.error(response.error || 'Invalid family code');
      }
    } catch (error) {
      console.error('Family code verification error:', error);
      toast.error('Failed to verify family code');
    } finally {
      setLoading(false);
    }
  };

  const handleKidSelect = (kid: Kid) => {
    setSelectedKid(kid);
    setStep('pin');
  };

  const handlePinInput = (digit: string) => {
    if (pin.length < 4) {
      const newPin = pin + digit;
      setPin(newPin);
      
      // Auto-submit when 4 digits entered
      if (newPin.length === 4) {
        setTimeout(() => {
          // Call verification directly with the new pin value
          verifyPin(newPin);
        }, 300);
      }
    }
  };

  const verifyPin = async (pinValue: string) => {
    if (pinValue.length !== 4) {
      toast.error('PIN must be 4 digits');
      return;
    }

    if (!selectedKid) {
      toast.error('Please select a kid');
      return;
    }

    setLoading(true);

    try {
      console.log('🔐 Attempting kid login with:', { 
        familyCode, 
        childId: selectedKid, 
        hasPin: !!pin 
      });

      const res = await fetch(
        `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f/kid/login`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${publicAnonKey}`
          },
          body: JSON.stringify({
            familyCode,
            childId: selectedKid.id, // CRITICAL FIX: Send kid ID, not the whole object
            pin: pinValue, // CRITICAL FIX: Use pinValue parameter instead of pin state
          }),
        }
      );

      console.log('📡 Kid login response status:', res.status, res.statusText);
      console.log('📡 Response headers:', Object.fromEntries(res.headers.entries()));
      console.log('📡 Response ok:', res.ok);

      if (!res.ok) {
        const errorData = await res.json();
        console.error('❌ Kid login failed:', errorData);
        toast.error(errorData.error || 'Login failed');
        setPin('');
        setLoading(false);
        return;
      }

      const rawResponseText = await res.text();
      console.log('📡 RAW response text:', rawResponseText);
      console.log('📡 RAW response length:', rawResponseText.length);
      
      // CRITICAL: Check if response is empty or malformed
      if (!rawResponseText || rawResponseText.trim().length === 0) {
        console.error('❌ CRITICAL: Backend returned empty response!');
        toast.error('Server returned empty response');
        setPin('');
        setLoading(false);
        return;
      }
      
      let response: any;
      try {
        response = JSON.parse(rawResponseText);
        console.log('✅ Parsed JSON response:', response);
        console.log('✅ Response keys:', Object.keys(response));
        console.log('✅ Response.success:', response.success);
        console.log('✅ Response.kidAccessToken exists:', !!response.kidAccessToken);
        console.log('✅ Response.kidAccessToken value:', response.kidAccessToken);
        console.log('✅ Response.kid:', response.kid);
        console.log('✅ Full response JSON:', JSON.stringify(response, null, 2));
      } catch (parseError) {
        console.error('❌ CRITICAL: Failed to parse response JSON!', parseError);
        console.error('❌ Raw text that failed to parse:', rawResponseText);
        toast.error('Invalid response from server');
        setPin('');
        setLoading(false);
        return;
      }
      
      // CRITICAL: Clear any existing kid session first to prevent conflicts
      // UPDATE: Removed this clearing - setKidMode will handle it properly
      // Clearing here then setting in setKidMode creates a race condition
      console.log('✅ Skipping pre-clear - setKidMode will handle session setup');
      
      // Store kid session
      console.log('✅ Kid login successful, RAW RESPONSE:', response);
      console.log('✅ Checking response data:', {
        kidId: response.kid?.id,
        kidName: response.kid?.name,
        hasFamilyId: !!response.kid?.familyId,
        familyId: response.kid?.familyId,
        hasToken: !!response.kidAccessToken,
        tokenLength: response.kidAccessToken?.length,
        tokenType: typeof response.kidAccessToken,
        tokenPreview: response.kidAccessToken?.substring(0, 30),
        fullResponse: JSON.stringify(response, null, 2)
      });
      
      // CRITICAL VALIDATION: Ensure backend returned all required data
      if (!response.kidAccessToken) {
        console.error('❌ CRITICAL: Backend did not return kidAccessToken!', response);
        toast.error('Login error: No access token received');
        setPin('');
        setLoading(false);
        return;
      }
      
      if (!response.kid?.id) {
        console.error('❌ CRITICAL: Backend did not return kid.id!', response);
        toast.error('Login error: No kid ID received');
        setPin('');
        setLoading(false);
        return;
      }
      
      if (!response.kid?.familyId) {
        console.error('❌ CRITICAL: Backend did not return kid.familyId!', response);
        toast.error('Login error: No family ID received');
        setPin('');
        setLoading(false);
        return;
      }
      
      console.log('✅ Backend response validation passed, calling setKidMode...');
      
      try {
        // CRITICAL: Set flag to skip session validation on next app load
        // This prevents race condition where App.tsx tries to validate before KV store write completes
        sessionStorage.setItem('kid_just_logged_in', 'true');
        
        setKidMode(
          response.kidAccessToken,
          response.kid,
          response.familyCode
        );
        
        console.log('✅ setKidMode completed successfully');
        
        // CRITICAL: Immediately verify localStorage was actually written
        console.log('🔍 IMMEDIATE localStorage verification after setKidMode:');
        const immediateCheck = {
          user_mode: await getStorage('user_mode'),
          user_role: await getStorage('user_role'),
          kid_access_token: await getStorage('kid_access_token'),
          kid_session_token: await getStorage('kid_session_token'),
          kid_id: await getStorage('kid_id'),
          child_id: await getStorage('child_id'),
          kid_name: await getStorage('kid_name'),
          kid_avatar: await getStorage('kid_avatar'),
          fgs_family_id: await getStorage('fgs_family_id'),
          allKeys: Object.keys(localStorage)
        };
        console.log('📊 Immediate check results:', immediateCheck);
        
        // CRITICAL: If token is still not in localStorage, something is very wrong
        if (!immediateCheck.kid_access_token && !immediateCheck.kid_session_token) {
          console.error('❌ CRITICAL: setKidMode completed but tokens are STILL not in localStorage!');
          console.error('❌ This should be IMPOSSIBLE - setKidMode has write verification');
          console.error('❌ Response data:', { response });
          console.error('❌ Something is clearing localStorage AFTER setKidMode writes');
          throw new Error('CRITICAL: localStorage tokens disappeared after setKidMode completed');
        }
        
        console.log('✅ Immediate verification passed - tokens are in localStorage');
      } catch (error) {
        console.error('❌ CRITICAL: setKidMode failed!', error);
        console.error('❌ Error name:', error instanceof Error ? error.name : 'unknown');
        console.error('❌ Error message:', error instanceof Error ? error.message : String(error));
        console.error('❌ Error stack:', error instanceof Error ? error.stack : 'no stack');
        console.error('❌ Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          responseData: response
        });
        toast.error(`Failed to save login session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setPin('');
        setLoading(false);
        return;
      }
      
      console.log('✅ Kid session stored, checking localStorage:', {
        user_role: await getStorage('user_role'),
        user_mode: await getStorage('user_mode'),
        kid_session_token: !!await getStorage('kid_session_token'),
        kid_session_token_length: await getStorage('kid_session_token')?.length,
        kid_access_token: !!await getStorage('kid_access_token'),
        kid_access_token_length: await getStorage('kid_access_token')?.length,
        child_id: await getStorage('child_id'),
        kid_id: await getStorage('kid_id'),
        fgs_family_id: await getStorage('fgs_family_id')
      });

      // CRITICAL: Force trigger FamilyContext to reload data with kid session
      console.log('🔄 Dispatching family-data-reload event to force FamilyContext refresh');
      window.dispatchEvent(new CustomEvent('family-data-reload', {
        detail: { 
          reason: 'kid-login-complete',
          kidId: response.kid.id,
          familyId: response.kid.familyId
        }
      }));
      
      // CRITICAL: Add a small delay to ensure FamilyContext picks up the new session
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('📍 Redirecting to kid dashboard...');
      
      toast.success(response.message || `Welcome back, ${response.kid.name}! 🌟`);
      
      console.log('🚀 Navigating to /kid/home...');
      
      // Small delay to ensure localStorage is fully written
      setTimeout(() => {
        console.log('🚀 Executing navigate() now...');
        console.log('🔍 Final localStorage check before navigate:', {
          user_mode: await getStorage('user_mode'),
          kid_access_token: !!await getStorage('kid_access_token'),
          user_role: await getStorage('user_role')
        });
        
        // Navigate to kid dashboard
        navigate('/kid/home');
        
        console.log('✅ navigate() called, should be routing now');
      }, 100);
    } catch (error) {
      console.error('Kid login error:', error);
      toast.error('Something went wrong. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyPin(pin);
  };

  const handlePinDelete = () => {
    setPin(pin.slice(0, -1));
  };

  const handleBack = () => {
    if (step === 'select') {
      setStep('code');
      setKids([]);
      setSelectedKid(null);
    } else if (step === 'pin') {
      setStep('select');
      setPin('');
    } else {
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFF8E7] to-[#FFE5CC] px-4 py-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center relative">
          <Button
            variant="ghost"
            onClick={handleBack}
            className="absolute top-4 left-4"
            disabled={loading}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          
          <div className="text-6xl mb-4">👶</div>
          <CardTitle className="text-3xl">Kid Login</CardTitle>
          <CardDescription className="text-lg">
            {step === 'code' && 'Enter your family code'}
            {step === 'select' && "Select your name"}
            {step === 'pin' && 'Enter your secret PIN'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Step 1: Family Code */}
          {step === 'code' && (
            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div>
                <Label htmlFor="familyCode" className="text-lg">Family Code</Label>
                <Input
                  id="familyCode"
                  type="text"
                  value={familyCode}
                  onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  className="text-2xl text-center font-mono tracking-wider"
                  maxLength={10}
                  autoFocus
                />
                <p className="text-sm text-gray-600 mt-2">
                  Ask a parent for the family code
                </p>
              </div>
              
              <Button type="submit" className="w-full" size="lg">
                Next
              </Button>
            </form>
          )}

          {/* Step 2: Kid Name */}
          {step === 'select' && (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-4 text-center">
                  Welcome to <span className="font-semibold">{familyName}</span>! 🏡
                </p>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  {kids.map((kid) => (
                    <motion.button
                      key={kid.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleKidSelect(kid)}
                      className={`p-6 rounded-2xl border-4 transition-all flex flex-col items-center gap-3 ${
                        selectedKid?.id === kid.id
                          ? 'border-[#F4C430] bg-[#F4C430]/20'
                          : 'border-gray-300 bg-white hover:border-[#F4C430]/50'
                      }`}
                    >
                      <div className="text-5xl">{kid.avatar}</div>
                      <div className="text-lg font-semibold">{kid.name}</div>
                    </motion.button>
                  ))}
                </div>
                
                <p className="text-xs text-gray-500 text-center">
                  Family code: <span className="font-mono font-semibold">{familyCode}</span>
                </p>
              </div>
            </div>
          )}

          {/* Step 3: PIN Entry */}
          {step === 'pin' && (
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-sm text-gray-600 mb-4">
                  Hi, <span className="font-semibold">{selectedKid?.name}</span>!
                </p>
                
                {/* PIN Display */}
                <div className="flex justify-center gap-3 mb-8">
                  {[0, 1, 2, 3].map((i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8 }}
                      animate={{ scale: pin.length > i ? 1 : 0.8 }}
                      className={`w-16 h-16 rounded-2xl border-4 flex items-center justify-center text-3xl font-bold transition-all ${
                        pin.length > i
                          ? 'border-[#F4C430] bg-[#F4C430]/20 text-[#F4C430]'
                          : 'border-gray-300 bg-white text-gray-400'
                      }`}
                    >
                      {pin.length > i ? '●' : '○'}
                    </motion.div>
                  ))}
                </div>

                {/* Number Pad */}
                <div className="grid grid-cols-3 gap-3 max-w-xs mx-auto">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                    <motion.button
                      key={num}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handlePinInput(num.toString())}
                      disabled={loading || pin.length >= 4}
                      className="h-16 rounded-xl bg-white border-2 border-gray-300 hover:border-[#F4C430] hover:bg-[#F4C430]/10 text-2xl font-bold transition-all disabled:opacity-50"
                    >
                      {num}
                    </motion.button>
                  ))}
                  
                  <div /> {/* Empty space */}
                  
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handlePinInput('0')}
                    disabled={loading || pin.length >= 4}
                    className="h-16 rounded-xl bg-white border-2 border-gray-300 hover:border-[#F4C430] hover:bg-[#F4C430]/10 text-2xl font-bold transition-all disabled:opacity-50"
                  >
                    0
                  </motion.button>
                  
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handlePinDelete}
                    disabled={loading || pin.length === 0}
                    className="h-16 rounded-xl bg-red-100 border-2 border-red-300 hover:bg-red-200 text-red-600 font-bold transition-all disabled:opacity-50"
                  >
                    ⌫
                  </motion.button>
                </div>

                {loading && (
                  <p className="text-sm text-gray-600 mt-4">Logging in...</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}