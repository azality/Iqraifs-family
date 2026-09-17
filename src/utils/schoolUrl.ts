// Where a school's public front door actually lives.
//
// Staff screens show a school its own URL — Org Settings, the public-site
// editor, the login not-found message, reminder links. Those all used to
// print "iqraifs.com/<slug>", the first client's domain, which would have
// shown school #2 someone else's address inside their own settings.
//
// Two shapes, because a school's own domain IS that school:
//   with a custom domain : https://theirschool.com          (root = site)
//   without one          : https://app.theilmnetwork.com/their-slug
//
// The fallback is the ORIGIN THIS APP IS SERVED FROM rather than a
// constant, so it stays correct on every host the platform runs on —
// including localhost and any future one — without another edit here.

export interface SchoolUrlOrg {
  slug: string;
  /** Bare domain, no scheme or www. Null when the school has none. */
  customDomain?: string | null;
}

function origin(): string {
  try {
    return window.location.origin;
  } catch {
    return "";
  }
}

/** Full URL of the school's public site, e.g. for copying or linking. */
export function schoolSiteUrl(org: SchoolUrlOrg): string {
  if (org.customDomain) return `https://${org.customDomain}`;
  return `${origin()}/${org.slug}`;
}

/** The same thing without the scheme — for showing inside a sentence or
 *  next to an input, where "https://" is noise. */
export function schoolSiteLabel(org: SchoolUrlOrg): string {
  return schoolSiteUrl(org).replace(/^https?:\/\//, "");
}

/** The part BEFORE the slug, for an input that edits the slug itself:
 *  "app.theilmnetwork.com/" — or "" when the school has its own domain,
 *  because then the slug is not in their public URL at all. */
export function schoolSitePrefix(org: Pick<SchoolUrlOrg, "customDomain">): string {
  if (org.customDomain) return "";
  return `${origin().replace(/^https?:\/\//, "")}/`;
}

/** Origin to build deep links from (reminder messages, share links).
 *  A school with its own domain gets links on it; everyone else gets
 *  whichever host the sender is using. */
export function schoolOrigin(org: Pick<SchoolUrlOrg, "customDomain">): string {
  return org.customDomain ? `https://${org.customDomain}` : origin();
}
