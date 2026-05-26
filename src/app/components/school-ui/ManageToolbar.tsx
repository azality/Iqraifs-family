// Shared school-admin manage toolbar.
//
// Renders the row of navigation buttons (Classes, Students, Parents, Teachers,
// Link Codes, Roster Requests, Permissions, Settings) that appears at the top
// of every school-admin page. Originally lived inline inside
// PerformanceDashboard.tsx; lifted here so SchoolAdminShell can render it
// once across all nested admin routes (no more back-button-to-dashboard
// friction when jumping between sections).
//
// Active state is computed from the current pathname so the user always sees
// which section they're on. Principal-only items (Permissions, Settings) are
// gated by the `isPrincipal` prop — caller computes it via isOrgPrincipal().

import { Link, useLocation } from "react-router";
import {
  BookOpen,
  Users,
  Heart,
  UserCog,
  KeyRound,
  ClipboardList,
  ShieldCheck,
  Settings as SettingsIcon,
} from "lucide-react";
import { accentBg, accentBorder, accentText } from "./tokens";

export interface ManageToolbarProps {
  orgId: string;
  isPrincipal: boolean;
}

interface ToolbarItem {
  key: string;
  label: string;
  to: string;
  Icon: typeof Users;
}

export function ManageToolbar({ orgId, isPrincipal }: ManageToolbarProps) {
  const { pathname } = useLocation();

  const items: ToolbarItem[] = [
    { key: "classes", label: "Classes", to: `/school/orgs/${orgId}/admin/classes`, Icon: BookOpen },
    { key: "students", label: "Students", to: `/school/orgs/${orgId}/admin/students`, Icon: Users },
    { key: "parents", label: "Parents", to: `/school/orgs/${orgId}/admin/parents`, Icon: Heart },
    { key: "teachers", label: "Teachers", to: `/school/orgs/${orgId}/admin/teachers`, Icon: UserCog },
    { key: "link-codes", label: "Link Codes", to: `/school/orgs/${orgId}/admin/link-codes`, Icon: KeyRound },
    {
      key: "roster-requests",
      label: "Roster Requests",
      to: `/school/orgs/${orgId}/admin/roster-requests`,
      Icon: ClipboardList,
    },
  ];
  if (isPrincipal) {
    items.push({
      key: "permissions",
      label: "Permissions",
      to: `/school/orgs/${orgId}/admin/permissions`,
      Icon: ShieldCheck,
    });
    items.push({
      key: "settings",
      label: "Settings",
      to: `/school/orgs/${orgId}/admin/settings`,
      Icon: SettingsIcon,
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
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
