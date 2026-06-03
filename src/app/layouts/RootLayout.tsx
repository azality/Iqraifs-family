import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { ChildSelector } from "../components/ChildSelector";
import { ModeSwitcher } from "../components/ModeSwitcher";
import { WorkspaceSwitcher } from "../components/WorkspaceSwitcher";
import { useWorkspace } from "../contexts/WorkspaceContext";
import { ManageToolbar } from "../components/school-ui";
import { isOrgPrincipal } from "../../utils/schoolApi";
import {
  Home, FileText, BarChart3, Settings, Calendar, Gift, Shield,
  Menu, X, Trophy, Sliders, Edit, LogOut, Compass,
  Sparkles, Database, ChevronDown, Eye, School, Gamepad2,
} from "lucide-react";
import { cn } from "../components/ui/utils";
import { useViewMode } from "../contexts/ViewModeContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { AppModeGuard } from "../components/AppModeGuard";
import { LanguageDropdown } from "../components/LanguageDropdown";
import { getStorageSync } from '../../utils/storage';

// ---------------------------------------------------------------------------
// Navigation data
// ---------------------------------------------------------------------------

interface NavigationItem {
  name: string;
  href: string;
  kidHref?: string;
  icon: any;
  childAccess: boolean;
  /** Optional one-line description shown in the desktop dropdown panel. */
  description?: string;
}

interface NavGroup {
  label: string;   // shown as the group button label
  key: string;     // stable id for open/close state
  accent: string;  // Tailwind classes for the active underline (color accent per group)
  items: NavigationItem[];
}

// FAMILY workspace nav. Kid mode filters to items flagged childAccess.
const parentNavGroups: NavGroup[] = [
  {
    label: 'Daily',
    key: 'daily',
    accent: 'bg-blue-500',
    items: [
      { name: 'Dashboard',    href: '/',           icon: Home,     childAccess: true,  description: 'Overview & today' },
      { name: 'Log Behavior', href: '/log',        icon: FileText, childAccess: false, description: 'Record points in seconds' },
      { name: 'Attendance',   href: '/attendance', icon: Calendar, childAccess: false, description: 'Prayers, school, activities' },
    ],
  },
  {
    label: 'Growth',
    key: 'growth',
    accent: 'bg-emerald-500',
    items: [
      { name: 'Challenges',      href: '/challenges',      kidHref: '/kid/challenges',      icon: Trophy,   childAccess: true,  description: 'Weekly family goals' },
      { name: 'Knowledge Quest', href: '/knowledge-quest', kidHref: '/kid/knowledge-quest', icon: Sparkles, childAccess: true,  description: 'Quiz & learning games' },
      { name: 'Question Bank',   href: '/question-bank',   icon: Database, childAccess: false, description: 'Author & edit questions' },
      { name: 'Rewards',         href: '/rewards',         icon: Gift,     childAccess: true,  description: 'What kids can earn' },
    ],
  },
  {
    label: 'Review',
    key: 'review',
    accent: 'bg-amber-500',
    items: [
      { name: 'Weekly Review', href: '/review',          icon: BarChart3, childAccess: false, description: 'Trends & reflections' },
      { name: 'Monthly Review', href: '/monthly-review', icon: BarChart3, childAccess: false, description: 'Prayer heatmap & monthly trends' },
      { name: 'Adjustments',   href: '/adjustments',   icon: Sliders,   childAccess: false, description: 'Manual point changes' },
      { name: 'Edit Requests', href: '/edit-requests', icon: Edit,      childAccess: false, description: 'Pending change requests' },
      { name: 'Audit Trail',   href: '/audit',         icon: Shield,    childAccess: false, description: 'Who changed what, when' },
      { name: 'Games Review',  href: '/games-review',  icon: Gamepad2,  childAccess: false, description: "Fix kid game outcomes" },
    ],
  },
  {
    label: 'Setup',
    key: 'setup',
    accent: 'bg-slate-500',
    items: [
      { name: 'Settings', href: '/settings', icon: Settings, childAccess: false, description: 'Family, rules, preferences' },
    ],
  },
];

// SCHOOL workspace nav. Shown only when the user is in school workspace
// (selected via WorkspaceSwitcher). Single nav item that lands on /school
// — the SchoolHome page itself routes by role (principal → dashboard,
// teacher → class list). Behavior catalog and class detail are reachable
// from within /school, so the nav stays uncluttered.
const schoolNavGroups: NavGroup[] = [
  {
    label: 'School',
    key: 'school',
    accent: 'bg-indigo-500',
    items: [
      { name: 'Dashboard', href: '/school', icon: School, childAccess: false, description: 'Classes, students, today\'s logging' },
    ],
  },
];

// Quick-access mobile bottom nav
const parentQuickAccess = [
  parentNavGroups[0].items[0], // Dashboard
  parentNavGroups[0].items[1], // Log Behavior
  parentNavGroups[1].items[3], // Rewards
];
const kidQuickAccess = [
  parentNavGroups[0].items[0], // Dashboard
  parentNavGroups[1].items[0], // Challenges
  parentNavGroups[1].items[1], // Knowledge Quest
  parentNavGroups[1].items[3], // Rewards
];

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewMode, switchToParentMode, isPreviewingAsKid } = useViewMode();
  const { workspace } = useWorkspace();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout, user } = useAuth();

  const isKidMode = viewMode === 'kid';
  // Workspace gates the entire nav. Kid mode is family-only (kids don't
  // see school chrome ever — they get the KidLayout instead, but defense
  // in depth: never show school nav when isKidMode either).
  const isSchoolWorkspace = workspace.kind === 'school' && !isKidMode;

  // School ManageToolbar lives inline in this top bar (rather than in a
  // separate row in SchoolAdminShell) so the school workspace doesn't burn
  // a whole vertical row on chrome. Extract orgId from the URL —
  // /school/orgs/<uuid>/... — and figure out principal status from the
  // workspace context's `me`.
  const schoolOrgIdMatch = isSchoolWorkspace
    ? location.pathname.match(/\/school\/orgs\/([^/]+)/)
    : null;
  const schoolOrgId = schoolOrgIdMatch?.[1] ?? workspace.orgId ?? "";
  const isSchoolPrincipal = isSchoolWorkspace
    ? isOrgPrincipal(workspace.me ?? null, schoolOrgId)
    : false;

  // Visible groups — workspace selects the base set; kid mode (family
  // workspace only) further filters items to childAccess.
  const visibleGroups: NavGroup[] = useMemo(() => {
    if (isSchoolWorkspace) return schoolNavGroups;
    if (!isKidMode) return parentNavGroups;
    return parentNavGroups
      .map(g => ({ ...g, items: g.items.filter(i => i.childAccess) }))
      .filter(g => g.items.length > 0);
  }, [isKidMode, isSchoolWorkspace]);

  const getHref = (item: NavigationItem) =>
    isKidMode && item.kidHref ? item.kidHref : item.href;

  // Which group contains the current route (for active underline + drawer auto-expand).
  const activeGroupKey = useMemo(() => {
    for (const g of visibleGroups) {
      for (const item of g.items) {
        if (location.pathname === getHref(item)) return g.key;
      }
    }
    return null;
  }, [location.pathname, visibleGroups, isKidMode]);

  // --- Desktop dropdown state -----------------------------------------------
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click / Escape.
  useEffect(() => {
    if (!openDropdown) return;

    const handleClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openDropdown]);

  // Close dropdown on route change so clicking a link dismisses the panel.
  useEffect(() => {
    setOpenDropdown(null);
  }, [location.pathname]);

  // --- Mobile drawer collapsible groups -------------------------------------
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenGroups(prev => {
      const next: Record<string, boolean> = { ...prev };
      for (const g of visibleGroups) {
        if (next[g.key] === undefined) {
          next[g.key] = g.key === activeGroupKey;
        }
      }
      if (activeGroupKey) next[activeGroupKey] = true;
      return next;
    });
  }, [activeGroupKey, visibleGroups]);

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  // --- User info ------------------------------------------------------------
  // Three cases to resolve a display name:
  //  1. Real kid session (user_role === 'child') → setKidMode writes `kid_name`
  //     and NOT `fgs_user_name`, so we must read kid_name first or the header
  //     shows the default "User".
  //  2. Real parent → AuthContext.user.name is the reactive source of truth
  //     (loaded from STORAGE_KEYS.USER_NAME = 'fgs_user_name'). Fall back to
  //     the storage key so the name doesn't flash "User" before hydration.
  //  3. Anything unexpected → 'User'.
  // The old code read 'user_name' (no prefix) — nothing writes that, so it
  // always showed "User" for parents AND kids on shared layout pages.
  const userRole = getStorageSync('user_role') || 'guest';
  const isChildLoggedIn = userRole === 'child';
  const userName = isChildLoggedIn
    ? (getStorageSync('kid_name') || 'Adventurer')
    : (user?.name || getStorageSync('fgs_user_name') || 'User');
  const userInitial = (userName || 'U').charAt(0).toUpperCase();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/welcome');
  };

  // Mobile bottom nav. In school workspace we collapse it to a single
  // "Dashboard → /school" pill (everything reachable inside that page).
  const quickAccess = isSchoolWorkspace
    ? schoolNavGroups[0].items
    : (isKidMode ? kidQuickAccess : parentQuickAccess);

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-500">
      {/* =============== Preview banner (parent previewing as kid) =============== */}
      {isPreviewingAsKid && (
        <div className="bg-amber-400 text-amber-950 border-b border-amber-500 sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Eye className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm font-semibold truncate">
                Previewing as kid — actions are disabled
              </span>
            </div>
            <button
              onClick={() => {
                switchToParentMode();
                toast.success("Switched back to Parent View");
              }}
              className="text-xs font-semibold underline underline-offset-2 hover:text-amber-900 whitespace-nowrap"
            >
              Exit preview
            </button>
          </div>
        </div>
      )}

      {/* =============== Header =============== */}
      <header
        className={cn(
          "sticky z-30 shadow-sm border-b transition-all duration-500",
          isPreviewingAsKid ? "top-10" : "top-0",
          isKidMode
            ? "bg-gradient-to-r from-[#1C2541] to-[#2C3E50] border-[#F4C430]/20"
            : "bg-gradient-to-r from-slate-50 to-white border-slate-200/80"
        )}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          {/* Row 1 — brand / mode switcher / user */}
          <div className="flex items-center justify-between h-14 sm:h-16 gap-3">
            {/* Brand */}
            <Link to={isSchoolWorkspace ? "/school" : "/"} className="flex items-center gap-2 min-w-0 group">
              {isKidMode ? (
                <>
                  <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#F4C430] to-[#FFB347] flex items-center justify-center shadow-md shadow-amber-500/30">
                    <Compass className="h-5 w-5 text-[#1C2541]" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-sm sm:text-base font-bold leading-tight bg-gradient-to-r from-[#F4C430] to-[#FFE066] bg-clip-text text-transparent truncate">
                      Adventure Quest
                    </h1>
                    <p className="text-[10px] sm:text-xs text-[#F4C430]/70 leading-tight truncate">
                      Kid mode
                    </p>
                  </div>
                </>
              ) : isSchoolWorkspace ? (
                <>
                  <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-700 flex items-center justify-center shadow-md shadow-indigo-500/30 transition-transform group-hover:scale-105">
                    <School className="h-5 w-5 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-sm sm:text-base font-bold leading-tight text-slate-900 truncate">
                      {workspace.orgName ?? 'School'}
                    </h1>
                    <p className="text-[10px] sm:text-xs text-indigo-600/80 leading-tight truncate">
                      School workspace
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md shadow-blue-500/30 transition-transform group-hover:scale-105">
                    <Compass className="h-5 w-5 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h1 className="text-sm sm:text-base font-bold leading-tight text-slate-900 truncate">
                      Command Center
                    </h1>
                    <p className="text-[10px] sm:text-xs text-slate-500 leading-tight truncate">
                      Family Growth System
                    </p>
                  </div>
                </>
              )}
            </Link>

            {/* Center: child selector (family workspace only).
                School-side ManageToolbar lives in Row 2 below — keeps
                Row 1 readable (long org names + workspace switcher +
                user chip already use most of the width). */}
            <div className="hidden md:block flex-1 max-w-xs">
              {!isSchoolWorkspace && <ChildSelector />}
            </div>

            {/* Right: workspace switcher + mode switcher + user + logout */}
            <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
              {/* Workspace switcher renders nothing if the user has no
                  school role, so family-only users see no extra chrome. */}
              {!isChildLoggedIn && <WorkspaceSwitcher />}
              {/* Mode (parent/kid preview) only makes sense in family
                  workspace; hide it in school workspace. */}
              {!isChildLoggedIn && !isSchoolWorkspace && (
                <div className="hidden md:block">
                  <ModeSwitcher />
                </div>
              )}

              {/* User chip — avatar initial + name on larger screens */}
              <div className="hidden sm:flex items-center gap-2 px-2 py-1 rounded-full bg-slate-100/80 dark:bg-slate-800/40">
                <span
                  className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold",
                    isKidMode
                      ? "bg-gradient-to-br from-[#F4C430] to-[#FFB347] text-[#1C2541]"
                      : "bg-gradient-to-br from-blue-500 to-indigo-600 text-white"
                  )}
                  title={userName}
                >
                  {userInitial}
                </span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[120px] truncate">
                  {userName}
                </span>
              </div>

              <LanguageDropdown />

              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden lg:inline text-xs font-medium">Logout</span>
              </Button>

              {/* Mobile menu button (only for parents; kids use the bottom tab bar) */}
              {!isKidMode && (
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="sm:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5 text-slate-700" />
                </button>
              )}
            </div>
          </div>

          {/* Row 2 — mobile-only: child selector + mode switcher */}
          <div className="sm:hidden pb-2 space-y-2 border-t border-slate-200/60 pt-2">
            <ChildSelector />
            {!isChildLoggedIn && <ModeSwitcher mobile />}
            {isChildLoggedIn && (
              <div className="flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-[#FFF8E7] to-[#FFE5CC] rounded-lg border-2 border-[#F4C430]">
                <span className="text-sm font-bold text-[#2D1810]">Kid Adventure Mode</span>
              </div>
            )}
          </div>
        </div>

        {/* ============ Desktop: dropdown nav bar ============
            In SCHOOL workspace this row carries the ManageToolbar
            (Classes / Students / Parents / Teachers / Link Codes /
            Roster Requests / Announcements / Permissions / Settings)
            instead of the family-style group dropdowns — the school
            workspace only had one nav item ("School"), so the row
            was mostly wasted space. The ManageToolbar now lives
            here with room to breathe, and Row 1 stays clean for
            brand + workspace switcher + user chip. */}
        <div
          ref={navRef}
          className={cn(
            "hidden sm:block border-t",
            isKidMode ? "border-[#F4C430]/20 bg-[#1C2541]/60" : "border-slate-200/60 bg-white/60 backdrop-blur-sm"
          )}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {isSchoolWorkspace && schoolOrgId ? (
              <div className="py-2 overflow-x-auto">
                <ManageToolbar orgId={schoolOrgId} isPrincipal={isSchoolPrincipal} />
              </div>
            ) : (
            <div className="flex items-stretch gap-1 h-11">
              {visibleGroups.map((group) => {
                const isOpen = openDropdown === group.key;
                const isActive = activeGroupKey === group.key;
                return (
                  <div key={group.key} className="relative flex">
                    <button
                      onClick={() => setOpenDropdown(isOpen ? null : group.key)}
                      onMouseEnter={() => openDropdown && setOpenDropdown(group.key)}
                      className={cn(
                        "relative flex items-center gap-1.5 px-4 text-sm font-semibold tracking-wide transition-colors",
                        isKidMode ? "text-[#F4C430]/80 hover:text-[#F4C430]" : "text-slate-600 hover:text-slate-900",
                        isOpen && (isKidMode ? "text-[#F4C430]" : "text-slate-900"),
                        isActive && !isOpen && (isKidMode ? "text-[#F4C430]" : "text-blue-700")
                      )}
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn(
                          "h-3.5 w-3.5 transition-transform duration-200",
                          isOpen && "rotate-180"
                        )}
                      />
                      {/* Active underline */}
                      <span
                        className={cn(
                          "absolute left-2 right-2 bottom-0 h-0.5 rounded-full transition-all duration-300",
                          (isActive || isOpen) ? group.accent : "bg-transparent"
                        )}
                      />
                    </button>

                    {/* Dropdown panel */}
                    <div
                      className={cn(
                        "absolute left-0 top-full mt-1 w-72 rounded-xl border shadow-xl z-40",
                        "transition-all duration-150 origin-top",
                        isKidMode
                          ? "bg-[#2C3E50] border-[#F4C430]/20"
                          : "bg-white border-slate-200",
                        isOpen
                          ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
                          : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                      )}
                    >
                      <div className={cn(
                        "px-3 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest",
                        isKidMode ? "text-[#F4C430]/60" : "text-slate-400"
                      )}>
                        {group.label}
                      </div>
                      <div className="p-1.5">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const href = getHref(item);
                          const itemActive = location.pathname === href;
                          return (
                            <Link
                              key={item.name}
                              to={href}
                              onClick={() => setOpenDropdown(null)}
                              className={cn(
                                "flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors group",
                                itemActive
                                  ? (isKidMode
                                      ? "bg-[#F4C430]/10 text-[#F4C430]"
                                      : "bg-blue-50 text-blue-700")
                                  : (isKidMode
                                      ? "text-[#F4C430]/80 hover:bg-[#F4C430]/5 hover:text-[#F4C430]"
                                      : "text-slate-700 hover:bg-slate-50")
                              )}
                            >
                              <span
                                className={cn(
                                  "mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors",
                                  itemActive
                                    ? (isKidMode ? "bg-[#F4C430]/20" : "bg-blue-100")
                                    : (isKidMode ? "bg-[#F4C430]/5 group-hover:bg-[#F4C430]/10" : "bg-slate-100 group-hover:bg-slate-200")
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold leading-tight">{item.name}</div>
                                {item.description && (
                                  <div className={cn(
                                    "text-xs leading-snug mt-0.5",
                                    isKidMode ? "text-[#F4C430]/50" : "text-slate-500"
                                  )}>
                                    {item.description}
                                  </div>
                                )}
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Active-page breadcrumb on the right, gives visual grounding */}
              <div className="ml-auto hidden lg:flex items-center text-xs text-slate-400 pr-1">
                {activeGroupKey && (
                  <span className="italic">
                    {visibleGroups.find(g => g.key === activeGroupKey)?.items.find(i => getHref(i) === location.pathname)?.name}
                  </span>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </header>

      {/* =============== Mobile Drawer =============== */}
      {mobileMenuOpen && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="bg-white w-80 max-w-[85%] h-full shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-slate-50 to-white">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
                  <Compass className="h-4 w-4 text-white" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-slate-900 leading-tight">Command Center</h2>
                  <p className="text-[10px] text-slate-500 leading-tight">{userName}</p>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5 text-slate-600" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-2">
              {visibleGroups.map((group) => {
                const isOpen = !!openGroups[group.key];
                return (
                  <div key={group.key}>
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between px-2 py-2 rounded-md text-[11px] font-bold uppercase tracking-widest text-slate-500 hover:text-slate-900"
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("h-1.5 w-1.5 rounded-full", group.accent)} />
                        <span>{group.label}</span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200 text-slate-400",
                          isOpen && "rotate-180"
                        )}
                      />
                    </button>

                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        isOpen ? "max-h-96 opacity-100 mt-1" : "max-h-0 opacity-0"
                      )}
                    >
                      <div className="space-y-0.5 pl-1">
                        {group.items.map((item) => {
                          const Icon = item.icon;
                          const href = getHref(item);
                          const isActive = location.pathname === href;
                          return (
                            <Link
                              key={item.name}
                              to={href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                                isActive
                                  ? "bg-blue-50 text-blue-700"
                                  : "text-slate-700 hover:bg-slate-50"
                              )}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{item.name}</span>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>

            <div className="p-3 border-t bg-slate-50/50">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                className="w-full justify-start gap-2 text-slate-700 hover:text-red-600 hover:bg-red-50"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =============== Mobile Bottom Navigation =============== */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="grid grid-cols-4 gap-0.5 px-2 py-1.5">
          {quickAccess.map((item) => {
            const Icon = item.icon;
            const href = getHref(item);
            const isActive = location.pathname === href;
            return (
              <Link
                key={item.name}
                to={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-xs transition-colors",
                  isActive
                    ? "text-blue-700"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                <span
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center transition-colors",
                    isActive ? "bg-blue-100" : "bg-transparent"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-[10px] font-medium truncate w-full text-center leading-tight">
                  {item.name}
                </span>
              </Link>
            );
          })}

          {!isKidMode && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg text-xs text-slate-500 hover:text-slate-700 transition-colors"
            >
              <span className="h-8 w-8 rounded-lg flex items-center justify-center bg-transparent">
                <Menu className="h-4 w-4" />
              </span>
              <span className="text-[10px] font-medium truncate w-full text-center leading-tight">
                More
              </span>
            </button>
          )}
        </div>
      </div>

      {/* =============== Main Content =============== */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 mb-20 sm:mb-0">
        <AppModeGuard>
          <Outlet />
        </AppModeGuard>
      </main>

      {/* =============== Footer (desktop only) =============== */}
      <footer className="hidden sm:block border-t bg-slate-50/60 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <p className="text-center text-xs text-slate-400">
            Family Growth System · Consistency, accountability, growth
          </p>
        </div>
      </footer>
    </div>
  );
}
