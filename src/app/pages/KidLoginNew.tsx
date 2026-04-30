import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { toast } from 'sonner';
import { ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { projectId, publicAnonKey } from '/utils/supabase/info.tsx';
import { setKidMode } from '../utils/auth';
import { getStorageSync, setStorageSync, removeStorageSync } from '../../utils/storage';

const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-f116e23f`;

// v24: device-trust for kid login. After the first successful family-code
// verification on a device, store the verified code so subsequent kid
// logins skip step 1 entirely. The token is family-scoped (not user-scoped)
// so it survives parent log-out — appropriate for a shared family tablet.
// A single Settings affordance ("Untrust this device") clears it.
const TRUSTED_FAMILY_KEY = 'iqra_trusted_family_code';

interface Kid {
  id: string;
  name: string;
  avatar: string;
}

type Step = 'code' | 'select' | 'pin';

export function KidLoginNew() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('code');
  const [familyCode, setFamilyCode] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [kids, setKids] = useState<Kid[]>([]);
  const [selectedKid, setSelectedKid] = useState<Kid | null>(null);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  // v24: when we auto-skipped step 1 from a trusted-device token, expose
  // a "Use a different family" link on step 2 so a switched tablet can
  // override and re-enter the code manually.
  const [trustedAutoFilled, setTrustedAutoFilled] = useState(false);

  // v24: shared verifier — used both by the explicit form submit AND by
  // the auto-skip path on mount. Returns true on success.
  const verifyFamilyCode = async (rawCode: string, opts: { silent?: boolean } = {}) => {
    const code = rawCode.trim().toUpperCase();
    if (code.length < 4) return false;
    try {
      const res = await fetch(`${API_BASE}/public/verify-family-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': publicAnonKey },
        body: JSON.stringify({ familyCode: code }),
      });
      const response = await res.json();
      if (response.success) {
        setFamilyCode(code);
        setFamilyName(response.familyName);
        setKids(response.kids);
        setStep('select');
        if (!opts.silent) toast.success(response.message);
        // Persist verified-good code so future logins on this device skip step 1.
        setStorageSync(TRUSTED_FAMILY_KEY, code);
        return true;
      } else {
        if (!opts.silent) toast.error(response.error || 'Invalid family code');
        return false;
      }
    } catch (error) {
      console.error('Family code verification error:', error);
      if (!opts.silent) toast.error('Failed to verify family code');
      return false;
    }
  };

  // v24: on mount, if this device has a trusted family token, verify it
  // silently and skip step 1. If verification fails (rotated code, removed
  // family) we clear the bad token and let the user enter the code
  // manually. No error toast — the kid never sees that we tried.
  useEffect(() => {
    const stored = getStorageSync(TRUSTED_FAMILY_KEY) as string | null;
    if (!stored || typeof stored !== 'string' || stored.length < 4) return;
    let cancelled = false;
    (async () => {
      const ok = await verifyFamilyCode(stored, { silent: true });
      if (cancelled) return;
      if (ok) {
        setTrustedAutoFilled(true);
      } else {
        removeStorageSync(TRUSTED_FAMILY_KEY);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (familyCode.length < 4) {
      toast.error('Please enter your family code');
      return;
    }
    setLoading(true);
    try {
      await verifyFamilyCode(familyCode);
    } finally {
      setLoading(false);
    }
  };

  // v24: "Not your family?" — clears the trusted token, drops back to step 1.
  const handleSwitchFamily = () => {
    removeStorageSync(TRUSTED_FAMILY_KEY);
    setTrustedAutoFilled(false);
    setKids([]);
    setSelectedKid(null);
    setFamilyCode('');
    setFamilyName('');
    setStep('code');
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
            childId: selectedKid.id,
            pin: pinValue,
          }),
        }
      );

      console.log('📡 Kid login response status:', res.status, res.statusText);

      if (!res.ok) {
        const errorData = await res.json();
        console.error('❌ Kid login failed:', errorData);
        toast.error(errorData.error || 'Login failed');
        setPin('');
        setLoading(false);
        return;
      }

      const rawResponseText = await res.text();

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
      } catch (parseError) {
        console.error('❌ CRITICAL: Failed to parse response JSON!', parseError);
        toast.error('Invalid response from server');
        setPin('');
        setLoading(false);
        return;
      }

      console.log('✅ Kid login successful:', {
        kidId: response.kid?.id,
        kidName: response.kid?.name,
        hasFamilyId: !!response.kid?.familyId,
        hasToken: !!response.kidAccessToken,
        tokenLength: response.kidAccessToken?.length,
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

      try {
        // CRITICAL: Set flag to skip session validation on next app load
        sessionStorage.setItem('kid_just_logged_in', 'true');

        setKidMode(
          response.kidAccessToken,
          response.kid,
          response.familyCode
        );

        const immediateCheck = {
          kid_access_token: getStorageSync('kid_access_token'),
          kid_session_token: getStorageSync('kid_session_token'),
        };

        if (!immediateCheck.kid_access_token && !immediateCheck.kid_session_token) {
          console.error('❌ CRITICAL: setKidMode completed but tokens are STILL not in localStorage!');
          throw new Error('CRITICAL: localStorage tokens disappeared after setKidMode completed');
        }
      } catch (error) {
        console.error('❌ CRITICAL: setKidMode failed!', error);
        toast.error(`Failed to save login session: ${error instanceof Error ? error.message : 'Unknown error'}`);
        setPin('');
        setLoading(false);
        return;
      }

      // CRITICAL: Force trigger FamilyContext to reload data with kid session
      window.dispatchEvent(new CustomEvent('family-data-reload', {
        detail: {
          reason: 'kid-login-complete',
          kidId: response.kid.id,
          familyId: response.kid.familyId
        }
      }));

      // Small delay to ensure FamilyContext picks up the new session
      await new Promise(resolve => setTimeout(resolve, 100));

      toast.success(response.message || `Welcome back, ${response.kid.name}! 🌟`);

      // Small delay to ensure localStorage is fully written
      setTimeout(() => {
        navigate('/kid/home');
      }, 100);
    } catch (error) {
      console.error('Kid login error:', error);
      toast.error('Something went wrong. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
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
      navigate('/welcome');
    }
  };

  // Step indicator
  const stepIndex = step === 'code' ? 0 : step === 'select' ? 1 : 2;

  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
      {/* Warm decorative background — kid-friendly */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-orange-50/60 to-rose-50/40 pointer-events-none" />
      <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-amber-200/40 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-rose-200/40 blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[28rem] w-[28rem] rounded-full bg-orange-200/20 blur-3xl pointer-events-none" />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-5">
        <button
          onClick={handleBack}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <button
          onClick={() => navigate('/welcome')}
          className="flex items-center gap-2"
          aria-label="Iqra home"
        >
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white font-bold shadow-md">
            ﷽
          </div>
          <span className="hidden sm:inline font-bold text-gray-900">Iqra</span>
        </button>
      </div>

      <div className="relative z-10 px-4 pb-12 pt-2 sm:pt-4 flex items-center justify-center min-h-[calc(100vh-80px)]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-md"
        >
          {/* Step pips */}
          <div className="flex items-center justify-center gap-2 mb-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? 'w-8 bg-gradient-to-r from-amber-500 to-orange-500'
                    : i < stepIndex
                    ? 'w-2 bg-amber-300'
                    : 'w-2 bg-gray-200'
                }`}
              />
            ))}
          </div>

          <div className="rounded-3xl bg-white/90 backdrop-blur shadow-xl ring-1 ring-amber-100 p-6 sm:p-8">
            <AnimatePresence mode="wait">
              {/* STEP 1: Family code */}
              {step === 'code' && (
                <motion.div
                  key="code"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center h-16 w-16 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 text-white text-3xl shadow-lg shadow-amber-500/20 mb-4">
                      🏡
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Hi there!</h1>
                    <p className="mt-2 text-sm text-gray-600">
                      Ask a parent for your <span className="font-semibold">family code</span> to get started.
                    </p>
                  </div>

                  <form onSubmit={handleCodeSubmit} className="space-y-5">
                    <div className="space-y-2">
                      <Label htmlFor="familyCode" className="text-sm font-medium text-gray-700">
                        Family code
                      </Label>
                      <Input
                        id="familyCode"
                        type="text"
                        value={familyCode}
                        onChange={(e) => setFamilyCode(e.target.value.toUpperCase())}
                        placeholder="ABC123"
                        className="h-14 rounded-xl border-amber-200 bg-white text-center text-2xl font-mono tracking-widest focus-visible:ring-amber-500"
                        maxLength={10}
                        autoFocus
                        autoCapitalize="characters"
                        autoComplete="off"
                      />
                    </div>

                    <Button
                      type="submit"
                      disabled={loading || familyCode.length < 4}
                      className="w-full h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-base shadow-md shadow-amber-500/20"
                    >
                      {loading ? 'Checking…' : 'Next'}
                    </Button>
                  </form>
                </motion.div>
              )}

              {/* STEP 2: Pick a kid */}
              {step === 'select' && (
                <motion.div
                  key="select"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 text-3xl mb-3">
                      👋
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Welcome to {familyName}!</h1>
                    <p className="mt-2 text-sm text-gray-600">Tap your name to continue.</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    {kids.map((kid) => (
                      <motion.button
                        key={kid.id}
                        type="button"
                        whileHover={{ y: -2, scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleKidSelect(kid)}
                        className="p-5 rounded-2xl bg-white border-2 border-amber-100 hover:border-amber-400 hover:shadow-lg transition-all flex flex-col items-center gap-2.5"
                      >
                        <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-amber-100 to-orange-100 flex items-center justify-center text-4xl">
                          {kid.avatar}
                        </div>
                        <div className="text-base font-semibold text-gray-900 text-center">{kid.name}</div>
                      </motion.button>
                    ))}
                  </div>

                  <p className="text-center text-xs text-gray-500">
                    Family code: <span className="font-mono font-semibold text-gray-700">{familyCode}</span>
                  </p>

                  {/* v24: when we auto-skipped step 1 from a trusted-device
                      token, expose a way to switch families on a shared
                      tablet (visiting cousin) without entering Settings. */}
                  {trustedAutoFilled && (
                    <button
                      type="button"
                      onClick={handleSwitchFamily}
                      className="mt-2 block mx-auto text-xs text-amber-700 hover:text-amber-800 hover:underline"
                    >
                      Not your family? Use a different code
                    </button>
                  )}
                </motion.div>
              )}

              {/* STEP 3: PIN */}
              {step === 'pin' && (
                <motion.div
                  key="pin"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="text-center mb-5">
                    {selectedKid && (
                      <div className="inline-flex items-center justify-center h-16 w-16 rounded-3xl bg-gradient-to-br from-amber-100 to-orange-100 text-4xl mb-3">
                        {selectedKid.avatar}
                      </div>
                    )}
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
                      Hi, {selectedKid?.name}!
                    </h1>
                    <p className="mt-1.5 text-sm text-gray-600">Enter your secret PIN.</p>
                  </div>

                  {/* PIN Display */}
                  <div className="flex justify-center gap-2.5 mb-6">
                    {[0, 1, 2, 3].map((i) => (
                      <motion.div
                        key={i}
                        animate={{
                          scale: pin.length === i + 1 ? [1, 1.15, 1] : 1
                        }}
                        transition={{ duration: 0.25 }}
                        className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl font-bold transition-all ${
                          pin.length > i
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-md shadow-amber-500/30'
                            : 'bg-amber-50 border-2 border-dashed border-amber-200 text-amber-300'
                        }`}
                      >
                        {pin.length > i ? '●' : ''}
                      </motion.div>
                    ))}
                  </div>

                  {/* Number pad */}
                  <div className="grid grid-cols-3 gap-2.5 max-w-xs mx-auto">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <motion.button
                        key={num}
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={() => handlePinInput(num.toString())}
                        disabled={loading || pin.length >= 4}
                        className="h-14 sm:h-16 rounded-2xl bg-white border border-amber-100 hover:bg-amber-50 hover:border-amber-300 active:bg-amber-100 text-2xl font-semibold text-gray-800 transition-colors disabled:opacity-40 shadow-sm"
                      >
                        {num}
                      </motion.button>
                    ))}

                    <div /> {/* empty cell */}

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={() => handlePinInput('0')}
                      disabled={loading || pin.length >= 4}
                      className="h-14 sm:h-16 rounded-2xl bg-white border border-amber-100 hover:bg-amber-50 hover:border-amber-300 active:bg-amber-100 text-2xl font-semibold text-gray-800 transition-colors disabled:opacity-40 shadow-sm"
                    >
                      0
                    </motion.button>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.92 }}
                      onClick={handlePinDelete}
                      disabled={loading || pin.length === 0}
                      aria-label="Delete last digit"
                      className="h-14 sm:h-16 rounded-2xl bg-rose-50 border border-rose-100 hover:bg-rose-100 active:bg-rose-200 text-2xl font-semibold text-rose-600 transition-colors disabled:opacity-40"
                    >
                      ⌫
                    </motion.button>
                  </div>

                  {loading && (
                    <p className="text-center text-sm text-gray-600 mt-5">Logging in…</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-5 text-center text-sm">
            <span className="text-gray-600">Are you a parent? </span>
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-amber-700 hover:text-amber-800 hover:underline font-semibold"
            >
              Sign in here
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
