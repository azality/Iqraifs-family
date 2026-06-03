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

import { Outlet } from "react-router";

// Per user feedback: the ManageToolbar + WorkspaceSwitcher now live inline
// in RootLayout's top bar (see RootLayout.tsx, "Row 1") so we don't burn a
// whole vertical row on chrome. This shell just passes through to the
// child route's page content.
export function SchoolAdminShell() {
  return <Outlet />;
}
