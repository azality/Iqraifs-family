import { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import { KidDashboard } from './KidDashboard';

/**
 * DashboardRouter - Routes to the appropriate dashboard based on user role AND view mode
 * 
 * - Kids (logged in via PIN) → KidDashboard (Unified adventure experience)
 * - Parents (logged in via email) in Parent Mode → Dashboard (Analytics and controls)
 * - Parents in Kid View Mode → KidDashboard (Preview of kid experience)
 * 
 * Note: We check localStorage directly instead of using useAuth() because
 * this component is used in routes before the AuthProvider is available.
 */
export function DashboardRouter() {
  const [userRole, setUserRole] = useState(() => {
    // Get initial role from localStorage
    const role = await getStorage('user_role');
    console.log('🔍 DashboardRouter initial role:', role);
    return role;
  });
  
  const [viewMode, setViewMode] = useState(() => {
    // Get initial view mode preference
    const mode = await getStorage('fgs_view_mode_preference');
    console.log('🔍 DashboardRouter initial view mode:', mode);
    return mode;
  });

  useEffect(() => {
    // Listen for role changes
    const handleRoleChange = () => {
      const newRole = await getStorage('user_role');
      console.log('🔄 DashboardRouter role change detected:', { old: userRole, new: newRole });
      setUserRole(newRole);
    };
    
    // Listen for view mode changes
    const handleViewModeChange = () => {
      const newMode = await getStorage('fgs_view_mode_preference');
      console.log('🔄 DashboardRouter view mode change detected:', { old: viewMode, new: newMode });
      setViewMode(newMode);
    };

    // Listen for custom roleChanged events
    window.addEventListener('roleChanged', handleRoleChange);
    
    // Listen for storage events (from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role') {
        console.log('🔄 DashboardRouter storage change detected:', { old: e.oldValue, new: e.newValue });
        setUserRole(e.newValue);
      }
      if (e.key === 'fgs_view_mode_preference') {
        console.log('🔄 DashboardRouter view mode storage change:', { old: e.oldValue, new: e.newValue });
        setViewMode(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('roleChanged', handleRoleChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [userRole, viewMode]); // Add both to dependencies so we can log old values

  console.log('🎯 DashboardRouter rendering with role:', userRole, 'viewMode:', viewMode);

  // Show KidDashboard for:
  // 1. Children (logged in via PIN) - actual kid experience
  // 2. Parents in "Kid View" mode - preview of kid experience
  if (userRole === 'child' || viewMode === 'kid') {
    console.log('✅ DashboardRouter: Showing KidDashboard', { reason: userRole === 'child' ? 'kid login' : 'parent kid view' });
    return <KidDashboard />;
  }

  // Show regular Dashboard for parents (default)
  console.log('✅ DashboardRouter: Showing Parent Dashboard');
  return <Dashboard />;
}