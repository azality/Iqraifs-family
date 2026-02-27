import { Outlet } from 'react-router';
import { ReactNode } from 'react';

/**
 * ProvidersLayout now just passes through to children/Outlet
 * All providers (Auth, Family, ViewMode) are now in App.tsx to ensure they're available everywhere
 */
export function ProvidersLayout({ children }: { children?: ReactNode }) {
  return (
    <>
      {/* Render children if provided (for direct wrapping), otherwise use Outlet for nested routes */}
      {children || <Outlet />}
    </>
  );
}