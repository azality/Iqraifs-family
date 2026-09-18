// Which menu entry is "you are here".
//
// An entry matches its own page and every page beneath it, so a marks
// sheet (/admin/assessment/exams/…/marks) still lights up Assessment even
// though it has no menu entry of its own. That rule alone lit up TWO
// entries once a nested page got its own entry: on Marking progress
// (/admin/assessment/marking-progress) both it and Assessment matched
// (18 Sep). So of all the entries that match, only the most specific one —
// the longest destination — is the one highlighted.

/** Does this page sit at or beneath this menu destination? */
export function isActive(pathname: string, to: string): boolean {
  // Strip ?query / #hash off both sides so query params (e.g.
  // ?action=time-off) don't break the match.
  const cleanPath = pathname.split(/[?#]/)[0];
  const cleanTo = to.split(/[?#]/)[0];
  // The org root (Dashboard) and the admin root are prefixes of every
  // other page — they must match exactly, or they would always light up.
  const isRootLike = /^\/school\/orgs\/[^/]+(\/admin)?$/.test(cleanTo);
  if (isRootLike) return cleanPath === cleanTo;
  return cleanPath === cleanTo || cleanPath.startsWith(cleanTo + "/");
}

/** Of every menu destination, the ONE that best describes this page — the
 *  longest that matches — or null when none does. */
export function bestActiveTo(pathname: string, destinations: string[]): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const to of destinations) {
    if (!isActive(pathname, to)) continue;
    const len = to.split(/[?#]/)[0].length;
    if (len > bestLen) { best = to; bestLen = len; }
  }
  return best;
}
