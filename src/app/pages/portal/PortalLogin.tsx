// PortalLogin — entry point for student & parent PIN sign-in.
// Route: /school-login

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePinAuth } from "../../contexts/PinAuthContext";
import { LanguageDropdown } from "../../components/LanguageDropdown";
import {
  getOrgBySlug,
  type PinSubjectType,
  type PortalOrgBranding,
} from "../../../utils/schoolPortalApi";

function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid pin") || m.includes("wrong pin")) return "Invalid PIN. Please try again.";
  if (m.includes("lock")) return "Account locked. Try again in 15 minutes.";
  if (m.includes("not found") || m.includes("no user") || m.includes("no such"))
    return "User not found. Check your details.";
  if (m.includes("org")) return "School not found. Check the school code.";
  return "Sign-in failed. Please verify your details.";
}

export function PortalLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { login, claim } = usePinAuth();
  const { t } = useTranslation();

  // School code: the ?org= in the link the school sends, else the code this
  // device signed in with last time. Never a hardcoded slug — prefilling one
  // school's code for another school's parent guarantees "Sign-in failed".
  const defaultOrg = useMemo(() => {
    const fromLink = params.get("org");
    if (fromLink) return fromLink;
    try {
      return localStorage.getItem("fgs_portal_slug") || "";
    } catch {
      return "";
    }
  }, [params]);
  const [subjectType, setSubjectType] = useState<PinSubjectType>("student");
  const [orgIdentifier, setOrgIdentifier] = useState<string>(defaultOrg);
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [pin, setPin] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // First-time parent claim: registered phone + any one child's GR number
  // proves the family; the parent chooses their PIN in the same step.
  // ?claim=1 in the announcement link opens this mode directly.
  const [mode, setMode] = useState<"login" | "claim">(
    params.get("claim") === "1" ? "claim" : "login",
  );
  const [claimPhone, setClaimPhone] = useState<string>("");
  const [claimGr, setClaimGr] = useState<string>("");
  const [claimPin, setClaimPin] = useState<string>("");
  const [claimPin2, setClaimPin2] = useState<string>("");
  // Live org-branding lookup: as the user types the school code, we fetch
  // (debounced) the org's name, logo, and motto so the header swaps from
  // the generic "Iqra Academy" to the actual school. Null means either
  // empty input or no match — we fall back to the generic title.
  const [branding, setBranding] = useState<PortalOrgBranding | null>(null);

  useEffect(() => {
    const slug = orgIdentifier.trim();
    if (!slug) {
      setBranding(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      getOrgBySlug(slug)
        .then((b) => {
          if (!cancelled) setBranding(b);
        })
        .catch(() => {
          if (!cancelled) setBranding(null);
        });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [orgIdentifier]);

  const idLabel = subjectType === "student" ? t("portal.grNumber") : t("portal.phone");

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const me = await login({ orgIdentifier, loginIdentifier, pin });
      if (me.mustChange) {
        navigate("/school-portal/change-pin", { replace: true });
      } else {
        navigate("/school-portal", { replace: true });
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const onClaim = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    if (claimPin !== claimPin2) {
      setError(t("portal.pinsDontMatch"));
      return;
    }
    setBusy(true);
    try {
      await claim({ orgIdentifier, phone: claimPhone, grNumber: claimGr, newPin: claimPin });
      navigate("/school-portal", { replace: true });
    } catch (err) {
      const code = (err as Error & { code?: string }).code;
      const msg = err instanceof Error ? err.message : String(err);
      if (code === "ALREADY_CLAIMED") setError(t("portal.alreadyClaimed"));
      else if (/too many|lock/i.test(msg)) setError(t("portal.claimLocked"));
      else if (/invalid credentials/i.test(msg)) setError(t("portal.claimInvalid"));
      else setError(friendlyError(msg));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
        <div className="max-w-3xl mx-auto px-4 py-12 relative">
          <div className="absolute top-3 right-4">
            <LanguageDropdown />
          </div>
          <div className="flex items-center gap-3">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                className="h-9 w-9 rounded object-cover ring-1 ring-white/20"
              />
            ) : (
              <GraduationCap className="h-8 w-8 text-indigo-300" />
            )}
            <h1 className="text-2xl font-semibold">
              {branding?.name ?? t("portal.schoolName")}
            </h1>
          </div>
          <p className="mt-2 text-indigo-200 text-sm max-w-xl">
            {branding?.motto ?? t("portal.loginIntro")}
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 -mt-8">
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === "claim" ? t("portal.firstTimeTitle") : t("auth.signIn")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mode === "claim" ? t("portal.claimIntro") : t("portal.useProvidedPin")}
          </p>

          {mode === "claim" ? (
            <form className="mt-5 space-y-4" onSubmit={onClaim}>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("portal.schoolCode")}
                </label>
                <input
                  type="text"
                  value={orgIdentifier}
                  onChange={(e) => setOrgIdentifier(e.target.value)}
                  required
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("portal.phone")}
                </label>
                <input
                  type="tel"
                  value={claimPhone}
                  onChange={(e) => setClaimPhone(e.target.value)}
                  required
                  autoComplete="tel"
                  placeholder="0300 1234567"
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t("portal.childGr")}
                </label>
                <input
                  type="text"
                  value={claimGr}
                  onChange={(e) => setClaimGr(e.target.value)}
                  required
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                />
                <p className="mt-1 text-[11px] text-slate-500">{t("portal.childGrHint")}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("portal.choosePin")}
                  </label>
                  <input
                    type="password"
                    value={claimPin}
                    onChange={(e) => setClaimPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                    autoComplete="new-password"
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm tracking-widest"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    {t("portal.confirmPin")}
                  </label>
                  <input
                    type="password"
                    value={claimPin2}
                    onChange={(e) => setClaimPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    required
                    autoComplete="new-password"
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm tracking-widest"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || claimPin.length !== 4 || claimPin2.length !== 4}
                className="w-full inline-flex justify-center items-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-md px-3 py-2 text-sm"
              >
                {busy ? t("auth.signingIn") : t("portal.claimCta")}
              </button>
              <button
                type="button"
                onClick={() => { setMode("login"); setError(null); }}
                className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700"
              >
                {t("portal.backToSignIn")}
              </button>
            </form>
          ) : (
          <>
          <div className="mt-5 flex p-1 bg-slate-100 rounded-lg">
            {(["student", "parent"] as PinSubjectType[]).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setSubjectType(tab)}
                className={
                  "flex-1 py-1.5 text-sm rounded-md " +
                  (subjectType === tab
                    ? "bg-white shadow-sm font-medium text-slate-900"
                    : "text-slate-600")
                }
              >
                {tab === "student" ? t("portal.student") : t("portal.parent")}
              </button>
            ))}
          </div>

          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("portal.schoolCode")}
              </label>
              <input
                type="text"
                value={orgIdentifier}
                onChange={(e) => setOrgIdentifier(e.target.value)}
                required
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                {idLabel}
              </label>
              <input
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                required
                autoComplete="username"
                className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                {t("portal.pin")}
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                required
                autoComplete="current-password"
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
              disabled={busy || pin.length !== 4}
              className="w-full inline-flex justify-center items-center bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-medium rounded-md px-3 py-2 text-sm"
            >
              {busy ? t("auth.signingIn") : t("auth.signIn")}
            </button>
            {subjectType === "parent" && (
              <button
                type="button"
                onClick={() => { setMode("claim"); setError(null); }}
                className="w-full text-center text-sm text-indigo-600 hover:text-indigo-700"
              >
                {t("portal.firstTimeLink")}
              </button>
            )}
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
