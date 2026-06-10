// SchoolUnifiedLogin — single entry point for one school.
// URL shape: /:orgSlug  (e.g. iqraifs.com/iqra-demo)
//
// Three tabs share the same branded shell:
//   - Staff   → Supabase email + password (existing /parent-login flow)
//   - Parent  → org slug + phone + PIN     (existing /school-login flow)
//   - Student → org slug + GR + PIN        (same PIN backend, different
//                                           identifier label)
//
// The slug is already in the URL — the user doesn't have to retype it.
// Branding (name, logo, motto) is fetched from /school/auth/org-by-slug
// and applied to the header so each school's URL feels owned by them.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router";
import { GraduationCap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePinAuth } from "../../contexts/PinAuthContext";
import { LanguageDropdown } from "../../components/LanguageDropdown";
import { isAllowableSlug } from "../../utils/reservedSlugs";
import {
  getOrgBySlug,
  type PortalOrgBranding,
} from "../../../utils/schoolPortalApi";
import { supabase } from "../../../../utils/supabase/client";
import { setParentSession } from "../../utils/authHelpers";

type Tab = "staff" | "parent" | "student";

function friendlyError(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("invalid pin") || m.includes("wrong pin"))
    return "Invalid PIN. Please try again.";
  if (m.includes("lock"))
    return "Account locked. Try again in 15 minutes.";
  if (m.includes("invalid") && m.includes("credential"))
    return "Wrong details. Check your login.";
  if (m.includes("not found"))
    return "We couldn't find that account.";
  return "Sign-in failed. Please verify your details.";
}

export function SchoolUnifiedLogin() {
  const { orgSlug = "" } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { login: pinLoginCtx } = usePinAuth();
  const { t } = useTranslation();

  // Branding lookup on mount + when slug changes.
  const [branding, setBranding] = useState<PortalOrgBranding | null>(null);
  const [brandingResolved, setBrandingResolved] = useState(false);
  const reserved = !isAllowableSlug(orgSlug);

  useEffect(() => {
    if (reserved || !orgSlug) {
      setBrandingResolved(true);
      return;
    }
    // Remember the slug so logout can return here instead of dumping
    // staff/parent at the generic /welcome page. Best-effort: any
    // localStorage failure (private mode, quota) silently falls back.
    try { localStorage.setItem("fgs_last_org_slug", orgSlug); } catch { /* ignore */ }
    let cancelled = false;
    getOrgBySlug(orgSlug)
      .then((b) => {
        if (!cancelled) setBranding(b);
      })
      .catch(() => {
        if (!cancelled) setBranding(null);
      })
      .finally(() => {
        if (!cancelled) setBrandingResolved(true);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, reserved]);

  const [tab, setTab] = useState<Tab>("staff");
  const [identifier, setIdentifier] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const idLabel = useMemo(() => {
    if (tab === "staff") return "Email";
    if (tab === "parent") return "Phone";
    return "Roll number (GR)";
  }, [tab]);
  const secretLabel = tab === "staff" ? "Password" : "PIN";

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (tab === "staff") {
        // Supabase email + password — use the official client so the
        // session lands in Supabase's own storage (which AuthContext
        // reads via getSession). Doing the raw fetch we tried first
        // wrote tokens to the WRONG key, so AuthContext saw no session
        // and ProtectedRoute kicked us back to /welcome.
        const { data, error } = await supabase.auth.signInWithPassword({
          email: identifier,
          password: secret,
        });
        if (error) throw error;
        if (!data.user) throw new Error("Sign-in failed");
        // Mirror ParentLogin: stamp parent-side storage so role checks
        // downstream pass (USER_ROLE etc.) regardless of school role.
        setParentSession(
          data.user.id,
          (data.user.user_metadata as any)?.name || identifier,
          identifier,
        );
        // CRITICAL persistence race: signInWithPassword resolves as soon
        // as the token comes back from Supabase, but the JS client writes
        // the session to localStorage asynchronously. If we hard-reload
        // immediately, the next page's INITIAL_SESSION event fires with
        // no session → AuthContext clears in-memory auth → ProtectedRoute
        // sends the user to /welcome. ParentLogin solves the same race
        // with a 500ms wait; we use 600 to be safe across slower devices.
        await new Promise((r) => setTimeout(r, 600));
        // Hard navigation — SchoolUnifiedLogin lives outside
        // ProvidersLayout, so AuthContext isn't mounted here. A full
        // reload remounts the provider tree with the fresh Supabase
        // session and renders the org-scoped admin shell.
        //
        // Route directly to /school/orgs/:orgId so a principal with
        // access to multiple orgs lands in THIS slug's workspace, not
        // the generic chooser. branding.id was resolved on mount via
        // getOrgBySlug. Falls back to /school if branding never loaded.
        window.location.href = branding?.id
          ? `/school/orgs/${branding.id}`
          : "/school";
        return;
      } else {
        // PIN auth — backend already accepts whitespace-stripped phone
        // (PR #138) so the user can type +923001001001 or 03001001001.
        const me = await pinLoginCtx({
          orgIdentifier: orgSlug,
          loginIdentifier: identifier,
          pin: secret,
        });
        if (me.mustChange) {
          navigate("/school-portal/change-pin", { replace: true });
        } else {
          navigate("/school-portal", { replace: true });
        }
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  // Reserved slug or unknown org → 404-style page so we don't show a
  // login form for a school that doesn't exist (or shadow a system path).
  if (brandingResolved && (reserved || !branding)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <GraduationCap className="mx-auto h-12 w-12 text-slate-300" />
          <h1 className="mt-4 text-xl font-semibold text-slate-900">
            School not found
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {reserved
              ? `'${orgSlug}' isn't a school URL.`
              : `We couldn't find a school at iqraifs.com/${orgSlug}.`}
          </p>
          <p className="mt-4 text-sm text-slate-600">
            Double-check the URL or contact your school's office.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
        <div className="max-w-3xl mx-auto px-4 py-10 relative">
          <div className="absolute top-3 right-4">
            <LanguageDropdown />
          </div>
          <div className="flex items-center gap-3">
            {branding?.logoUrl ? (
              <img
                src={branding.logoUrl}
                alt=""
                className="h-10 w-10 rounded object-cover ring-1 ring-white/20"
              />
            ) : (
              <GraduationCap className="h-9 w-9 text-indigo-300" />
            )}
            <div>
              <h1 className="text-2xl font-semibold">
                {branding?.name ?? "School"}
              </h1>
              {branding?.motto && (
                <p className="text-indigo-200 text-sm">{branding.motto}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto -mt-6 px-4">
        <div className="bg-white rounded-xl shadow-lg border border-slate-200 overflow-hidden">
          {/* Tabs */}
          <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50">
            {(["staff", "parent", "student"] as Tab[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setTab(value);
                  setIdentifier("");
                  setSecret("");
                  setError(null);
                }}
                className={
                  "px-3 py-3 text-sm font-medium transition " +
                  (tab === value
                    ? "bg-white text-indigo-700 border-b-2 border-indigo-600 -mb-px"
                    : "text-slate-600 hover:text-slate-900")
                }
              >
                {value === "staff"
                  ? "Staff"
                  : value === "parent"
                  ? "Parent"
                  : "Student"}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="p-5 space-y-4">
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500">
                Signing into
              </div>
              <div className="text-sm font-medium text-slate-900">
                iqraifs.com/<span className="text-indigo-700">{orgSlug}</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {idLabel}
              </label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={
                  tab === "staff"
                    ? "you@school.com"
                    : tab === "parent"
                    ? "+923001001001"
                    : "IDA-001"
                }
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                autoFocus
                autoComplete={tab === "staff" ? "email" : "username"}
              />
            </div>

            <div>
              <label className="text-xs font-medium uppercase tracking-wider text-slate-500">
                {secretLabel}
              </label>
              <input
                type={tab === "staff" ? "password" : "text"}
                inputMode={tab === "staff" ? undefined : "numeric"}
                value={secret}
                onChange={(e) => setSecret(e.target.value)}
                placeholder={tab === "staff" ? "Password" : "4-digit PIN"}
                maxLength={tab === "staff" ? undefined : 4}
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                autoComplete={tab === "staff" ? "current-password" : "off"}
              />
            </div>

            {error && (
              <div className="bg-rose-50 border border-rose-200 rounded p-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !identifier || !secret}
              className="w-full rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>

            <p className="text-[11px] text-slate-500 text-center">
              {tab === "parent"
                ? "Use the phone number you gave the school + the PIN they shared."
                : tab === "student"
                ? "Use your roll number (GR) + your 4-digit PIN."
                : "Staff sign-in — use the credentials your principal set up."}
            </p>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-500">
          Powered by iqraifs.com — {t("portal.loginIntro")}
        </p>
      </div>
    </div>
  );
}

export default SchoolUnifiedLogin;
