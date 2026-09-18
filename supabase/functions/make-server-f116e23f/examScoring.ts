// Totting up an exam paper, and naming the result.
//
// Pure — no database — so the arithmetic a child's result rests on can be
// tested directly (examScoring_test.ts).

export interface Component {
  id: string;
  name: string;
  groupLabel: string | null;
  maxMarks: number;
  sortOrder: number;
}

export interface Band {
  letter: string;
  minPct: number;
  maxPct: number;
  remark: string | null;
}

/** One child's marks against one paper. */
export interface Totals {
  /** Marks obtained across every component that has been marked. */
  obtained: number;
  /** The paper's full marks — every component, marked or not. */
  max: number;
  /** Percentage of the full paper, rounded to one decimal. Null until
   *  every component has a mark: a part-marked paper has no meaningful
   *  percentage, and showing one would put a راسب beside a child whose
   *  examiner simply has not finished. */
  pct: number | null;
  /** How many components still have no mark. */
  unmarked: number;
  /** Subtotals for the braced groups on the slip, in slip order. */
  groups: Array<{ label: string; obtained: number; max: number }>;
}

export function totalsFor(
  components: Component[],
  scores: Map<string, number | null>,
): Totals {
  const ordered = [...components].sort((a, b) => a.sortOrder - b.sortOrder);
  let obtained = 0;
  let max = 0;
  let unmarked = 0;
  const groups: Array<{ label: string; obtained: number; max: number }> = [];

  for (const c of ordered) {
    const got = scores.get(c.id);
    max += c.maxMarks;
    if (got === null || got === undefined) unmarked++;
    else obtained += got;

    if (c.groupLabel) {
      const g = groups.find((x) => x.label === c.groupLabel);
      const add = { obtained: got ?? 0, max: c.maxMarks };
      if (g) { g.obtained += add.obtained; g.max += add.max; }
      else groups.push({ label: c.groupLabel, ...add });
    }
  }

  const pct = unmarked > 0 || max === 0
    ? null
    : Math.round((obtained / max) * 1000) / 10;
  return { obtained, max, pct, unmarked, groups };
}

/** The band a percentage falls in, or null when it falls in none.
 *
 *  Bands are the school's own (ممتاز 80-100, جید جدا 65-79, جید 50-64,
 *  مقبول 40-49, راسب below 40). Matched on the highest minimum at or
 *  below the mark, so a scale with a gap in it still names something
 *  rather than silently returning nothing. */
export function bandFor(bands: Band[], pct: number | null): Band | null {
  if (pct === null) return null;
  const sorted = [...bands].sort((a, b) => b.minPct - a.minPct);
  for (const b of sorted) {
    if (pct >= b.minPct && pct <= b.maxPct) return b;
  }
  for (const b of sorted) {
    if (pct >= b.minPct) return b;
  }
  return null;
}

/** Is a mark a legal entry against this component?
 *
 *  Rejects more than the paper allows — a 22 against a question worth 20
 *  is a slip of the pen, and it would quietly inflate a child's میزان. */
export function markIsValid(component: Component, mark: number | null): boolean {
  if (mark === null) return true;
  if (!Number.isFinite(mark) || mark < 0) return false;
  return mark <= component.maxMarks;
}
