// WorkspaceContext — the user's current workspace (Family vs School).
//
// Background:
//   A user can simultaneously be (a) a parent in their own family, AND
//   (b) a principal or teacher at a school. The previous design surfaced
//   "School" as an always-on tab in the family chrome, which mixed the
//   two contexts and risked exposing school operations during family use.
//
//   Workspace is the right separation: same login, two parallel
//   "rooms" — picking one entirely swaps the nav, the header accent, and
//   the routing intent.
//
// Behavior:
//   - On mount (after auth), call GET /school/me ONCE to discover what
//     school roles the user has. Cache for the session.
//   - If the user has zero school roles → only Family workspace exists,
//     no switcher shown, this context is effectively a no-op.
//   - If the user has school roles → switcher appears, current workspace
//     persists to localStorage as fgs_workspace.
//   - Default workspace on first sign-in is `family` — never auto-jump
//     into school context.

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { getStorageSync, setStorageSync } from "../../utils/storage";
import { getSchoolMe, type SchoolMeResponse } from "../../utils/schoolApi";
import { AuthContext } from "./AuthContext";
import { STORAGE_KEYS } from "../../utils/storage";

export type WorkspaceKind = "family" | "school";

export interface Workspace {
  kind: WorkspaceKind;
  // For school workspace: the org id the user is operating under.
  // Principal of >1 org would see the chooser; v1 pilot has 1 org per
  // principal so this is always the same value once chosen.
  orgId?: string;
  orgName?: string;
}

interface WorkspaceContextType {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;
  me: SchoolMeResponse | null;
  loading: boolean;
  hasSchoolAccess: boolean;
  // True iff the user has a family (FAMILY_ID in storage). Used by the
  // switcher to hide the "My Family" option for school-only signups
  // (those have a principal role but never created a family).
  hasFamily: boolean;
  // Server-controlled flag derived from /school/me. 'school' means the
  // user signed up via the "I run a school" path (or was manually
  // flagged) — the workspace switcher should hide "My Family" entirely
  // for them regardless of any stale family record they may have.
  signupIntent: 'family' | 'school';
  switchToFamily: () => void;
  switchToSchool: (orgId: string, orgName: string) => void;
  // Force a re-fetch of /school/me. Used after a role-changing action
  // (e.g. just created an org via signup) so the switcher reflects the
  // new role without a full page reload.
  refreshSchoolMe: () => Promise<void>;
}

export const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const STORAGE_KEY = "fgs_workspace";

function readStoredWorkspace(): { ws: Workspace; explicit: boolean } {
  try {
    const raw = getStorageSync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.kind === "family" || parsed?.kind === "school") {
        return { ws: parsed as Workspace, explicit: true };
      }
    }
  } catch {
    // ignore parse failure, fall through to default
  }
  // No stored value = the user never made an explicit choice. Default
  // is family, but the `explicit` flag tells the post-login logic it
  // can override (e.g. for a school principal who has school access
  // but never clicked anything in the workspace switcher).
  return { ws: { kind: "family" }, explicit: false };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const initial = readStoredWorkspace();
  const [workspace, setWorkspaceState] = useState<Workspace>(initial.ws);
  // Did the user explicitly choose this workspace, or did we fall back
  // to the default? Drives auto-switch logic below — we never overwrite
  // an explicit user choice.
  const explicitWorkspaceChoiceRef = useRef(initial.explicit);
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Track family presence by watching the FAMILY_ID storage value.
  // School-only signups never set this, so the workspace switcher knows
  // not to offer them a "My Family" option that leads to /onboarding.
  const [hasFamily, setHasFamily] = useState<boolean>(
    () => !!getStorageSync(STORAGE_KEYS.FAMILY_ID),
  );

  // CRITICAL: do NOT call getSchoolMe until the user is authenticated.
  // ProvidersLayout wraps PUBLIC routes too (welcome, login, signup),
  // and apiCall's "no access token" branch hard-redirects to /parent-login,
  // which causes an infinite redirect loop on the login page itself.
  //
  // We watch AuthContext.accessToken — falsy = unauthenticated, don't
  // fetch. As soon as a token appears (post-login), the effect re-runs
  // and discovers school roles.
  const auth = useContext(AuthContext);
  const accessToken = auth?.accessToken ?? null;

  useEffect(() => {
    if (!accessToken) {
      // Unauthenticated — treat as no school access. The user is on
      // a public route or hasn't signed in yet.
      setMe(null);
      setLoading(false);
      return;
    }

    // Re-read family presence on every auth change (login can hydrate
    // FAMILY_ID into storage, signup can leave it empty for school-only
    // users, etc.). Synchronous read of localStorage is fine here.
    const currentHasFamily = !!getStorageSync(STORAGE_KEYS.FAMILY_ID);
    setHasFamily(currentHasFamily);

    let cancelled = false;
    setLoading(true);
    getSchoolMe()
      .then((r) => {
        if (cancelled) return;
        setMe(r);
        const principalOrgs = r.organizations.filter((o) =>
          r.roles.some(
            (role) =>
              role.role_type === "principal" &&
              role.scope_type === "organization" &&
              role.scope_id === o.id,
          ),
        );
        const hasSchool = principalOrgs.length > 0 ||
          r.roles.some((role) => role.role_type === "teacher");

        // Case 1: stored workspace is "school" but user no longer has
        // any school access (revoked). Fall back to family.
        if (!hasSchool && workspace.kind === "school") {
          setWorkspaceState({ kind: "family" });
          setStorageSync(STORAGE_KEY, JSON.stringify({ kind: "family" }));
          return;
        }

        // Case 2: user has school access AND has NEVER explicitly
        // chosen a workspace (no stored value yet). Default to their
        // first principal org so a fresh school-principal sign-in
        // lands on /school rather than the family Dashboard.
        //
        // This covers both:
        //   - The clean "I run a school" signup (where workspace was
        //     stamped via switchToSchool — covered).
        //   - The user-reported case where a pre-existing family
        //     account was manually granted principal role and never
        //     toggled their workspace; explicit is false, so we
        //     auto-prefer school.
        //
        // We deliberately do NOT touch the workspace when the user
        // made an explicit choice, even if hasFamily is false. They
        // get what they picked.
        if (
          hasSchool &&
          !explicitWorkspaceChoiceRef.current &&
          workspace.kind !== "school"
        ) {
          const firstOrg = principalOrgs[0] ?? r.organizations[0];
          if (firstOrg) {
            const next: Workspace = {
              kind: "school",
              orgId: firstOrg.id,
              orgName: firstOrg.name,
            };
            setWorkspaceState(next);
            setStorageSync(STORAGE_KEY, JSON.stringify(next));
            explicitWorkspaceChoiceRef.current = true;
          }
        }
      })
      .catch(() => {
        if (cancelled) return;
        setMe(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const setWorkspace = (w: Workspace) => {
    setWorkspaceState(w);
    setStorageSync(STORAGE_KEY, JSON.stringify(w));
    // Any explicit user toggle counts as a real choice — don't
    // auto-default away from it on the next /school/me fetch.
    explicitWorkspaceChoiceRef.current = true;
  };

  const switchToFamily = () => setWorkspace({ kind: "family" });

  const switchToSchool = (orgId: string, orgName: string) =>
    setWorkspace({ kind: "school", orgId, orgName });

  // Manual refresh — call after creating an org / accepting a role
  // grant / etc. so the workspace switcher reflects the new state
  // without a full page reload.
  const refreshSchoolMe = async () => {
    if (!accessToken) return;
    try {
      const r = await getSchoolMe();
      setMe(r);
    } catch {
      // Swallow — the next regular fetch will retry.
    }
  };

  const hasSchoolAccess = !!me && me.roles.some(
    (r) => r.role_type === "principal" || r.role_type === "teacher",
  );

  // signupIntent comes from the backend (auth.users.app_metadata).
  // Server-controlled — clients can't fake it. Defaults to 'family' for
  // any account that pre-dates the feature.
  const signupIntent: 'family' | 'school' = me?.signupIntent === 'school' ? 'school' : 'family';

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
        me,
        loading,
        hasSchoolAccess,
        hasFamily,
        signupIntent,
        switchToFamily,
        switchToSchool,
        refreshSchoolMe,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
