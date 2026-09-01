// Pure decision logic for TermSwitchNudge — dependency-free so it can
// be unit-tested without the Vite alias graph (schoolApi pulls
// /utils/supabase/info.tsx, which only resolves inside Vite).

export interface TermLike {
  id: string;
  name: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  isCurrent: boolean;
  archivedAt: string | null;
}

export type TermNudge<T extends TermLike = TermLike> =
  | { kind: "switch"; endedTerm: T; nextTerm: T }
  | { kind: "define-next"; endedTerm: T }
  | { kind: "set-current"; containingTerm: T }
  | null;

// `today` is YYYY-MM-DD in the viewer's local calendar (school staff
// are in the school's timezone). String compare is safe on ISO dates.
export function resolveTermNudge<T extends TermLike>(terms: T[], today: string): TermNudge<T> {
  const active = terms.filter((t) => !t.archivedAt);
  if (active.length === 0) return null;
  const current = active.find((t) => t.isCurrent) ?? null;
  const others = active.filter((t) => !t.isCurrent);
  const containing = others
    .filter((t) => t.startDate <= today && today <= t.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;

  if (!current) {
    // No current term set at all — only nag if a term actually covers today.
    return containing ? { kind: "set-current", containingTerm: containing } : null;
  }
  if (today <= current.endDate) return null; // still running — quiet.

  const upcoming = others
    .filter((t) => t.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0] ?? null;
  const next = containing ?? upcoming;
  return next
    ? { kind: "switch", endedTerm: current, nextTerm: next }
    : { kind: "define-next", endedTerm: current };
}
