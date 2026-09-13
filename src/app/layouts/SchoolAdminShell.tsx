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

import { useEffect } from "react";
import { Outlet } from "react-router";
import { OrgBrandingProvider, useOrgBranding } from "../contexts/OrgBrandingContext";
import { CmdKPalette } from "../components/school-ui/CmdKPalette";
import { PLATFORM_NAME, schoolTabTitle } from "../../utils/brand";

// Tab title = the school's own name while inside the school workspace
// (pilot feedback: "Family Growth System" is wrong for a school user),
// credited to the platform.
function SchoolTabTitle() {
  const branding = useOrgBranding();
  useEffect(() => {
    const name = branding.schoolName?.trim();
    if (!name) return;
    document.title = schoolTabTitle(name);
    return () => { document.title = PLATFORM_NAME; };
  }, [branding.schoolName]);
  return null;
}

// Per user feedback: the ManageToolbar + WorkspaceSwitcher now live inline
// in RootLayout's top bar (see RootLayout.tsx, "Row 1") so we don't burn a
// whole vertical row on chrome. This shell wraps in OrgBrandingProvider
// (PR G) so every school page below gets logo/theme/motto without each one
// having to re-fetch the org.
export function SchoolAdminShell() {
  return (
    <OrgBrandingProvider>
      <SchoolTabTitle />
      <Outlet />
      {/* Global Cmd-K / Ctrl-K search palette. Self-contained — listens
          to its own keyboard shortcut and reads :orgId from useParams. */}
      <CmdKPalette />
    </OrgBrandingProvider>
  );
}
