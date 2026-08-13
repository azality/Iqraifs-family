// ResetPassword — landing page for the password-recovery email link, and
// the FIRST-password page for invited school staff.
//
// Route: /reset-password (outside ProvidersLayout — needs no family
// context; talks to Supabase directly). The supabase client is created
// with detectSessionInUrl: true, so by the time this mounts the recovery
// token in the URL hash has been exchanged for a session. We verify a
// session exists, let the user set a new password via auth.updateUser,
// then send them on their way.
//
// Staff onboarding flow (pilot): admin grants a role (no email sent) →
// the person taps "Forgot password?" on their school's login page →
// email arrives → this page → they set their own password. Nobody ever
// transmits a password to anyone.

import { useEffect, useState } from "react";
import { supabase } from "../../../utils/supabase/client";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { CheckCircle2, KeyRound, AlertTriangle } from "lucide-react";

export function ResetPassword() {
  const [ready, setReady] = useState<"checking" | "ok" | "no-session">("checking");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The recovery hash is consumed asynchronously by the client. Poll
    // briefly rather than racing getSession once.
    let cancelled = false;
    let tries = 0;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) { setReady("ok"); return; }
      tries += 1;
      if (tries < 10) setTimeout(check, 300);
      else setReady("no-session");
    };
    void check();
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    setError(null);
    if (pwd.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (pwd !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pwd });
      if (err) throw err;
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update the password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound className="h-5 w-5 text-indigo-600" />
          <h1 className="text-lg font-semibold text-slate-900">Set your password</h1>
        </div>

        {ready === "checking" && (
          <p className="text-sm text-slate-500 mt-3">Checking your link…</p>
        )}

        {ready === "no-session" && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                This link is invalid or has expired. Go back to your sign-in
                page and tap <strong>"Forgot password?"</strong> to get a fresh
                one — links are valid for a limited time.
              </div>
            </div>
          </div>
        )}

        {ready === "ok" && !done && (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-600">
              Choose a password for your account. You'll use it every time you
              sign in.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="new-pwd">New password</Label>
              <div className="flex gap-2">
                <Input
                  id="new-pwd"
                  type={show ? "text" : "password"}
                  value={pwd}
                  onChange={(e) => setPwd(e.target.value)}
                  placeholder="At least 8 characters"
                  autoFocus
                />
                <Button type="button" variant="outline" onClick={() => setShow((s) => !s)}>
                  {show ? "Hide" : "Show"}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-pwd">Confirm password</Label>
              <Input
                id="confirm-pwd"
                type={show ? "text" : "password"}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void submit(); }}
              />
            </div>
            {error && <p className="text-sm text-rose-600">{error}</p>}
            <Button className="w-full" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Save password"}
            </Button>
          </div>
        )}

        {done && (
          <div className="mt-4 space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <div>
                  Password saved. You're signed in — continue to your
                  dashboard, or use your school's sign-in page next time.
                </div>
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => { window.location.href = "/"; }}
            >
              Continue
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ResetPassword;
