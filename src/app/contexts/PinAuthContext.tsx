// PIN-auth context for the Student/Parent portal. Isolated from family auth.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import {
  clearPinSession,
  getPinToken,
  getPortalMe,
  pinLogin,
  setPinToken,
  type PinLoginBody,
  type PortalMe,
} from "../../utils/schoolPortalApi";

interface PinAuthContextValue {
  subject: PortalMe | null;
  loading: boolean;
  login: (body: PinLoginBody) => Promise<PortalMe>;
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
    <PinAuthContext.Provider value={{ subject, loading, login, logout, refresh }}>
      {children}
    </PinAuthContext.Provider>
  );
}

export function usePinAuth(): PinAuthContextValue {
  const ctx = useContext(PinAuthContext);
  if (!ctx) throw new Error("usePinAuth must be used within PinAuthProvider");
  return ctx;
}
