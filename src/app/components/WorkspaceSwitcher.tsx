// WorkspaceSwitcher — top-of-header dropdown for choosing Family vs School.
//
// Hidden entirely for users with no school role (the vast majority of the
// family product's users). For users who have both, a small "switcher pill"
// shows the current workspace name and opens a popover listing the choices.

import { useState } from "react";
import { useNavigate } from "react-router";
import { Building2, Home, ChevronDown } from "lucide-react";
import { Button } from "./ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { cn } from "./ui/utils";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { principalOrgIds, teacherClassIds } from "../../utils/schoolApi";

export function WorkspaceSwitcher() {
  const { workspace, me, hasSchoolAccess, hasFamily, switchToFamily, switchToSchool, loading } = useWorkspace();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  if (loading) return null;
  if (!hasSchoolAccess) return null;

  const principalOrgs = me ? me.organizations.filter((o) =>
    principalOrgIds(me).includes(o.id),
  ) : [];
  const teacherClassCount = me ? teacherClassIds(me).length : 0;

  // Convenience: the "primary" school org for this user (first principal
  // org, or first teacher's class org). Used by the quick-switch action.
  const primaryOrg = principalOrgs[0]
    ?? (me ? me.organizations[0] : undefined);

  const choose = (kind: "family" | "school", org?: { id: string; name: string }) => {
    if (kind === "family") {
      switchToFamily();
      setOpen(false);
      navigate("/");
    } else if (org) {
      switchToSchool(org.id, org.name);
      setOpen(false);
      // Drop them on the principal dashboard for that org (or school home
      // if they're a teacher — that page handles the role routing).
      const isPrincipalOfThisOrg = principalOrgs.some((p) => p.id === org.id);
      navigate(isPrincipalOfThisOrg ? `/school/orgs/${org.id}` : "/school");
    }
  };

  const isSchool = workspace.kind === "school";
  const currentLabel = isSchool
    ? workspace.orgName ?? primaryOrg?.name ?? "School"
    : "Family";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "gap-2 h-8 px-2.5 font-medium border",
            isSchool
              ? "bg-indigo-50 border-indigo-300 text-indigo-900 hover:bg-indigo-100"
              : "bg-blue-50 border-blue-200 text-blue-900 hover:bg-blue-100",
          )}
        >
          {isSchool ? <Building2 className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">{currentLabel}</span>
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1.5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
          Workspace
        </p>

        {/* Family workspace option — hidden for school-only signups.
            A user with no FAMILY_ID in storage has never created a
            family; offering them "My Family" routes to /onboarding
            (dead end). Hide it entirely. */}
        {hasFamily && (
          <button
            onClick={() => choose("family")}
            className={cn(
              "w-full flex items-start gap-3 px-2 py-2.5 rounded-md text-left text-sm transition-colors",
              workspace.kind === "family"
                ? "bg-blue-50 text-blue-900"
                : "hover:bg-slate-50 text-slate-700",
            )}
          >
            <Home className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium">My Family</p>
              <p className="text-xs text-slate-500">Personal use — children, rewards, Salah</p>
            </div>
            {workspace.kind === "family" && (
              <span className="text-xs text-blue-700 font-semibold">●</span>
            )}
          </button>
        )}

        {/* Each principal org as an option */}
        {principalOrgs.map((org) => {
          const isActive = isSchool && workspace.orgId === org.id;
          return (
            <button
              key={org.id}
              onClick={() => choose("school", org)}
              className={cn(
                "w-full flex items-start gap-3 px-2 py-2.5 rounded-md text-left text-sm transition-colors",
                isActive
                  ? "bg-indigo-50 text-indigo-900"
                  : "hover:bg-slate-50 text-slate-700",
              )}
            >
              <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{org.name}</p>
                <p className="text-xs text-slate-500">
                  Principal · <span className="capitalize">{org.plan}</span> plan
                </p>
              </div>
              {isActive && <span className="text-xs text-indigo-700 font-semibold">●</span>}
            </button>
          );
        })}

        {/* Teacher-only fallback: no principal orgs but user has teacher
            class roles. Show a "School" option that routes to /school. */}
        {principalOrgs.length === 0 && teacherClassCount > 0 && primaryOrg && (
          <button
            onClick={() => choose("school", primaryOrg)}
            className={cn(
              "w-full flex items-start gap-3 px-2 py-2.5 rounded-md text-left text-sm transition-colors",
              isSchool
                ? "bg-indigo-50 text-indigo-900"
                : "hover:bg-slate-50 text-slate-700",
            )}
          >
            <Building2 className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{primaryOrg.name}</p>
              <p className="text-xs text-slate-500">
                Teacher · {teacherClassCount} class{teacherClassCount === 1 ? "" : "es"}
              </p>
            </div>
            {isSchool && <span className="text-xs text-indigo-700 font-semibold">●</span>}
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
