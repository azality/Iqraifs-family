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
