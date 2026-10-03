// Formatting the report card shares between the OFFICE's page and the
// PARENT's portal page.
//
// 3 Oct, results morning: the office reported that none of the card
// work from 30 Sep - 2 Oct reached parents. Cause: the two surfaces are
// separate components that render the same payload, and every revision
// went into the office's page only. The portal was still heading its
// columns "1st Assessment - Oral" where the paper card said "Overall
// Learning & Participation", printing ISO dates, and showing no ruled
// table.
//
// Anything a parent and the office must read the SAME way lives here,
// so the next revision cannot land on one surface and miss the other.

/** Pakistan writes day-month-year (office, 30 Sep). Term dates arrive
 *  as YYYY-MM-DD; split the string rather than parsing, so a date can
 *  never shift a day across a timezone. */
export function fmtDayMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

/** "1st Assessment — Written" says the term twice: it already heads the
 *  whole card, so a column keeps only its paper (office, 1 Oct).
 *  Strips a leading "<term name> — " (any dash); anything else passes
 *  through untouched. A per-class column label (columnLabel) wins over
 *  this and is used as-is. */
export function paperOnly(examName: string, termName: string): string {
  if (!examName.startsWith(termName)) return examName;
  const rest = examName.slice(termName.length).replace(/^\s*[—–-]+\s*/, "").trim();
  return rest || examName;
}

/** The school's own chart reads "80% – 89%", and its bottom band reads
 *  "Below 40%" - even though a band is stored half-open as [80, 90). */
export function bandRangeLabel(b: { minPct: number; maxPct: number }): string {
  if (b.minPct <= 0) return `Below ${Math.round(b.maxPct)}%`;
  const hi = Math.round(b.maxPct) >= 100 ? 100 : Math.round(b.maxPct) - 1;
  return `${Math.round(b.minPct)}% – ${hi}%`;
}
