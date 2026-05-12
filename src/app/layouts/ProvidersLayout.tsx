import { Outlet } from 'react-router';
import { ReactNode } from 'react';
import { FamilyProvider } from '../contexts/FamilyContext';
import { AuthProvider } from '../contexts/AuthContext';
import { ViewModeProvider, ModeTransitionOverlay } from '../contexts/ViewModeContext';
import { WorkspaceProvider } from '../contexts/WorkspaceContext';

/**
 * ProvidersLayout wraps routes with all necessary context providers
 * This ensures Auth, Family, ViewMode and Workspace contexts are available
 * to all child routes.
 *
 * Provider order matters:
 *   AuthProvider gives us userId / accessToken
 *   FamilyProvider depends on Auth (for the parent JWT)
 *   ViewModeProvider tracks parent/kid mode (kid preview)
 *   WorkspaceProvider tracks family/school workspace — depends on Auth
 *     (it calls /school/me with the user's JWT). Sits outside FamilyProvider
 *     so school-only pages don't pay the cost of family data.
 */
export function ProvidersLayout({ children }: { children?: ReactNode }) {
  console.log('🔧 ProvidersLayout rendering, has children:', !!children);

  return (
    <AuthProvider>
      <FamilyProvider>
        <ViewModeProvider>
          <WorkspaceProvider>
            {/* Render children if provided (for direct wrapping), otherwise use Outlet for nested routes */}
            {children || <Outlet />}
            <ModeTransitionOverlay />
          </WorkspaceProvider>
        </ViewModeProvider>
      </FamilyProvider>
    </AuthProvider>
  );
}