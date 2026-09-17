// PIN-auth context for the Student/Parent portal. Isolated from family auth.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  clearPinSession,
  getPinToken,
  getPortalMe,
  pinClaim,
  pinLogin,
  setPinToken,
  type PinClaimBody,
  type PinLoginBody,
  type PortalMe,
} from "../../utils/schoolPortalApi";

interface PinAuthContextValue {
  subject: PortalMe | null;
  loading: boolean;
  login: (body: PinLoginBody) => Promise<PortalMe>;
  claim: (body: PinClaimBody) => Promise<PortalMe>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const PinAuthContext = createContext<PinAuthContextValue | undefined>(undefined);

export function PinAuthProvider({ children }: { children: ReactNode }) {
  const [subject, setSubject] = useState<PortalMe | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refresh = useCallback(async () => {
    if (!getPinToken()) {
      setSubject(null);
      setLoading(false);
      return;
    }
    try {
      const me = await getPortalMe();
      setSubject(me);
    } catch {
      clearPinSession();
      setSubject(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (body: PinLoginBody): Promise<PortalMe> => {
    const res = await pinLogin(body);
    // Remember the school slug the user typed/arrived with so logout can
    // return to /:slug even if /pin-me's orgSlug is unavailable.
    try {
      window.localStorage.setItem("fgs_portal_slug", String(body.orgIdentifier ?? ""));
    } catch { /* storage unavailable — non-fatal */ }
    setPinToken(res.token, {
      subjectType: res.subjectType,
      subjectId: res.subjectId,
      orgId: res.orgId,
    });
    const me = await getPortalMe();
    setSubject(me);
    setLoading(false);
    return me;
  }, []);

  // First-time claim (phone + child GR + chosen PIN) — same post-login
  // bookkeeping as login(); the server mints an identical session token.
  const claim = useCallback(async (body: PinClaimBody): Promise<PortalMe> => {
    const res = await pinClaim(body);
    try {
      window.localStorage.setItem("fgs_portal_slug", String(body.orgIdentifier ?? ""));
    } catch { /* storage unavailable — non-fatal */ }
    setPinToken(res.token, {
      subjectType: res.subjectType,
      subjectId: res.subjectId,
      orgId: res.orgId,
    });
    const me = await getPortalMe();
    setSubject(me);
    setLoading(false);
    return me;
  }, []);

  const logout = useCallback(() => {
    clearPinSession();
    setSubject(null);
  }, []);

  return (
    <PinAuthContext.Provider value={{ subject, loading, login, claim, logout, refresh }}>
      {children}
    </PinAuthContext.Provider>
  );
}

export function usePinAuth(): PinAuthContextValue {
  const ctx = useContext(PinAuthContext);
  if (!ctx) throw new Error("usePinAuth must be used within PinAuthProvider");
  return ctx;
}
