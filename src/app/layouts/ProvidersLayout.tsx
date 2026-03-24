import { Outlet } from 'react-router';
import { ReactNode } from 'react';
import { FamilyProvider } from '../contexts/FamilyContext';
import { AuthProvider } from '../contexts/AuthContext';
import { ViewModeProvider, ModeTransitionOverlay } from '../contexts/ViewModeContext';

/**
 * ProvidersLayout wraps routes with all necessary context providers
 * This ensures Auth, Family, and ViewMode contexts are available to all child routes
 */
export function ProvidersLayout({ children }: { children?: ReactNode }) {
  console.log('🔧 ProvidersLayout rendering, has children:', !!children);
  
  return (
    <AuthProvider>
      <FamilyProvider>
        <ViewModeProvider>
          {/* Render children if provided (for direct wrapping), otherwise use Outlet for nested routes */}
          {children || <Outlet />}
          <ModeTransitionOverlay />
        </ViewModeProvider>
      </FamilyProvider>
    </AuthProvider>
  );
}