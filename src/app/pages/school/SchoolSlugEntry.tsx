// SchoolSlugEntry — decides what /:orgSlug renders.
//
// If the school has switched on its public marketing site, show that.
// Otherwise fall through to the existing unified login flow.
// The dedicated login URL /:orgSlug/login always renders login regardless.

import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { getPublicSite } from "../../../utils/schoolApi";
import { SchoolPublicSite } from "./SchoolPublicSite";
import { SchoolUnifiedLogin } from "./SchoolUnifiedLogin";

/** `slug` overrides the URL param — used when a school's OWN domain
 *  serves their site at "/", where there is no :orgSlug to read. */
export function SchoolSlugEntry({ slug }: { slug?: string } = {}) {
  const { orgSlug: paramSlug = "" } = useParams<{ orgSlug: string }>();
  const orgSlug = slug ?? paramSlug;
  const [decision, setDecision] = useState<"loading" | "public" | "login">("loading");

  useEffect(() => {
    if (!orgSlug) { setDecision("login"); return; }
    let cancelled = false;
    (async () => {
      // A cold edge function or flaky network can fail the first fetch;
      // falling straight back to login strands visitors of an enabled
      // public site on the login page. Retry before giving up.
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const s = await getPublicSite(orgSlug);
          if (!cancelled) setDecision(s.enabled ? "public" : "login");
          return;
        } catch {
          if (attempt < 2) await new Promise((r) => setTimeout(r, 700 * (attempt + 1)));
        }
      }
      if (!cancelled) setDecision("login");
    })();
    return () => { cancelled = true; };
  }, [orgSlug]);

  if (decision === "loading") {
    // Defer to login if the public-site lookup is taking long — login
    // is the safer landing state and renders almost instantly.
    return null;
  }
  // Pass the slug on: at "/" there is no route param for the children
  // to read, so without this the public site renders forever-loading.
  return decision === "public"
    ? <SchoolPublicSite slug={orgSlug} />
    : <SchoolUnifiedLogin slug={orgSlug} />;
}

export default SchoolSlugEntry;
