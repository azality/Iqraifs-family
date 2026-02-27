import { Outlet, Link, useLocation, useNavigate } from "react-router";
import { ChildSelector } from "../components/ChildSelector";
import { ModeSwitcher } from "../components/ModeSwitcher";
import { AuthErrorBanner } from "../components/AuthErrorBanner";
import { Home, FileText, BarChart3, Settings, Calendar, Gift, Shield, Users, Menu, X, Trophy, Sliders, Edit, Brain, LogOut, Compass, Briefcase } from "lucide-react";
import { cn } from "../components/ui/utils";
import { useViewMode } from "../contexts/ViewModeContext";
import { useState } from "react";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { AppModeGuard } from "../components/AppModeGuard";

const parentNavigation = [
  { name: 'Dashboard', href: '/', icon: Home, childAccess: true },
  { name: 'Log Behavior', href: '/log', icon: FileText, childAccess: false },
  { name: 'Challenges', href: '/challenges', icon: Trophy, childAccess: true },
  { name: 'Weekly Review', href: '/review', icon: BarChart3, childAccess: false },
  { name: 'Rewards', href: '/rewards', icon: Gift, childAccess: true },
  { name: 'Quizzes', href: '/quizzes', icon: Brain, childAccess: true },
  { name: 'Attendance', href: '/attendance', icon: Calendar, childAccess: false },
  { name: 'Adjustments', href: '/adjustments', icon: Sliders, childAccess: false },
  { name: 'Edit Requests', href: '/edit-requests', icon: Edit, childAccess: false },
  { name: 'Audit Trail', href: '/audit', icon: Shield, childAccess: false },
  { name: 'Settings', href: '/settings', icon: Settings, childAccess: false },
];

export function RootLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { viewMode } = useViewMode();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout } = useAuth();

  const isKidMode = viewMode === 'kid';
  const navigation = isKidMode 
    ? parentNavigation.filter(item => item.childAccess)
    : parentNavigation;

  const userName = localStorage.getItem('user_name') || 'User';
  const userRole = localStorage.getItem('user_role') || 'guest';
  
  // Kids are logged in separately and shouldn't see parent features
  const isChildLoggedIn = userRole === 'child';

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/welcome');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col transition-colors duration-500">
      {/* Auth Error Banner */}
      <AuthErrorBanner />
      
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-20 shadow-sm transition-all duration-500">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                {/* Dynamic branding based on view mode */}
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
          
          {/* Mode Switcher - Prominent placement */}
          {/* Hide Mode Switcher for kids - they shouldn't be able to switch to parent mode */}
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
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="gap-2"
              >
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline">Logout</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="sm:hidden fixed inset-0 z-30 bg-black bg-opacity-50" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-white w-64 h-full shadow-lg p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Menu</h2>
              <button onClick={() => setMobileMenuOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Mobile Navigation */}
            <nav className="space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.href;
                
                return (
                  <Link
                    key={item.name}
                    to={item.href}
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
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Navigation */}
      <nav className="bg-card border-b hidden sm:block transition-colors duration-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-1 overflow-x-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
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
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-card border-t z-10 transition-colors duration-500">
        <div className="grid grid-cols-4 gap-1 p-2">
          {navigation.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            
            return (
              <Link
                key={item.name}
                to={item.href}
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
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8 mb-16 sm:mb-0">
        <AppModeGuard>
          <Outlet />
        </AppModeGuard>
      </main>

      {/* Footer - Hidden on mobile */}
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