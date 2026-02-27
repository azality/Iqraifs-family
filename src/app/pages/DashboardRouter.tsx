import { useState, useEffect } from 'react';
import { Dashboard } from './Dashboard';
import { KidDashboard } from './KidDashboard';

/**
 * DashboardRouter - Routes to the appropriate dashboard based on user role
 * 
 * - Kids (logged in via PIN) → KidDashboard (Unified adventure experience)
 * - Parents (logged in via email) → Dashboard (Analytics and controls)
 * 
 * Note: We check localStorage directly instead of using useAuth() because
 * this component is used in routes before the AuthProvider is available.
 */
export function DashboardRouter() {
  const [userRole, setUserRole] = useState(() => {
    // Get initial role from localStorage
    const role = localStorage.getItem('user_role');
    console.log('🔍 DashboardRouter initial role:', role);
    return role;
  });

  useEffect(() => {
    // Listen for role changes
    const handleRoleChange = () => {
      const newRole = localStorage.getItem('user_role');
      console.log('🔄 DashboardRouter role change detected:', { old: userRole, new: newRole });
      setUserRole(newRole);
    };

    // Listen for custom roleChanged events
    window.addEventListener('roleChanged', handleRoleChange);
    
    // Listen for storage events (from other tabs)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'user_role') {
        console.log('🔄 DashboardRouter storage change detected:', { old: e.oldValue, new: e.newValue });
        setUserRole(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('roleChanged', handleRoleChange);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [userRole]); // Add userRole to dependencies so we can log old value

  console.log('🎯 DashboardRouter rendering with role:', userRole);

  // Show KidDashboard for children (unified experience for both kid login and parent "kid view")
  if (userRole === 'child') {
    console.log('✅ DashboardRouter: Showing KidDashboard');
    return <KidDashboard />;
  }

  // Show regular Dashboard for parents (default)
  console.log('✅ DashboardRouter: Showing Parent Dashboard');
  return <Dashboard />;
}