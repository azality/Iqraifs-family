import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { getStorageSync, setStorageSync } from '../../utils/storage';

type ViewMode = 'kid' | 'parent';

interface ViewModeContextType {
  viewMode: ViewMode;
  switchToKidMode: () => void;
  switchToParentMode: () => void;
  isTransitioning: boolean;
  /**
   * True when the ACTUAL logged-in user is a parent but the UI is showing
   * the kid view (a read-only preview). Kid-facing components should use
   * this to disable mutations — a parent previewing as kid must not be
   * able to request rewards, submit recovery, earn points, etc.
   */
  isPreviewingAsKid: boolean;
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
  // Initialize viewMode based on user_role in storage (default to parent)
  const [viewMode, setViewMode] = useState<ViewMode>('parent');
  const [isTransitioning, setIsTransitioning] = useState(false);
  // Track the actual logged-in role separately from the visual viewMode.
  // A parent can flip to kid view for preview, but the underlying role is
  // still 'parent' — we use that gap to compute isPreviewingAsKid.
  const [actualRole, setActualRole] = useState<string | null>(() => getStorageSync('user_role'));

  // NOTE: Initialization + listener registration happens in the single
  // effect below. We used to run a separate "initializeMode" effect here
  // that respected fgs_view_mode_preference, but a second effect (below)
  // then immediately re-set viewMode from user_role alone, stomping the
  // stored preference. They're now merged so preference is honored exactly
  // once at mount and storage-event listeners also honor it.

  const switchToKidMode = () => {
    setIsTransitioning(true);
    setTimeout(async () => {
      setViewMode('kid');
      // Don't change user_role - that reflects actual login type
      // Just update the visual mode preference
      setStorageSync('fgs_view_mode_preference', 'kid');
      document.documentElement.classList.add('kid-mode');
      document.documentElement.classList.remove('parent-mode');

      // CRITICAL: Dispatch event so DashboardRouter can react
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'fgs_view_mode_preference',
        newValue: 'kid',
        oldValue: 'parent',
        storageArea: localStorage,
        url: window.location.href
      }));

      // CRITICAL: Redirect to kid dashboard if currently on a parent-only page
      const currentPath = window.location.pathname;
      const isOnParentOnlyRoute = PARENT_ONLY_ROUTES.some(route => currentPath.startsWith(route));

      if (isOnParentOnlyRoute) {
        console.log('🔄 Switching to kid mode from parent-only route, redirecting to home');
        window.location.href = '/';
      }

      setTimeout(() => setIsTransitioning(false), 600);
    }, 100);
  };

  const switchToParentMode = () => {
    setIsTransitioning(true);
    setTimeout(async () => {
      setViewMode('parent');
      // Don't change user_role - that reflects actual login type
      // Just update the visual mode preference
      setStorageSync('fgs_view_mode_preference', 'parent');
      document.documentElement.classList.add('parent-mode');
      document.documentElement.classList.remove('kid-mode');

      // CRITICAL: Dispatch event so DashboardRouter can react
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'fgs_view_mode_preference',
        newValue: 'parent',
        oldValue: 'kid',
        storageArea: localStorage,
        url: window.location.href
      }));
      
      setTimeout(() => setIsTransitioning(false), 600);
    }, 100);
  };

  // Initialize mode class on mount AND watch for role changes.
  //
  // Resolution order (highest precedence first):
  //   1. Explicit fgs_view_mode_preference (parent flipped into kid-view).
  //   2. user_role (kid session → kid view, parent session → parent view).
  //   3. Default 'parent'.
  //
  // This is the *single* source of initialization logic — a prior version
  // had two effects and the second one ignored preference, stomping kid
  // preview back to parent view on every mount.
  useEffect(() => {
    const resolveMode = (): ViewMode => {
      const userRole = getStorageSync('user_role');
      const viewPref = getStorageSync('fgs_view_mode_preference');
      if (viewPref === 'kid' || viewPref === 'parent') return viewPref;
      return userRole === 'child' ? 'kid' : 'parent';
    };

    const userRole = getStorageSync('user_role');
    const initialMode = resolveMode();
    console.log('🎨 ViewModeProvider Init — role:', userRole, 'resolved mode:', initialMode);
    setActualRole(userRole);
    setViewMode(initialMode);
    document.documentElement.classList.add(`${initialMode}-mode`);
    document.documentElement.classList.remove(initialMode === 'kid' ? 'parent-mode' : 'kid-mode');

    // Cross-tab or same-tab storage changes: re-resolve mode honoring preference.
    const applyMode = (nextMode: ViewMode, nextRole: string | null) => {
      setActualRole(nextRole);
      setViewMode(nextMode);
      document.documentElement.classList.add(`${nextMode}-mode`);
      document.documentElement.classList.remove(nextMode === 'kid' ? 'parent-mode' : 'kid-mode');
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role' || e.key === 'fgs_view_mode_preference') {
        const nextRole = getStorageSync('user_role');
        const nextMode = resolveMode();
        console.log('🎨 ViewModeProvider - Storage changed:', { key: e.key, nextRole, nextMode });
        applyMode(nextMode, nextRole);
      }
    };

    // Same-window role change (custom event)
    const handleRoleChange = () => {
      const nextRole = getStorageSync('user_role');
      const nextMode = resolveMode();
      console.log('🎨 ViewModeProvider - Role changed (custom event):', { nextRole, nextMode });
      applyMode(nextMode, nextRole);
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

  // A parent previewing the kid experience: real role is parent but the
  // UI is showing the kid view. Used by guards and components to lock
  // mutations during preview.
  const isPreviewingAsKid = actualRole === 'parent' && viewMode === 'kid';

  return (
    <ViewModeContext.Provider
      value={{
        viewMode,
        switchToKidMode,
        switchToParentMode,
        isTransitioning,
        isPreviewingAsKid,
      }}
    >
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
      isTransitioning: false,
      isPreviewingAsKid: false,
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