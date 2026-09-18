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
}): "school" | "onboarding" | "render" {
  const { hostname, pathname, hasSchoolAccess } = opts;
  if (hasSchoolAccess && !onFamilyHost(hostname)) {
    // Already under /school — rendering is what lets the Outlet through.
    return isSchoolPath(pathname) ? "render" : "school";
  }
  return pathname === "/onboarding" ? "render" : "onboarding";
}
