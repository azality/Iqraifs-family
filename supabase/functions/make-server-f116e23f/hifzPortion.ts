// Turning a child's logged hearings into an exam portion.
//
// Pure — no database, no Hono — so the rule the whole Hifz exam rests on
// can be tested directly (hifzPortion_test.ts).
//
// The school's question, 18 Sep: "the system will only generate from
// wherever we started recording in the LMS. But our children memorise
// backwards — Para 30 first, then 29, 28, 27 down to 19. Surely it will
// just say Para 1, 2, 3, 4?"
//
// It will not, and never could: nothing here counts upwards from Para 1.
// It collects the set of paras the child was ACTUALLY heard on and
// collapses that set into ranges, so a child taught backwards reads
// "Para 19–30" and one who has jumped around reads "Para 1, 18".
// What the school is right about is the OTHER half — we only hold
// hearings since 3 Sep 2026 — and that is what the per-child baseline
// (hifz_baseline_paras) exists to supply, entered once.

import { juzOfPosition, formatParaRanges } from "./quranParas.ts";

/** Rows a proposal may be built from. A missed marker is an absence, not
 *  a portion — it must never widen a child's syllabus. */
export const PORTION_KINDS = new Set(["sabaq", "memorized", "revised", "tested"]);
export const NAZRA_KINDS = new Set(["nazra", "nazra_revision"]);

export interface ProgressRow {
  student_id: string;
  kind: string;
  surah_number: number | null;
  ayah_from: number | null;
  ayah_to: number | null;
  juz_number: number | null;
  qaida_lesson: number | null;
  missed: boolean | null;
}

/** A row carrying no position at all.
 *
 *  The logging form opens on Al-Fatiha 1:1, and in the first week of use
 *  teachers saved hearings without moving it: 87 rows across 36 children
 *  sit at exactly surah 1, ayah 1 to ayah 1, tapering off as people
 *  learned the screen. Counted as a portion they put a phantom "Para 1"
 *  in front of a third of the Hifz roll — "Para 1, 18" for a child who
 *  is on Para 18 — and the teacher would have had to correct every one.
 *
 *  Deliberately narrow, so it cannot swallow anything real:
 *   · a genuine Al-Fatiha lesson runs 1–7, not 1–1;
 *   · a genuine Para 1 logged in para mode carries juz_number, and is
 *     matched before this ever runs.
 *  The row itself is untouched — it still shows in the diary and the
 *  history. It just says nothing about how much a child has memorised. */
export function isEmptyPosition(r: ProgressRow): boolean {
  return r.surah_number === 1 && r.ayah_from === 1 && r.ayah_to === 1;
}

/** Which paras a set of rows covers. Para-mode rows carry juz_number
 *  directly; surah/ayah rows are mapped through the Indo-Pak boundaries. */
export function parasCovered(rows: ProgressRow[]): number[] {
  const paras = new Set<number>();
  for (const r of rows) {
    if (r.missed) continue;
    if (r.juz_number && r.juz_number >= 1 && r.juz_number <= 30) {
      paras.add(r.juz_number);
      continue;
    }
    if (!r.surah_number || !r.ayah_from) continue;
    if (isEmptyPosition(r)) continue;
    const start = juzOfPosition(r.surah_number, r.ayah_from);
    const end = juzOfPosition(r.surah_number, r.ayah_to ?? r.ayah_from);
    for (let p = Math.min(start, end); p <= Math.max(start, end); p++) paras.add(p);
  }
  return [...paras];
}

/** The proposed syllabus line for one child.
 *
 *  Two sources, merged: what the child has been HEARD on since logging
 *  began (3 Sep 2026), plus whatever the office recorded as already
 *  memorized BEFORE that. Without the baseline the first exam's
 *  proposals understate nearly everyone, because we only hold a few
 *  weeks of hearings.
 *
 *  Empty string when we have neither — the teacher types it, and we
 *  never invent a portion a child was not actually heard on. */
export function proposePortion(
  track: string | null,
  rows: ProgressRow[],
  baselineParas: number[] = [],
): string {
  const baseline = baselineParas.filter((p) => p >= 1 && p <= 30);
  if (track === "qaida") {
    // Qaida is counted in takhtis, not paras — the baseline (a para set)
    // has nothing to say about it.
    const lessons = rows
      .filter((r) => !r.missed && r.kind === "qaida" && r.qaida_lesson)
      .map((r) => r.qaida_lesson as number);
    if (lessons.length === 0) return "";
    return `Qaida — takhti 1–${Math.max(...lessons)}`;
  }
  if (track === "nazra") {
    const paras = parasCovered(rows.filter((r) => NAZRA_KINDS.has(r.kind)));
    // A reader who has also been heard on sabaq (mid-move to hifz) still
    // has their reading counted — fall back to everything rather than
    // proposing a blank line.
    const use = paras.length > 0 ? paras : parasCovered(rows);
    return formatParaRanges([...use, ...baseline]);
  }
  // hifz / revision / unknown: what they have memorized.
  const paras = parasCovered(rows.filter((r) => PORTION_KINDS.has(r.kind)));
  return formatParaRanges([...paras, ...baseline]);
}
