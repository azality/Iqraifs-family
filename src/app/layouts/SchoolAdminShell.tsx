// Layout wrapper for all school-admin routes under /school/orgs/:orgId.
//
// Renders the ManageToolbar (Classes / Students / Parents / Teachers / Link
// Codes / Roster Requests / Permissions / Settings) once, then an <Outlet />
// for the child page. Before this layout existed, the toolbar only rendered on
// the Performance Dashboard, so navigating to e.g. /admin/classes meant the
// user had to back-button to the dashboard to jump to /admin/students.
//
// `me` is sourced from WorkspaceContext (already fetched at app boot) and
// supplemented by a local getSchoolMe() fetch as a fallback for cases where
// the context hasn't resolved yet — keeps the principal-only toolbar items
// (Permissions, Settings) accurate.

import { useContext, useEffect, useState } from "react";
import { Outlet, useParams } from "react-router";
import { ManageToolbar } from "../components/school-ui";
import { WorkspaceContext } from "../contexts/WorkspaceContext";
import { getSchoolMe, isOrgPrincipal, type SchoolMeResponse } from "../../utils/schoolApi";

export function SchoolAdminShell() {
  const { orgId = "" } = useParams();
  const workspaceCtx = useContext(WorkspaceContext);
  const [localMe, setLocalMe] = useState<SchoolMeResponse | null>(null);

  // Use the workspace context's `me` if available; otherwise fall back to a
  // one-shot fetch so the toolbar still gates principal-only items correctly
  // on a hard-refresh into an admin URL.
  useEffect(() => {
    if (workspaceCtx?.me) return;
    let cancelled = false;
    getSchoolMe()
      .then((m) => {
        if (!cancelled) setLocalMe(m);
      })
      .catch(() => {
        // Silent — toolbar will just hide principal-only items.
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceCtx?.me]);

  const me = workspaceCtx?.me ?? localMe;
  const isPrincipal = isOrgPrincipal(me, orgId);

  return (
    <div className="space-y-5">
      <ManageToolbar orgId={orgId} isPrincipal={isPrincipal} />
      <Outlet />
    </div>
  );
}
