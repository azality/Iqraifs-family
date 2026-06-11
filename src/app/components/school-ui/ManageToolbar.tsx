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
    case "class_teacher":
    case "visiting_teacher":
    case "hifz_teacher":
      return [
        I("my-schedule", "My schedule", `/school/orgs/${orgId}/my-schedule`, Calendar),
        announcements,
      ];
    case "office_staff":
      return [
        I("students", t("toolbar.students"), `/school/orgs/${orgId}/admin/students`, Users),
        I("parents", t("toolbar.parents"), `/school/orgs/${orgId}/admin/parents`, Heart),
        I("roster-requests", t("toolbar.rosterRequests"), `/school/orgs/${orgId}/admin/roster-requests`, ClipboardList),
        I("inbox", "Parent inbox", `/school/orgs/${orgId}/admin/inbox`, Inbox),
        announcements,
      ];
    case "financial_staff":
      return [
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
        I("hifz-groups", "Hifz Groups", `/school/orgs/${orgId}/admin/hifz-groups`, BookMarked),
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
        I("public-site", "Public site", `/school/orgs/${orgId}/admin/public-site`, Globe),
      ],
    },
  ];

  // Admin group — principal only, since it carries Permissions + Settings.
  if (role === "principal") {
    groups.push({
      key: "admin",
      label: "Admin",
      Icon: Wrench,
      items: [
        I("permissions", t("toolbar.permissions"), `/school/orgs/${orgId}/admin/permissions`, ShieldCheck),
        I("settings", t("toolbar.settings"), `/school/orgs/${orgId}/admin/settings`, SettingsIcon),
        I("import", "Import", `/school/orgs/${orgId}/admin/import`, UploadCloud),
        I("audit", "Audit log", `/school/orgs/${orgId}/admin/audit`, ScrollText),
      ],
    });
  } else {
    // Admin (non-principal) still gets Import + Audit.
    groups.push({
      key: "admin",
      label: "Admin",
      Icon: Wrench,
      items: [
        I("import", "Import", `/school/orgs/${orgId}/admin/import`, UploadCloud),
        I("audit", "Audit log", `/school/orgs/${orgId}/admin/audit`, ScrollText),
      ],
    });
  }

  return groups;
}

function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(to + "/");
}

export function ManageToolbar({ orgId, viewerRole }: ManageToolbarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  // Principals and admins get the grouped dropdown layout. Everyone
  // else keeps the original flat row — their lists are short enough.
  if (viewerRole === "principal" || viewerRole === "admin") {
    const groups = groupsForAdmin(orgId, viewerRole, t);
    return (
      <div className="flex flex-wrap items-center gap-2" data-tour="manage-toolbar">
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
