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

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { getStorageSync, setStorageSync } from "../../utils/storage";
import { getSchoolMe, type SchoolMeResponse } from "../../utils/schoolApi";
import { AuthContext } from "./AuthContext";

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
  switchToFamily: () => void;
  switchToSchool: (orgId: string, orgName: string) => void;
  // Force a re-fetch of /school/me. Used after a role-changing action
  // (e.g. just created an org via signup) so the switcher reflects the
  // new role without a full page reload.
  refreshSchoolMe: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

const STORAGE_KEY = "fgs_workspace";

function readStoredWorkspace(): Workspace {
  try {
    const raw = getStorageSync(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.kind === "family" || parsed?.kind === "school") {
        return parsed as Workspace;
      }
    }
  } catch {
    // ignore parse failure, fall through to default
  }
  return { kind: "family" };
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspace, setWorkspaceState] = useState<Workspace>(() => readStoredWorkspace());
  const [me, setMe] = useState<SchoolMeResponse | null>(null);
  const [loading, setLoading] = useState(true);

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

    let cancelled = false;
    setLoading(true);
    getSchoolMe()
      .then((r) => {
        if (cancelled) return;
        setMe(r);
        // If the stored workspace is school but the user no longer has
        // school access (e.g. revoked), fall back to family.
        const hasSchool =
          r.roles.some((role) => role.role_type === "principal" || role.role_type === "teacher");
        if (!hasSchool && workspace.kind === "school") {
          setWorkspaceState({ kind: "family" });
          setStorageSync(STORAGE_KEY, JSON.stringify({ kind: "family" }));
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

  return (
    <WorkspaceContext.Provider
      value={{
        workspace,
        setWorkspace,
        me,
        loading,
        hasSchoolAccess,
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
