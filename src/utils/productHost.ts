// Which product a hostname belongs to.
//
// ILM Network (schools) and the family app share one bundle but are two
// products. The Cloudflare worker keeps them apart on full page loads,
// but it never sees a client-side navigation — the router can move from
// /rewards to /school/... without a single request leaving the browser.
// So the rule is enforced here too, and the two implementations are
// deliberately the same shape.

export const FAMILY_HOST = "family.theilmnetwork.com";

/** Is this hostname the family product's own home? */
export function onFamilyHost(hostname: string): boolean {
  return hostname.toLowerCase().split(":")[0] === FAMILY_HOST;
}

/** First path segments that belong to the school product. Mirrors
 *  SCHOOL_SEGMENTS in worker/index.js.
 *
 *  "parent-login" is deliberately absent: it is the FAMILY parent's
 *  login, an alias of /login. School parents sign in at /<slug>/login
 *  or /school-login. */
const SCHOOL_SEGMENTS = new Set([
  "school", "school-login", "school-portal",
]);

/** Does this path render a school surface? */
export function isSchoolPath(pathname: string): boolean {
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  return SCHOOL_SEGMENTS.has(seg);
}

/** Should this path be refused on this host? The family app has no
 *  school pages, so the answer is to go home — on the family's OWN
 *  hostname. Bouncing to the platform host would take someone using the
 *  family product off their product's domain, which is the separation
 *  failing in the other direction. */
export function schoolPathOnFamilyHost(hostname: string, pathname: string): boolean {
  return onFamilyHost(hostname) && isSchoolPath(pathname);
}

/** Where a signed-in user with no family belongs.
 *
 *  Extracted from RequireFamily because the two rules interact badly:
 *  a school user with no family was sent to /school, the host guard sent
 *  /school back to "/", and "/" sent them to /school again — an infinite
 *  redirect on family.theilmnetwork.com, seen live 18 Sep.
 *
 *  On the family host the answer must never be a school route. The
 *  family product's own answer for someone without a family is to make
 *  one. */
export function noFamilyDestination(opts: {
  hostname: string;
  pathname: string;
  hasSchoolAccess: boolean;
  /** A school's own custom domain resolved this slug at bootstrap
   *  (iqraifs.com -> "iqra-ifs"). On such a host the family product
   *  does not exist, so a user with no family NEVER belongs on family
   *  onboarding - whatever their roles say (a principal clicking a
   *  broken staff link landed on "Set Up Your Family", 23 Sep). */
  schoolSlug?: string | null;
}): "school" | "onboarding" | "render" {
  const { hostname, pathname, hasSchoolAccess, schoolSlug } = opts;
  if (hasSchoolAccess && !onFamilyHost(hostname)) {
    // Already under /school — rendering is what lets the Outlet through.
    return isSchoolPath(pathname) ? "render" : "school";
  }
  if (schoolSlug) return isSchoolPath(pathname) ? "render" : "school";
  return pathname === "/onboarding" ? "render" : "onboarding";
}

/** Family-SETUP flows (make a family, join one, connect a parent) have
 *  no business on a school's own domain — the mirror of
 *  schoolPathOnFamilyHost, same worker-can't-see-client-navigation
 *  reasoning. Everything else at "/" is handled by RootHostGate. */
// /parent/connect stays UNGATED: its invite links go out over SMS and
// WhatsApp and may be opened on any host - refusing it would strand a
// brand-new parent holding a real invite.
const FAMILY_SETUP_PREFIXES = ["/onboarding", "/join-pending"];

/** Is this one of the family-setup paths, on any host? Exported on its
 *  own because main.tsx must know BEFORE the router exists: the
 *  host->slug lookup normally runs on the bare root only, and a deep
 *  /onboarding load needs it too or the guard has no slug to read. */
export function isFamilySetupPath(pathname: string): boolean {
  return FAMILY_SETUP_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export function familySetupOnSchoolHost(
  schoolSlug: string | null | undefined,
  pathname: string,
): boolean {
  if (!schoolSlug) return false;
  return isFamilySetupPath(pathname);
}
