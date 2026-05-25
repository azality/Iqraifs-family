// PortalChangePin — set or change the portal PIN. Route: /school-portal/change-pin

import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { HeroCard } from "../../components/school-ui";
import { usePinAuth } from "../../contexts/PinAuthContext";
import { pinChange } from "../../../utils/schoolPortalApi";

export function PortalChangePin() {
  const navigate = useNavigate();
  const { subject, refresh } = usePinAuth();
  const mustChange = subject?.mustChange ?? false;

  const [currentPin, setCurrentPin] = useState<string>("");
  const [newPin, setNewPin] = useState<string>("");
  const [confirmPin, setConfirmPin] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const sanitize = (v: string) => v.replace(/\D/g, "").slice(0, 4);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (newPin.length !== 4) return setError("PIN must be 4 digits.");
    if (newPin !== confirmPin) return setError("New PIN does not match confirmation.");
    if (!mustChange && currentPin.length !== 4) return setError("Enter your current PIN.");
    setBusy(true);
    try {
      await pinChange({
        currentPin: mustChange ? undefined : currentPin,
        newPin,
      });
      await refresh();
      navigate("/school-portal", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update PIN.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <HeroCard
        title="Set your PIN"
        subtitle={mustChange ? "Choose a 4-digit PIN before you continue." : "Change your portal PIN."}
      />
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 max-w-md">
        <form className="space-y-4" onSubmit={onSubmit}>
          {!mustChange && (
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                Current PIN
              </label>
              <input
                type="password"
                value={currentPin}
                onChange={(e) => setCurrentPin(sanitize(e.target.value))}
                inputMode="numeric"
                maxLength={4}
                required
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm tracking-widest"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              New PIN
            </label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(sanitize(e.target.value))}
              inputMode="numeric"
              maxLength={4}
              required
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm tracking-widest"
            />
          </div>
          <div>
            <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Confirm new PIN
            </label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(sanitize(e.target.value))}
              inputMode="numeric"
              maxLength={4}
              required
              className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm tracking-widest"
            />
          </div>

          {error && (
            <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full inline-flex justify-center items-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-md px-3 py-2 text-sm"
          >
            {busy ? "Saving…" : "Save PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
