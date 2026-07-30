// NoAccessRedirect — permission-gate redirect with an explanation.
//
// ~30 school pages used to `return <Navigate to="/school" replace />` when
// the viewer lacked the role/permission: the user tapped a link and was
// silently teleported to the dashboard with zero feedback (trust-pass
// audit, "silent bounces"). This drop-in replacement fires a one-line
// toast before redirecting so the user knows WHY they moved and what to
// do about it.
//
// Use it only for permission denials. Redirects that mean "no org
// selected" or "record not found" should keep plain <Navigate/>.

import { useEffect } from "react";
import { Navigate } from "react-router";
import { toast } from "sonner";

export interface NoAccessRedirectProps {
  /** Where to send the user. Defaults to the school workspace root. */
  to?: string;
  /** Override the toast copy for context-specific denials. */
  message?: string;
}

export function NoAccessRedirect({
  to = "/school",
  message = "You don't have access to that page. Ask your school's principal if you need it.",
}: NoAccessRedirectProps) {
  useEffect(() => {
    // id dedupes StrictMode double-mounts and rapid repeat denials.
    toast.error(message, { id: "no-access-redirect" });
  }, [message]);
  return <Navigate to={to} replace />;
}
