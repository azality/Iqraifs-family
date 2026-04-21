import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { ChildSelector } from "../components/ChildSelector";
import { ModeSwitcher } from "../components/ModeSwitcher";
import {
  Home, FileText, BarChart3, Settings, Calendar, Gift, Shield,
  Menu, X, Trophy, Sliders, Edit, LogOut, Compass, Briefcase,
  Sparkles, Database, Gamepad2, ChevronDown,
} from "lucide-react";
import { cn } from "../components/ui/utils";
import { useViewMode } from "../contexts/ViewModeContext";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { AppModeGuard } from "../components/AppModeGuard";
import { getStorageSync } from '../../utils/storage';

interface NavigationItem {
  name: string;
  href: string;
  kidHref?: string;
  icon: any;
  childAccess: boolean;
}

interface NavGroup {
  label: string;      // shown as the section header
  key: string;        // stable id for open/close state
  items: NavigationItem[];
}

// One source of truth — grouped. We flatten when we need a list.
const parentNavGroups: NavGroup[] = [
  {
    label: 'Daily',
    key: 'daily',
    items: [
      { name: 'Dashboard',    href: '/',           icon: Home,     childAccess: true  },
      { name: 'Log Behavior', href: '/log',        icon: FileText, childAccess: false },
      { name: 'Attendance',   href: '/attendance', icon: Calendar, childAccess: false },
    ],
  },
  {
    label: 'Growth',
    key: 'growth',
    items: [
      { name: 'Challenges',      href: '/challenges',      kidHref: '/kid/challenges',      icon: Trophy,   childAccess: true  },
      { name: 'Knowledge Quest', href: '/knowledge-quest', kidHref: '/kid/knowledge-quest', icon: Sparkles, childAccess: true  },
      { name: 'Question Bank',   href: '/question-bank',   icon: Database, childAccess: false },
      { name: 'Rewards',         href: '/rewards',         icon: Gift,     childAccess: true  },
    ],
  },
  {
    label: 'Review',
    key: 'review',
    items: [
      { name: 'Weekly Review', href: '/review',        icon: BarChart3, childAccess: false },
      { name: 'Adjustments',   href: '/adjustments',   icon: Sliders,   childAccess: false },
      { name: 'Edit Requests', href: '/edit-requests', icon: Edit,      childAccess: false },
      { name: 'Audit Trail',   href: '/audit',         icon: Shield,    childAccess: false },
    ],
  },
  {
    label: 'Setup',
    key: 'setup',
    items: [
      { name: 'Settings', href: '/settings', icon: Settings, childAccess: false },
    ],
  },
];

// Quick-access bottom tabs. For parents we pick the 3 most-used + a "Menu" button.
// For kids we pick 4 kid-accessible shortcuts.
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

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout } = useAuth();

  const isKidMode = viewMode === 'kid';

  // Build the visible groups (kid mode filters to child-accessible only, and drops empty groups).
  const visibleGroups: NavGroup[] = useMemo(() => {
    if (!isKidMode) return parentNavGroups;
    return parentNavGroups
      .map(g => ({ ...g, items: g.items.filter(i => i.childAccess) }))
      .filter(g => g.items.length > 0);
  }, [isKidMode]);

  // Helper to get the correct href based on mode
  const getHref = (item: NavigationItem) =>
    isKidMode && item.kidHref ? item.kidHref : item.href;

  // Figure out which group contains the current route so we can auto-expand it.
  const activeGroupKey = useMemo(() => {
    for (const g of visibleGroups) {
      for (const item of g.items) {
        if (location.pathname === getHref(item)) return g.key;
      }
    }
    return visibleGroups[0]?.key ?? null;
  }, [location.pathname, visibleGroups, isKidMode]);

  // Collapsible state per group. Default: the active group is open, others closed.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    setOpenGroups(prev => {
      const next: Record<string, boolean> = { ...prev };
      // First time any group is seen, seed from activeGroupKey
      for (const g of visibleGroups) {
        if (next[g.key] === undefined) {
          next[g.key] = g.key === activeGroupKey;
        }
      }
      // Always make sure the active group is open when the route changes
      if (activeGroupKey) next[activeGroupKey] = true;
      return next;
    });
  }, [activeGroupKey, visibleGroups]);

  const toggleGroup = (key: string) =>
    setOpenGroups(prev => ({ ...prev, [key]: !prev[key] }));

  const userName = getStorageSync('user_name') || 'User';
  const userRole = getStorageSync('user_role') || 'guest';
  const isChildLoggedIn = userRole === 'child';

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/welcome');
  };

  const quickAccess = isKidMode ? kidQuickAccess : parentQuickAccess;

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-500">
      {/* ================= Header ================= */}
      <header className="bg-card border-b border-border sticky top-0 z-20 shadow-sm transition-all duration-500">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {isKidMode ? (
                  <>
                    <Compass className="h-5 w-5 sm:h-6 sm:w-6 text-[#F4C430] flex-shrink-0 transition-colors" />
                    <h1 className="text-sm sm:text-xl font-bold truncate bg-gradient-to-r from-[#F4C430] to-[#FFD700] bg-clip-text text-transparent transition-colors">Adventure Quest</h1>
                  </>
                ) : (
                  <>
                    <Briefcase className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600 flex-shrink-0 transition-colors" />
                    <h1 className="text-sm sm:text-xl font-bold truncate text-blue-600 transition-colors">Parent Command Center</h1>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden p-2"
                aria-label="Open menu"
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              {/* Child Selector - hidden on small mobile */}
              <div className="hidden sm:block">
                <ChildSelector />
              </div>
            </div>
          </div>

          {/* Mobile Child Selector */}
          <div className="pb-3 sm:hidden border-b">
            <ChildSelector />
          </div>

          {/* Mode Switcher row */}
          <div className="pb-3 border-t pt-3 mt-2 flex items-center justify-between gap-4">
            {!isChildLoggedIn && <ModeSwitcher />}
            {isChildLoggedIn && (
              <div className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-[#FFF8E7] to-[#FFE5CC] rounded-lg border-2 border-[#F4C430]">
                <span className="text-sm font-bold text-[#2D1810]">🌟 Kid Adventure Mode</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground hidden sm:block">
                {userName} ({userRole})
              </span>
              <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-2">
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* ================= Mobile Drawer (grouped, collapsible) ================= */}
      {mobileMenuOpen && (
        <div
          className="sm:hidden fixed inset-0 z-30 bg-black/50"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div
            className="bg-white w-72 max-w-[85%] h-full shadow-lg flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5" />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-2 space-y-1">
              {visibleGroups.map((group) => {
                const isOpen = !!openGroups[group.key];
                return (
                  <div key={group.key} className="mb-1">
                    <button
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider text-gray-500 hover:bg-gray-50"
                    >
                      <span>{group.label}</span>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 transition-transform duration-200",
                          isOpen ? "rotate-180" : ""
                        )}
                      />
                    </button>

                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200",
                        isOpen ? "max-h-96 opacity-100 mt-1" : "max-h-0 opacity-0"
                      )}
                    >
                      <div className="space-y-1 pl-1">
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
                                "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                                isActive
                                  ? "bg-blue-50 text-blue-600"
                                  : "text-gray-700 hover:bg-gray-50"
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              {item.name}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* ================= Desktop Navigation (grouped pills + items) ================= */}
      <nav className="bg-card border-b hidden sm:block transition-colors duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-stretch gap-1 overflow-x-auto">
            {visibleGroups.map((group, gi) => (
              <div key={group.key} className="flex items-stretch">
                {/* Group label pill */}
                <div className="flex items-center px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 select-none">
                  {group.label}
                </div>

                {/* Items in this group */}
                <div className="flex items-stretch">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const href = getHref(item);
                    const isActive = location.pathname === href;
                    return (
                      <Link
                        key={item.name}
                        to={href}
                        className={cn(
                          "flex items-center gap-2 px-3 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                          isActive
                            ? "border-primary text-primary"
                            : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>

                {/* Divider between groups */}
                {gi < visibleGroups.length - 1 && (
                  <div className="mx-2 my-2 w-px bg-border self-stretch" />
                )}
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* ================= Mobile Bottom Navigation ================= */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-10 transition-colors duration-500">
        <div className="grid grid-cols-4 gap-1 p-2">
          {quickAccess.map((item) => {
            const Icon = item.icon;
            const href = getHref(item);
            const isActive = location.pathname === href;
            return (
              <Link
                key={item.name}
                to={href}
                className={cn(
                  "flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] truncate w-full text-center">{item.name}</span>
              </Link>
            );
          })}

          {/* "Menu" button is only for parents (kids get 4 shortcuts) */}
          {!isKidMode && (
            <button
              onClick={() => setMobileMenuOpen(true)}
              className={cn(
                "flex flex-col items-center gap-1 px-2 py-2 rounded-lg text-xs font-medium transition-colors",
                mobileMenuOpen ? "bg-primary/10 text-primary" : "text-muted-foreground"
              )}
            >
              <Menu className="h-5 w-5" />
              <span className="text-[10px] truncate w-full text-center">Menu</span>
            </button>
          )}
        </div>
      </div>

      {/* ================= Main Content ================= */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 mb-16 sm:mb-0">
        <AppModeGuard>
          <Outlet />
        </AppModeGuard>
      </main>

      {/* ================= Footer ================= */}
      <footer className="bg-card border-t mt-auto hidden sm:block transition-colors duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-center text-sm text-muted-foreground">
            <p>Family Growth System - Structured, Values-Driven Family Development Platform</p>
            <p className="mt-1">Built on principles of consistency, accountability, and growth</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
