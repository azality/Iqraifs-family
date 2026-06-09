// Shared school manage toolbar — role-aware.
//
// Renders the row of navigation buttons that appears at the top of every
// school page. The items shown depend on the caller's role:
//
//   principal / admin / org-scoped teacher
//     → full toolbar (Classes / Students / Parents / Teachers / Link
//       Codes / Roster Requests / Announcements + Permissions / Settings
//       for principals)
//   class_teacher / visiting_teacher
//     → minimal toolbar (Announcements only — their dashboard already
//       links them straight to their own sections; we don't want a row
//       of admin-flavoured links they can't use)
//   office_staff
//     → Students, Parents, Roster Requests, Announcements
//   financial_staff
//     → Fees, Announcements
//
// Active state is computed from the current pathname so the user always
// sees which section they're on.

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
  Inbox,
} from "lucide-react";
import type { SchoolViewerRole } from "../../../utils/schoolApi";
import { accentBg, accentBorder, accentText } from "./tokens";

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

function itemsForRole(
  orgId: string,
  role: SchoolViewerRole,
  t: (k: string) => string,
): ToolbarItem[] {
  const I = (
    key: string,
    label: string,
    to: string,
    Icon: typeof Users,
  ): ToolbarItem => ({ key, label, to, Icon });

  const announcements = I(
    "announcements",
    t("toolbar.announcements"),
    `/school/orgs/${orgId}/admin/announcements`,
    Megaphone,
  );

  switch (role) {
    case "class_teacher":
    case "visiting_teacher":
    // PR feat/hifz-teacher-section-listing — Hifz-only teachers see the
    // same minimal toolbar; TeacherHome is their primary surface and it
    // already filters to their assigned sections (now including Hifz-
    // teacher attachments).
    case "hifz_teacher":
      // Their dashboard (TeacherHome) is the primary navigation surface;
      // toolbar stays minimal so we don't tease admin-only pages.
      return [announcements];

    case "office_staff":
      return [
        I("students", t("toolbar.students"), `/school/orgs/${orgId}/admin/students`, Users),
        I("parents", t("toolbar.parents"), `/school/orgs/${orgId}/admin/parents`, Heart),
        I("roster-requests", t("toolbar.rosterRequests"), `/school/orgs/${orgId}/admin/roster-requests`, ClipboardList),
        announcements,
      ];

    case "financial_staff":
      return [
        I("fees", "Fees", `/school/orgs/${orgId}/admin/fees`, DollarSign),
        announcements,
      ];

    case "principal":
    case "admin": {
      const base: ToolbarItem[] = [
        I("classes", t("toolbar.classes"), `/school/orgs/${orgId}/admin/classes`, BookOpen),
        I("students", t("toolbar.students"), `/school/orgs/${orgId}/admin/students`, Users),
        I("parents", t("toolbar.parents"), `/school/orgs/${orgId}/admin/parents`, Heart),
        I("teachers", t("toolbar.teachers"), `/school/orgs/${orgId}/admin/teachers`, UserCog),
        I("link-codes", t("toolbar.linkCodes"), `/school/orgs/${orgId}/admin/link-codes`, KeyRound),
        I("roster-requests", t("toolbar.rosterRequests"), `/school/orgs/${orgId}/admin/roster-requests`, ClipboardList),
        I("fees", "Fees", `/school/orgs/${orgId}/admin/fees`, DollarSign),
        announcements,
      ];
      // Hifz Groups (PR feat/hifz-groups) — peer of class sections.
      // Inserted before the import-center entry so it sits near the
      // other structural surfaces (Classes, Students…).
      base.push(
        I("hifz-groups", "Hifz Groups", `/school/orgs/${orgId}/admin/hifz-groups`, BookMarked),
        // Org-wide weekly schedule. Admin sets slots once; per-section
        // / per-Hifz-group assignments stack onto them.
        I("timetable", "Timetable", `/school/orgs/${orgId}/admin/timetable`, Calendar),
        // Term + exam + marks structure that feeds report cards.
        I("assessment", "Assessment", `/school/orgs/${orgId}/admin/assessment`, ClipboardList),
        // Parent ↔ school messaging inbox.
        I("inbox", "Parent inbox", `/school/orgs/${orgId}/admin/inbox`, Inbox),
      );
      // Bulk import center — admin/principal only. Pre-launch
      // migration from a paper school usually needs every importer in
      // one place; placing the link in the sidebar makes the workflow
      // discoverable. Translation key intentionally inline ("Import")
      // until we wire it through the i18n bundle.
      base.push(
        I("import", "Import", `/school/orgs/${orgId}/admin/import`, UploadCloud),
      );
      if (role === "principal") {
        base.push(
          I("permissions", t("toolbar.permissions"), `/school/orgs/${orgId}/admin/permissions`, ShieldCheck),
          I("settings", t("toolbar.settings"), `/school/orgs/${orgId}/admin/settings`, SettingsIcon),
        );
      }
      return base;
    }

    case "other":
    default:
      return [];
  }
}

export function ManageToolbar({ orgId, viewerRole }: ManageToolbarProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();

  const items = itemsForRole(orgId, viewerRole, t);
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-tour="manage-toolbar">
      {items.map(({ key, label, to, Icon }) => {
        const active = pathname === to || pathname.startsWith(to + "/");
        const activeClasses = `${accentBg} ${accentBorder} ${accentText} border`;
        const inactiveClasses =
          "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50";
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
