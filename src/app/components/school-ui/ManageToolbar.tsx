// Shared school staff nav — role-aware (design 11b).
//
// One shell, per-role tab sets: this renders the SAME six underline tabs
// + More ▾ + right-slot action as the parent portal's PortalLayout, so a
// principal, a hifz teacher and a parent all navigate the same shape.
//
// Before 11b this was a wrapping row of pills inside an overflow-x-auto
// container — on a laptop the browser drew a grey scrollbar under the
// menu and pushed the last items off-screen, which is exactly the
// complaint 11a fixed on the parent side.
//
// The per-role source lists keep their existing shapes:
//   principal / admin  → topical groups (Today / People / Academics /
//                        Money / Communications / Admin)
//   everyone else      → a flat list of that role's destinations
// Both are normalized into one NavTab[] before rendering; anything past
// the sixth tab folds into More ▾ rather than overflowing.
//
// Active state is computed from the current pathname — a grouped tab
// lights up when any of its children is the current page.

import { Link, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Users,
  Heart,
  UserCog,
  KeyRound,
  ClipboardList,
  ShieldCheck,
  Settings as SettingsIcon,
  Megaphone,
  DollarSign,
  UploadCloud,
  BookMarked,
  Calendar,
  CalendarOff,
  Inbox,
  Globe,
  ScrollText,
  ChevronDown,
  CalendarClock,
  GraduationCap,
  Wrench,
  Home,
  FileText,
  ListChecks,
  LayoutGrid,
} from "lucide-react";
import type { SchoolViewerRole } from "../../../utils/schoolApi";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";

export interface ManageToolbarProps {
  orgId: string;
  /** Role of the current viewer in this org. Drives which items show. */
  viewerRole: SchoolViewerRole;
}

interface ToolbarItem {
  key: string;
  label: string;
  to: string;
  Icon: typeof Users;
}

interface ToolbarGroup {
  key: string;
  label: string;
  Icon: typeof Users;
  items: ToolbarItem[];
}

const I = (key: string, label: string, to: string, Icon: typeof Users): ToolbarItem =>
  ({ key, label, to, Icon });

// ─── Flat lists for non-principal roles ───────────────────────────────
function flatItemsForRole(
  orgId: string,
  role: SchoolViewerRole,
  t: (k: string) => string,
): ToolbarItem[] {
  const announcements = I("announcements", t("toolbar.announcements"),
    `/school/orgs/${orgId}/admin/announcements`, Megaphone);

  switch (role) {
    case "incharge":
      // Wing overseer (Sep 2026): the cockpit is the wing-scoped
      // dashboard; Daily academics is the day-to-day digest; Hifz
      // program shows the per-student rollup for hifz wings (empty
      // for non-hifz wings). They may also teach (Rabia) — their own
      // sections appear inside the dashboard leaderboard.
      return [
        I("dashboard", t("toolbar.dashboard"), `/school/orgs/${orgId}`, Home),
        I("academics-day", "Daily academics", `/school/orgs/${orgId}/admin/academics-day`, ListChecks),
        I("teaching-overview", "Teaching overview", `/school/orgs/${orgId}/admin/teaching-overview`, GraduationCap),
        I("weekly-digest", "Weekly digest", `/school/orgs/${orgId}/admin/weekly-digest`, ListChecks),
        I("hifz-program", "Hifz program", `/school/orgs/${orgId}/admin/hifz-program`, BookMarked),
        I("my-schedule", t("toolbar.mySchedule"), `/school/orgs/${orgId}/my-schedule`, Calendar),
        announcements,
        I("time-off", t("toolbar.timeOff"), `/school/orgs/${orgId}/my-schedule?action=time-off`, CalendarOff),
      ];
    case "hifz_teacher":
      // Hifz teachers' daily driver is the groups/sections hifz view on
      // TeacherHome — anchor there instead of the academic "My subjects".
      return [
        I("dashboard", t("toolbar.dashboard"), `/school/orgs/${orgId}`, Home),
        I("my-schedule", t("toolbar.mySchedule"), `/school/orgs/${orgId}/my-schedule`, Calendar),
        I("my-hifz", t("toolbar.myHifzGroups"), `/school/orgs/${orgId}#my-hifz-groups`, BookMarked),
        I("my-classes", t("toolbar.myClasses"), `/school/orgs/${orgId}#my-classes`, Users),
        announcements,
        I("time-off", t("toolbar.timeOff"), `/school/orgs/${orgId}/my-schedule?action=time-off`, CalendarOff),
      ];
    case "class_teacher":
    case "visiting_teacher":
      // Teachers also need the page-local actions surfaced here so they
      // don't have to bounce between an inline nav strip and the top
      // toolbar. My classes / My subjects deep-link to anchored sections
      // on TeacherHome; Request time off opens the modal on the
      // calendar via ?action=time-off.
      return [
        I("dashboard", t("toolbar.dashboard"), `/school/orgs/${orgId}`, Home),
        I("my-schedule", t("toolbar.mySchedule"), `/school/orgs/${orgId}/my-schedule`, Calendar),
        I("my-classes", t("toolbar.myClasses"), `/school/orgs/${orgId}#my-classes`, Users),
        I("my-subjects", t("toolbar.mySubjects"), `/school/orgs/${orgId}#my-subjects`, BookOpen),
        announcements,
        I("time-off", t("toolbar.timeOff"), `/school/orgs/${orgId}/my-schedule?action=time-off`, CalendarOff),
      ];
    case "office_staff":
      return [
        // Dashboard first — without it, office staff who navigate anywhere
        // have no toolbar route back to OfficeStaffHome.
        I("dashboard", "Dashboard", `/school/orgs/${orgId}`, Home),
        I("students", t("toolbar.students"), `/school/orgs/${orgId}/admin/students`, Users),
        I("parents", t("toolbar.parents"), `/school/orgs/${orgId}/admin/parents`, Heart),
        // office_staff holds manage_teachers by default and the page now
        // honors the permission — give them the nav entry to match.
        I("teachers", t("toolbar.teachers"), `/school/orgs/${orgId}/admin/teachers`, UserCog),
        I("roster-requests", t("toolbar.rosterRequests"), `/school/orgs/${orgId}/admin/roster-requests`, ClipboardList),
        // office_staff holds view_all_classes + create_forms by default —
        // give them the doors to match (pages enforce the actual permission).
        I("classes", t("toolbar.classes"), `/school/orgs/${orgId}/admin/classes`, BookOpen),
        I("forms", "Forms", `/school/orgs/${orgId}/admin/forms`, FileText),
        I("inbox", "Parent inbox", `/school/orgs/${orgId}/admin/inbox`, Inbox),
        announcements,
      ];
    case "financial_staff":
      return [
        I("dashboard", "Dashboard", `/school/orgs/${orgId}`, Home),
        I("fees", "Fees", `/school/orgs/${orgId}/admin/fees`, DollarSign),
        announcements,
      ];
    default:
      return [];
  }
}

// ─── Grouped layout for principal / admin ────────────────────────────
// Keeps "Today" items as a peer group at the front so the daily
// actions (my schedule, parent inbox, time off) stay a single click
// away. Everything else folds into topical menus.
function groupsForAdmin(
  orgId: string,
  role: SchoolViewerRole,
  t: (k: string) => string,
): ToolbarGroup[] {
  const groups: ToolbarGroup[] = [
    {
      key: "today",
      label: "Today",
      Icon: CalendarClock,
      items: [
        I("my-schedule", "My schedule", `/school/orgs/${orgId}/my-schedule`, Calendar),
        I("inbox", "Parent inbox", `/school/orgs/${orgId}/admin/inbox`, Inbox),
        I("time-off", "Time off", `/school/orgs/${orgId}/admin/time-off`, CalendarOff),
        I("roster-requests", t("toolbar.rosterRequests"), `/school/orgs/${orgId}/admin/roster-requests`, ClipboardList),
      ],
    },
    {
      key: "people",
      label: "People",
      Icon: Users,
      items: [
        I("students", t("toolbar.students"), `/school/orgs/${orgId}/admin/students`, Users),
        I("parents", t("toolbar.parents"), `/school/orgs/${orgId}/admin/parents`, Heart),
        I("teachers", t("toolbar.teachers"), `/school/orgs/${orgId}/admin/teachers`, UserCog),
        I("link-codes", t("toolbar.linkCodes"), `/school/orgs/${orgId}/admin/link-codes`, KeyRound),
      ],
    },
    {
      key: "academics",
      label: "Academics",
      Icon: GraduationCap,
      items: [
        I("classes", t("toolbar.classes"), `/school/orgs/${orgId}/admin/classes`, BookOpen),
        I("academics-day", "Daily academics", `/school/orgs/${orgId}/admin/academics-day`, ListChecks),
        I("teaching-overview", "Teaching overview", `/school/orgs/${orgId}/admin/teaching-overview`, GraduationCap),
        I("weekly-digest", "Weekly digest", `/school/orgs/${orgId}/admin/weekly-digest`, ListChecks),
        I("hifz-program", "Hifz program", `/school/orgs/${orgId}/admin/hifz-program`, BookMarked),
        // "Hifz groups" hidden until a school actually needs cross-class
        // Quran groupings — its presence next to the Hifz program entry
        // repeatedly confused the pilot ("is that not the hifz thing?").
        // Route /admin/hifz-groups still works by direct URL.
        I("timetable", "Timetable", `/school/orgs/${orgId}/admin/timetable`, Calendar),
        I("assessment", "Assessment", `/school/orgs/${orgId}/admin/assessment`, ClipboardList),
      ],
    },
    {
      key: "money",
      label: "Money",
      Icon: DollarSign,
      items: [
        I("fees", "Fees", `/school/orgs/${orgId}/admin/fees`, DollarSign),
      ],
    },
    {
      key: "communications",
      label: "Communications",
      Icon: Megaphone,
      items: [
        I("announcements", t("toolbar.announcements"), `/school/orgs/${orgId}/admin/announcements`, Megaphone),
        // Forms was only reachable from the AdminDashboard tile grid, which
        // itself had no toolbar entry — the parent portal's Forms tab had no
        // producing side. Communications is its home: forms go out to parents.
        I("forms", "Forms", `/school/orgs/${orgId}/admin/forms`, FileText),
        I("public-site", "Public site", `/school/orgs/${orgId}/admin/public-site`, Globe),
      ],
    },
  ];

  // Admin group. "All admin pages" (the tile-grid directory, demoted from
  // "Admin home" — pilot review: it competed with the Dashboard as a
  // landing) leads the group — the "← Admin" back-buttons on every admin
  // sub-page land there, so it must be discoverable from the toolbar too.
  // Permissions + Settings + Year rollover stay principal-only; behavior
  // categories are admin-wide.
  if (role === "principal") {
    groups.push({
      key: "admin",
      label: "Admin",
      Icon: Wrench,
      items: [
        I("admin-home", "All admin pages", `/school/orgs/${orgId}/admin`, LayoutGrid),
        I("permissions", t("toolbar.permissions"), `/school/orgs/${orgId}/admin/permissions`, ShieldCheck),
        I("settings", t("toolbar.settings"), `/school/orgs/${orgId}/admin/settings`, SettingsIcon),
        I("behavior-catalog", "Behavior categories", `/school/orgs/${orgId}/behavior-catalog`, ListChecks),
        I("year-rollover", "Year rollover", `/school/orgs/${orgId}/admin/year-rollover`, CalendarClock),
        I("import", "Import", `/school/orgs/${orgId}/admin/import`, UploadCloud),
        I("audit", "Audit log", `/school/orgs/${orgId}/admin/audit`, ScrollText),
      ],
    });
  } else {
    // Admin (non-principal): no Permissions/Settings/Year rollover.
    groups.push({
      key: "admin",
      label: "Admin",
      Icon: Wrench,
      items: [
        I("admin-home", "All admin pages", `/school/orgs/${orgId}/admin`, LayoutGrid),
        I("behavior-catalog", "Behavior categories", `/school/orgs/${orgId}/behavior-catalog`, ListChecks),
        I("import", "Import", `/school/orgs/${orgId}/admin/import`, UploadCloud),
        I("audit", "Audit log", `/school/orgs/${orgId}/admin/audit`, ScrollText),
      ],
    });
  }

  return groups;
}

function isActive(pathname: string, to: string): boolean {
  // Dashboard's `to` is the org root (e.g. /school/orgs/:orgId). A
  // plain startsWith check matches every sub-page (My schedule,
  // Students, …), which would highlight Dashboard everywhere. For
  // org-root paths require an exact match. Strip ?query / #hash off
  // both sides before comparing so query params (e.g. ?action=time-off)
  // don't break the highlight.
  const cleanPath = pathname.split(/[?#]/)[0];
  const cleanTo = to.split(/[?#]/)[0];
  // Org root (Dashboard) and admin root (Admin home) are prefixes of every
  // other page — require exact match for both, else they highlight always.
  const isRootLike = /^\/school\/orgs\/[^/]+(\/admin)?$/.test(cleanTo);
  if (isRootLike) return cleanPath === cleanTo;
  return cleanPath === cleanTo || cleanPath.startsWith(cleanTo + "/");
}

// Full school nav for a role, as groups — consumed by the mobile drawer
// (RootLayout) so phones get the SAME destinations as the desktop
// toolbar. Before this, the drawer hardcoded a single "Dashboard" item
// and a principal on a phone could not reach any admin page.
export function schoolNavGroupsForRole(
  orgId: string,
  role: SchoolViewerRole,
  t: (k: string) => string,
): ToolbarGroup[] {
  const dashboard: ToolbarGroup = {
    key: "dashboard",
    label: "Dashboard",
    Icon: Home,
    items: [I("dashboard", "Dashboard", `/school/orgs/${orgId}`, Home)],
  };
  if (role === "principal" || role === "admin") {
    return [dashboard, ...groupsForAdmin(orgId, role, t)];
  }
  const flat = flatItemsForRole(orgId, role, t);
  if (flat.length === 0) return [dashboard];
  return [{ key: "menu", label: "Menu", Icon: Home, items: flat }];
}

// The role's #1 daily action — the right-hand slot of the nav row (11b).
// Every target is a route that already exists; this slot promotes the
// thing the role opens most, it doesn't invent a new feature.
function primaryActionForRole(
  orgId: string,
  role: SchoolViewerRole,
  t: (k: string) => string,
): { label: string; to: string } | null {
  const at = (p: string) => `/school/orgs/${orgId}${p}`;
  switch (role) {
    case "principal":
    case "admin":
    case "incharge":
      return { label: t("toolbar.actions.dailyAcademics"), to: at("/admin/academics-day") };
    case "hifz_teacher":
      return { label: t("toolbar.actions.todaysRound"), to: at("#my-hifz-groups") };
    case "class_teacher":
    case "visiting_teacher":
      return { label: t("toolbar.mySchedule"), to: at("/my-schedule") };
    case "office_staff":
      return { label: t("toolbar.actions.parentInbox"), to: at("/admin/inbox") };
    case "financial_staff":
      return { label: t("toolbar.actions.fees"), to: at("/admin/fees") };
    default:
      return null;
  }
}

// Tab order for principal/admin. Dashboard leads; Money (a single Fees
// page) is the one that folds into More so the row stays at six.
const ADMIN_TAB_ORDER = ["today", "people", "academics", "communications", "admin", "money"];

/** A nav row should never grow a scrollbar (11b). Both shapes — the
 *  admin's groups and a teacher's flat list — become the same six
 *  underline tabs + More ▾, matching the parent portal shell exactly. */
const MAX_PRIMARY_TABS = 6;

interface NavTab {
  key: string;
  label: string;
  Icon: typeof Users;
  /** Direct destination, for a leaf tab. */
  to?: string;
  /** Child destinations, for a grouped tab. */
  items?: ToolbarItem[];
}

const tabCls = (active: boolean) =>
  "inline-flex items-center gap-1.5 px-3 py-2.5 text-sm border-b-2 -mb-px whitespace-nowrap " +
  (active
    ? "border-indigo-600 text-indigo-700 font-semibold"
    : "border-transparent font-medium text-slate-600 hover:text-slate-900");

export function ManageToolbar({ orgId, viewerRole }: ManageToolbarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const isAdminish = viewerRole === "principal" || viewerRole === "admin";

  // Normalize both role shapes into one tab list, so the row below is
  // literally the same component for a principal and a hifz teacher.
  let tabs: NavTab[];
  if (isAdminish) {
    const groups = groupsForAdmin(orgId, viewerRole, t);
    const ordered = [...groups].sort(
      (a, b) => ADMIN_TAB_ORDER.indexOf(a.key) - ADMIN_TAB_ORDER.indexOf(b.key),
    );
    tabs = [
      { key: "dashboard", label: t("toolbar.dashboard"), Icon: Home, to: `/school/orgs/${orgId}` },
      ...ordered.map((g) => ({ key: g.key, label: g.label, Icon: g.Icon, items: g.items })),
    ];
  } else {
    const flat = flatItemsForRole(orgId, viewerRole, t);
    if (flat.length === 0) return null;
    tabs = flat.map((it) => ({ key: it.key, label: it.label, Icon: it.Icon, to: it.to }));
  }

  const action = primaryActionForRole(orgId, viewerRole, t);
  // The #1 action is lifted OUT of the tab row into the right slot —
  // the same move 11a made with the parent's "Contact school". Leaving
  // it in both places just spends a tab on a button that's already there.
  const navTabs = action ? tabs.filter((tab) => tab.to !== action.to) : tabs;

  const primary = navTabs.slice(0, MAX_PRIMARY_TABS);
  const overflow = navTabs.slice(MAX_PRIMARY_TABS);

  const tabActive = (tab: NavTab) =>
    tab.to ? isActive(pathname, tab.to) : (tab.items ?? []).some((it) => isActive(pathname, it.to));
  const overflowActive = overflow.some(tabActive);

  return (
    <nav className="flex items-center" data-tour="manage-toolbar">
      {primary.map((tab) =>
        tab.to ? (
          <Link key={tab.key} to={tab.to} className={tabCls(tabActive(tab))}>
            <tab.Icon className="h-3.5 w-3.5" />
            {tab.label}
          </Link>
        ) : (
          <DropdownMenu key={tab.key}>
            <DropdownMenuTrigger
              className={tabCls(tabActive(tab))}
              aria-label={`${tab.label} menu`}
            >
              <tab.Icon className="h-3.5 w-3.5" />
              {tab.label}
              <ChevronDown className="h-3 w-3 opacity-60" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-500">
                {tab.label}
              </DropdownMenuLabel>
              {(tab.items ?? []).map((it) => (
                <DropdownMenuItem key={it.key} asChild>
                  <Link
                    to={it.to}
                    className={
                      "flex items-center gap-2 text-sm " +
                      (isActive(pathname, it.to) ? "font-semibold text-indigo-700" : "text-slate-700")
                    }
                  >
                    <it.Icon className="h-3.5 w-3.5 shrink-0" />
                    {it.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      )}

      {/* Deferred is not hidden: everything past six lives here, still
          one click away and still showing which section you're in. */}
      {overflow.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className={tabCls(overflowActive)} aria-label="More menu">
            {t("portal.nav.more")}
            <ChevronDown className="h-3 w-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[200px]">
            {overflow.map((tab) =>
              tab.to ? (
                <DropdownMenuItem key={tab.key} asChild>
                  <Link
                    to={tab.to}
                    className={
                      "flex items-center gap-2 text-sm " +
                      (tabActive(tab) ? "font-semibold text-indigo-700" : "text-slate-700")
                    }
                  >
                    <tab.Icon className="h-3.5 w-3.5 shrink-0" />
                    {tab.label}
                  </Link>
                </DropdownMenuItem>
              ) : (
                <div key={tab.key}>
                  <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-500">
                    {tab.label}
                  </DropdownMenuLabel>
                  {(tab.items ?? []).map((it) => (
                    <DropdownMenuItem key={it.key} asChild>
                      <Link
                        to={it.to}
                        className={
                          "flex items-center gap-2 text-sm " +
                          (isActive(pathname, it.to) ? "font-semibold text-indigo-700" : "text-slate-700")
                        }
                      >
                        <it.Icon className="h-3.5 w-3.5 shrink-0" />
                        {it.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              ),
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {action && (
        <Link
          to={action.to}
          className="ml-auto hidden rounded-lg border border-indigo-200 px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-50 md:inline-flex"
        >
          {action.label}
        </Link>
      )}
    </nav>
  );
}
