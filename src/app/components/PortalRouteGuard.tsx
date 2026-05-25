// Route guard for the PIN-auth portal. Renders nothing until the PIN context
// has resolved; sends unauthenticated users to /school-login; forces a PIN
// change when the backend flags mustChange === true.

import { Navigate, useLocation } from "react-router";
import type { ReactNode } from "react";
import { usePinAuth } from "../contexts/PinAuthContext";

export function PortalRouteGuard({ children }: { children: ReactNode }) {
  const { subject, loading } = usePinAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!subject) {
    return <Navigate to="/school-login" replace />;
  }

  if (subject.mustChange && location.pathname !== "/school-portal/change-pin") {
    return <Navigate to="/school-portal/change-pin" replace />;
  }

  return <>{children}</>;
}
