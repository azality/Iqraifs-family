import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

type ViewMode = 'kid' | 'parent';

interface ViewModeContextType {
  viewMode: ViewMode;
  switchToKidMode: () => void;
  switchToParentMode: () => void;
  isTransitioning: boolean;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

// Define which routes are parent-only (not accessible in kid mode)
const PARENT_ONLY_ROUTES = [
  '/log',
  '/review',
  '/attendance',
  '/adjustments',
  '/edit-requests',
  '/audit',
  '/settings',
  '/wishlist',
  '/redemption-requests'
];

export function ViewModeProvider({ children }: { children: ReactNode }) {
  // Initialize viewMode based on user_role in localStorage
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const userRole = localStorage.getItem('user_role');
    console.log('🎨 ViewModeProvider Init - User role:', userRole);
    return userRole === 'child' ? 'kid' : 'parent';
  });
  const [isTransitioning, setIsTransitioning] = useState(false);

  const switchToKidMode = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setViewMode('kid');
      // Don't change user_role - that reflects actual login type
      // Just update the visual mode preference
      localStorage.setItem('fgs_view_mode_preference', 'kid');
      document.documentElement.classList.add('kid-mode');
      document.documentElement.classList.remove('parent-mode');
      
      // CRITICAL: Redirect to kid dashboard if currently on a parent-only page
      const currentPath = window.location.pathname;
      const isOnParentOnlyRoute = PARENT_ONLY_ROUTES.some(route => currentPath.startsWith(route));
      
      if (isOnParentOnlyRoute) {
        console.log('🔄 Switching to kid mode from parent-only route, redirecting to kid dashboard');
        window.location.href = '/kid/home';
      }
      
      setTimeout(() => setIsTransitioning(false), 600);
    }, 100);
  };

  const switchToParentMode = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setViewMode('parent');
      // Don't change user_role - that reflects actual login type
      // Just update the visual mode preference
      localStorage.setItem('fgs_view_mode_preference', 'parent');
      document.documentElement.classList.add('parent-mode');
      document.documentElement.classList.remove('kid-mode');
      setTimeout(() => setIsTransitioning(false), 600);
    }, 100);
  };

  // Initialize mode class on mount AND watch for role changes
  useEffect(() => {
    const userRole = localStorage.getItem('user_role');
    const initialMode = userRole === 'child' ? 'kid' : 'parent';
    
    console.log('🎨 ViewModeProvider Effect - Setting mode to:', initialMode);
    setViewMode(initialMode);
    document.documentElement.classList.add(`${initialMode}-mode`);
    document.documentElement.classList.remove(initialMode === 'kid' ? 'parent-mode' : 'kid-mode');
    
    // Listen for storage events (role changes from other tabs or login processes)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role') {
        const newRole = e.newValue;
        const newMode = newRole === 'child' ? 'kid' : 'parent';
        console.log('🎨 ViewModeProvider - Storage changed, new mode:', newMode);
        setViewMode(newMode);
        document.documentElement.classList.add(`${newMode}-mode`);
        document.documentElement.classList.remove(newMode === 'kid' ? 'parent-mode' : 'kid-mode');
      }
    };

    // Also listen for custom events (for same-window role changes)
    const handleRoleChange = () => {
      const newRole = localStorage.getItem('user_role');
      const newMode = newRole === 'child' ? 'kid' : 'parent';
      console.log('🎨 ViewModeProvider - Role changed (custom event), new mode:', newMode);
      setViewMode(newMode);
      document.documentElement.classList.add(`${newMode}-mode`);
      document.documentElement.classList.remove(newMode === 'kid' ? 'parent-mode' : 'kid-mode');
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('roleChanged', handleRoleChange);
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('roleChanged', handleRoleChange);
      document.documentElement.classList.remove('kid-mode', 'parent-mode');
    };
  }, []); // Only run once on mount, but listeners will handle updates

  return (
    <ViewModeContext.Provider value={{ viewMode, switchToKidMode, switchToParentMode, isTransitioning }}>
      {children}
    </ViewModeContext.Provider>
  );
}

export function useViewMode() {
  const context = useContext(ViewModeContext);
  if (!context) {
    // During hot reload or initial render, provide a safe fallback
    console.warn('useViewMode called outside ViewModeProvider - using fallback');
    return {
      viewMode: 'parent' as ViewMode,
      switchToKidMode: () => {},
      switchToParentMode: () => {},
      isTransitioning: false
    };
  }
  return context;
}

// Mode Transition Overlay Component
export function ModeTransitionOverlay() {
  const { isTransitioning, viewMode } = useViewMode();

  return (
    <AnimatePresence>
      {isTransitioning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 pointer-events-none"
          style={{
            background: viewMode === 'kid' 
              ? 'linear-gradient(135deg, #1C2541 0%, #2C3E50 100%)'
              : 'linear-gradient(135deg, #F5F7FA 0%, #E8EDF2 100%)'
          }}
        >
          <div className="flex items-center justify-center h-full">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.2, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              {viewMode === 'kid' ? (
                <div>
                  <div className="text-6xl mb-4">🌙</div>
                  <p className="text-2xl font-bold text-white">Entering Adventure Mode...</p>
                </div>
              ) : (
                <div>
                  <div className="text-6xl mb-4">📊</div>
                  <p className="text-2xl font-bold text-gray-800">Entering Command Center...</p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}