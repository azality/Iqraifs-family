// Shared school manage toolbar — role-aware.
//
// Renders the row of navigation buttons that appears at the top of every
// school page. The items shown depend on the caller's role:
//
//   principal / admin / org-scoped teacher
//     → grouped dropdown menus (Today / People / Academics / Money /
//       Communications / Admin). The flat row of 17 pills was hard on
//       the eyes at scale; grouping collapses it to ~6 visible buttons
//       and keeps the rest one click away.
//   class_teacher / visiting_teacher / hifz_teacher
//     → flat minimal toolbar (My schedule + Announcements) — short
//       enough to not need grouping.
//   office_staff / financial_staff
//     → flat focused toolbar, same reasoning.
//
// Active state is computed from the current pathname. For the grouped
// view, the group whose child is active gets the accent treatment so
// the user sees which area they're in without opening anything.

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
import { accentBg, accentBorder, accentText } from "./tokens";
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

export function ManageToolbar({ orgId, viewerRole }: ManageToolbarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  // Principals and admins get the grouped dropdown layout. Everyone
  // else keeps the original flat row — their lists are short enough.
  if (viewerRole === "principal" || viewerRole === "admin") {
    const groups = groupsForAdmin(orgId, viewerRole, t);
    // Standalone Dashboard pill ahead of the dropdowns — principals and
    // admins had no toolbar route back to the org homepage (teachers /
    // office / finance rows all have one). isActive treats the org root
    // as exact-match, so it only lights up on the dashboard itself.
    const dashTo = `/school/orgs/${orgId}`;
    const dashActive = isActive(pathname, dashTo);
    return (
      <div className="flex flex-wrap items-center gap-2" data-tour="manage-toolbar">
        <Link
          to={dashTo}
          className={
            "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors " +
            (dashActive
              ? `${accentBg} ${accentBorder} ${accentText} border`
              : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50")
          }
        >
          <Home className="h-3.5 w-3.5" />
          Dashboard
        </Link>
        {groups.map((g) => {
          const activeChild = g.items.find((it) => isActive(pathname, it.to));
          const groupActive = !!activeChild;
          const activeClasses = `${accentBg} ${accentBorder} ${accentText} border`;
          const inactiveClasses = "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";
          return (
            <DropdownMenu key={g.key}>
              <DropdownMenuTrigger
                className={
                  "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors " +
                  (groupActive ? activeClasses : inactiveClasses)
                }
                aria-label={`${g.label} menu${activeChild ? ` — on ${activeChild.label}` : ""}`}
              >
                <g.Icon className="h-3.5 w-3.5" />
                {g.label}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[200px]">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-slate-500">
                  {g.label}
                </DropdownMenuLabel>
                {g.items.map((it) => {
                  const itemActive = isActive(pathname, it.to);
                  return (
                    <DropdownMenuItem key={it.key} asChild>
                      <Link
                        to={it.to}
                        className={
                          "flex items-center gap-2 text-sm " +
                          (itemActive ? "font-semibold text-indigo-700" : "text-slate-700")
                        }
                      >
                        <it.Icon className="h-3.5 w-3.5 shrink-0" />
                        {it.label}
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}
      </div>
    );
  }

  // Flat row for teachers / office / financial.
  const items = flatItemsForRole(orgId, viewerRole, t);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-tour="manage-toolbar">
      {items.map(({ key, label, to, Icon }) => {
        const active = isActive(pathname, to);
        const activeClasses = `${accentBg} ${accentBorder} ${accentText} border`;
        const inactiveClasses = "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";
        return (
          <Link
            key={key}
            to={to}
            className={
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium shadow-sm transition-colors " +
              (active ? activeClasses : inactiveClasses)
            }
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}
