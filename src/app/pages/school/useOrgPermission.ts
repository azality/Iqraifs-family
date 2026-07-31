// useOrgPermission — the frontend's window into the effective permission
// matrix (defaults + per-org overrides from role_template_override).
//
// Until now the frontend gated everything on isOrgAdmin (principal|admin
// only), which meant toggles in the Permissions editor changed backend
// behavior but no UI — office staff, financial staff, and teachers were
// bounced off pages the backend would happily serve them. This hook
// reads the same effective matrix the backend enforces, via
// GET /orgs/:orgId/permissions (readable by any org role).
//
// Usage:
//   const canEdit = useOrgPermission(orgId, viewerRole, "define_curriculum");
//
// principal/admin short-circuit to true (mirrors userCanInOrg on the
// backend). Everyone else resolves through the fetched matrix; while
// the fetch is in flight the answer is false (deny-by-default), so
// gated UI appears rather than flashes away.

import { useEffect, useState } from "react";
import { getPermissions } from "../../../utils/schoolApi";

// Module-level cache: one matrix fetch per org per page load, shared by
// every hook instance. Permissions change rarely (principal edits them),
// so staleness within a session is acceptable; a hard refresh clears it.
const matrixCache = new Map<string, Promise<Array<{ roleTemplate: string; permissionKey: string; allowed: boolean }>>>();

function fetchMatrix(orgId: string) {
  let p = matrixCache.get(orgId);
  if (!p) {
    p = getPermissions(orgId).catch((e) => {
      matrixCache.delete(orgId); // allow retry on next mount
      throw e;
    });
    matrixCache.set(orgId, p);
  }
  return p;
}

export function useOrgPermission(
  orgId: string,
  viewerRole: string | null | undefined,
  key: string,
): boolean {
  const [allowed, setAllowed] = useState(
    viewerRole === "principal" || viewerRole === "admin",
  );

  useEffect(() => {
    if (!orgId || !viewerRole) { setAllowed(false); return; }
    if (viewerRole === "principal" || viewerRole === "admin") {
      setAllowed(true);
      return;
    }
    let cancelled = false;
    fetchMatrix(orgId)
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find(
          (r) => r.roleTemplate === viewerRole && r.permissionKey === key,
        );
        setAllowed(!!row?.allowed);
      })
      .catch(() => {
        if (!cancelled) setAllowed(false);
      });
    return () => { cancelled = true; };
  }, [orgId, viewerRole, key]);

  return allowed;
}

/** State-aware variant for page gates: while the matrix fetch is in
 *  flight, `loading` is true and callers should render a placeholder
 *  instead of redirecting — otherwise an office_staff user gets bounced
 *  off a page they're allowed on before the fetch resolves.
 *
 *  The state is KEYED to (orgId, viewerRole, key). Effects run after
 *  render, so when viewerRole changes (null while /me loads →
 *  "office_staff" once it resolves) there is one render where the
 *  stored state still belongs to the OLD inputs — and the old
 *  null-role state was { allowed: false, loading: false }, which page
 *  gates read as a settled denial and redirected. The July 2026
 *  production smoke test caught every office/financial staffer being
 *  bounced off pages the backend allowed. If the stored key doesn't
 *  match the current inputs, we report loading (or the privileged
 *  short-circuit) instead of the stale answer. */
export function useOrgPermissionState(
  orgId: string,
  viewerRole: string | null | undefined,
  key: string,
): { allowed: boolean; loading: boolean } {
  const privileged = viewerRole === "principal" || viewerRole === "admin";
  const inputsKey = `${orgId}|${viewerRole ?? ""}|${key}`;
  const [state, setState] = useState<{ k: string; allowed: boolean; loading: boolean }>(
    { k: inputsKey, allowed: privileged, loading: !privileged && !!viewerRole && !!orgId },
  );

  useEffect(() => {
    const k = inputsKey;
    if (!orgId || !viewerRole) { setState({ k, allowed: false, loading: false }); return; }
    if (viewerRole === "principal" || viewerRole === "admin") {
      setState({ k, allowed: true, loading: false });
      return;
    }
    let cancelled = false;
    setState({ k, allowed: false, loading: true });
    fetchMatrix(orgId)
      .then((rows) => {
        if (cancelled) return;
        const row = rows.find(
          (r) => r.roleTemplate === viewerRole && r.permissionKey === key,
        );
        setState({ k, allowed: !!row?.allowed, loading: false });
      })
      .catch(() => {
        if (!cancelled) setState({ k, allowed: false, loading: false });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputsKey]);

  // Stored state is for different inputs → don't serve a stale verdict.
  if (state.k !== inputsKey) {
    return { allowed: privileged, loading: !privileged && !!viewerRole && !!orgId };
  }
  return { allowed: state.allowed, loading: state.loading };
}
