// Reserved URL slugs that can never be used as a school's custom URL.
// Mirrored on the server (see PATCH /school/organizations/:orgId/slug)
// so a principal can't grab a slug that would shadow a system route.
//
// Edit this list AND the server-side copy together when adding new
// top-level routes.

export const RESERVED_SLUGS = new Set<string>([
  // Family / parent-side
  "welcome",
  "login",
  "signup",
  "parent-login",
  "parent-signup",
  "parent",
  "kid-login",
  "kid-login-new",
  "kid",
  "onboarding",
  "join-pending",
  "diagnostic",
  // School-side
  "school",
  "school-login",
  "school-portal",
  // Generic
  "api",
  "auth",
  "admin",
  "settings",
  "logout",
  "about",
  "contact",
  "help",
  "support",
  "terms",
  "privacy",
  "legal",
  "static",
  "assets",
  "public",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  "sw.js",
  "_app",
  "_next",
]);

/** True when this string is shaped like a school slug AND not reserved. */
export function isAllowableSlug(s: string): boolean {
  if (!s) return false;
  // Lowercase letters, digits, dashes only. 3..40 chars. No leading/
  // trailing dash, no consecutive dashes.
  if (!/^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$/.test(s)) return false;
  if (s.includes("--")) return false;
  return !RESERVED_SLUGS.has(s);
}
