// Auto remarks from the overall percentage, in one pure place (25 Sep).
//
// "If the student overall is between 95% to 100% this should be the
// comment... 5% increments, with anything before 40% (fail) to have
// fail remarks" - so the class teacher's and principal's remarks
// pre-populate from a band chart the school owns, no AI, no cost.
// A remark a teacher or principal SAVES always wins over the band.
//
// The school edits its own chart (org settings key report_remark_bands);
// these defaults apply until they do.

export interface RemarkBand {
  minPct: number;
  /** Exclusive, except the top band where 100 is inclusive. */
  maxPct: number;
  classTeacher: string;
  principal: string;
}

export const DEFAULT_REMARK_BANDS: RemarkBand[] = [
  { minPct: 95, maxPct: 100, classTeacher: "Mashallah, an outstanding result. Consistently excellent work in every subject - keep this beautiful habit of effort and dua.", principal: "Outstanding. The school is proud of this result - may Allah keep you at the top, Ameen." },
  { minPct: 90, maxPct: 95, classTeacher: "Mashallah, an excellent result. Works with focus and sets a fine example for the class.", principal: "Excellent performance. Keep it up - we expect the same brilliance next term, Inshallah." },
  { minPct: 85, maxPct: 90, classTeacher: "A very good result. Hardworking and attentive - a little more polish will place them among the very best.", principal: "Very good. Stay consistent and the top positions are within reach, Inshallah." },
  { minPct: 80, maxPct: 85, classTeacher: "A very good effort this term. Understands the lessons well; regular revision will lift the result further.", principal: "Very good result. Keep the momentum going next term." },
  { minPct: 75, maxPct: 80, classTeacher: "A good result. Participates well in class - steadier written practice will raise the marks.", principal: "Good performance. With a little more effort, even better is possible, Inshallah." },
  { minPct: 70, maxPct: 75, classTeacher: "A good effort. Grasps the concepts; daily revision at home will make the result stronger.", principal: "Good. We look forward to an improved result next term." },
  { minPct: 65, maxPct: 70, classTeacher: "A fair result. Capable of much more - regular homework and revision are the key.", principal: "Satisfactory. More consistent study will show clear improvement, Inshallah." },
  { minPct: 60, maxPct: 65, classTeacher: "A fair result with room to grow. Needs steadier attention in class and daily practice at home.", principal: "Satisfactory. Please encourage daily revision at home." },
  { minPct: 55, maxPct: 60, classTeacher: "An average result. Understands when guided - needs regular practice and help with weaker subjects.", principal: "Average performance. Focused effort on the weaker subjects will help, Inshallah." },
  { minPct: 50, maxPct: 55, classTeacher: "An average result. Please ensure daily homework and revision - the ability is there.", principal: "Average. We request the parents' support with daily study at home." },
  { minPct: 45, maxPct: 50, classTeacher: "A below-average result. Needs serious, regular effort - please work closely with the class teacher.", principal: "Below average. Parents are requested to meet the class teacher to plan support." },
  { minPct: 40, maxPct: 45, classTeacher: "A weak result this term. Extra attention at school and home is needed - we will support every step.", principal: "Needs improvement. Please meet the class teacher so we can plan extra support together." },
  { minPct: 0, maxPct: 40, classTeacher: "Did not meet the pass mark this term. With regular attendance, completed homework and our support, improvement is fully possible, Inshallah.", principal: "Result below the pass mark. Parents are requested to meet the school so we can plan the way forward together." },
];

/** Settings rows are data from the org - keep only well-formed bands. */
export function normalizeRemarkBands(raw: unknown): RemarkBand[] | null {
  if (!Array.isArray(raw)) return null;
  const out: RemarkBand[] = [];
  for (const r of raw as any[]) {
    const minPct = Number(r?.minPct);
    const maxPct = Number(r?.maxPct);
    if (!Number.isFinite(minPct) || !Number.isFinite(maxPct) || maxPct <= minPct) continue;
    out.push({
      minPct, maxPct,
      classTeacher: typeof r?.classTeacher === "string" ? r.classTeacher : "",
      principal: typeof r?.principal === "string" ? r.principal : "",
    });
  }
  return out.length > 0 ? out : null;
}

/** The band a percentage falls in - top band inclusive at 100, the
 *  rest [min, max). Null percentage (no marks) gets NO auto remark:
 *  a template sentence about performance that never happened would
 *  mislead (the blank-card children taught us that). */
export function pickRemarkBand(bands: RemarkBand[], pct: number | null): RemarkBand | null {
  if (pct === null || !Number.isFinite(pct)) return null;
  for (const b of bands) {
    if (b.maxPct >= 100 && pct >= b.minPct && pct <= 100) return b;
    if (pct >= b.minPct && pct < b.maxPct) return b;
  }
  return null;
}
