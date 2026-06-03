// Per-org branding loader. PR G applies the values that PR C started saving:
//   - logo_url       → shown next to the school name in the HeroCard
//   - theme_color    → applied as a gradient end-stop on hero blocks
//   - school_motto   → tiny italic subtitle under the school name
//
// The provider is mounted inside every /school/orgs/:orgId/* route tree
// (see routes.tsx). It reads orgId from the route param, fetches once via
// getOrganization() (which is cached client-side at the apiCall layer), and
// shares the result with consumers via useOrgBranding().
//
// Consumers can use the values directly (HeroCard does this) or call
// brandedHeroStyle() to get a ready-to-spread inline style object.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useParams } from "react-router";
import { getOrganization } from "../../utils/schoolApi";

export interface OrgBranding {
  orgId: string;
  /** Public URL to a logo. Empty string when the principal hasn't set one. */
  logoUrl: string;
  /** Hex color (e.g. #0f766e) or empty when unset. */
  themeColor: string;
  /** Short italic motto (e.g. "Knowledge, character, faith") or empty. */
  motto: string;
  /** Full school name — useful for tab titles, page heads. */
  schoolName: string;
  /** Settings load state so consumers can skip flashing the default theme. */
  loading: boolean;
}

const Ctx = createContext<OrgBranding | null>(null);

export function OrgBrandingProvider({ children }: { children: ReactNode }) {
  const { orgId = "" } = useParams();
  const [branding, setBranding] = useState<OrgBranding>({
    orgId,
    logoUrl: "",
    themeColor: "",
    motto: "",
    schoolName: "",
    loading: true,
  });

  useEffect(() => {
    if (!orgId) {
      setBranding((s) => ({ ...s, loading: false }));
      return;
    }
    let cancelled = false;
    getOrganization(orgId)
      .then((o) => {
        if (cancelled) return;
        const s = (o.organization?.settings ?? {}) as Record<string, unknown>;
        setBranding({
          orgId,
          logoUrl: (s.logo_url as string | undefined) ?? "",
          themeColor: (s.theme_color as string | undefined) ?? "",
          motto: (s.school_motto as string | undefined) ?? "",
          schoolName: o.organization?.name ?? "",
          loading: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setBranding((s) => ({ ...s, loading: false }));
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  return <Ctx.Provider value={branding}>{children}</Ctx.Provider>;
}

/** Always returns a usable object — even outside a provider, you get the
 *  no-branding fallback so HeroCard can stay agnostic about mount order. */
export function useOrgBranding(): OrgBranding {
  return useContext(Ctx) ?? {
    orgId: "",
    logoUrl: "",
    themeColor: "",
    motto: "",
    schoolName: "",
    loading: false,
  };
}

/** Inline style for a hero block that overrides the slate→indigo gradient
 *  with slate→themeColor. If no theme color is set, returns an empty object
 *  so the Tailwind default applies. */
export function brandedHeroStyle(themeColor: string): React.CSSProperties {
  if (!themeColor) return {};
  // Mirror the slate-900 → indigo-950 default direction but end on the
  // school's color. The browser-validates the hex itself; if it's garbage
  // CSS just ignores the override.
  return {
    backgroundImage: `linear-gradient(to bottom right, rgb(15 23 42), rgb(15 23 42), ${themeColor})`,
  };
}
