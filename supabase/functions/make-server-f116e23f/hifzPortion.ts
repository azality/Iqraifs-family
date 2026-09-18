// Turning a child's logged hearings into an exam portion.
//
// Pure — no database, no Hono — so the rule the whole Hifz exam rests on
// can be tested directly (hifzPortion_test.ts).
//
// The road runs BACKWARDS here: Para 30, then 29, 28 … down to 1, and
// completing Para 1 is khatam. So a child heard on Para 19 today
// memorised 30, 29, 28 … 19 to get there, and the exam portion is
// Para 19–30 — twelve paras — not the single para we happen to have
// logged since 3 Sep 2026.
//
// Nothing here counts upwards from Para 1, and no case exists in which
// it could. Two rules carry the whole file:
//
//   · the frontier is the LOWEST sabaq. Sabaq is the new lesson and only
//     it advances the road; sabqi and manzil are revision and sit
//     wherever the cycle happens to be.
//   · everything from the frontier to Para 30 is held, because that is
//     the road already travelled.
//
// The per-child baseline (hifz_baseline_paras) remains for anything the
// record cannot show — a child whose earlier paras were never logged
// here at all.

import { juzOfPosition, formatParaRanges } from "./quranParas.ts";

/** Rows a proposal may be built from. A missed marker is an absence, not
 *  a portion — it must never widen a child's syllabus. */
export const PORTION_KINDS = new Set(["sabaq", "memorized", "revised", "tested"]);
export const NAZRA_KINDS = new Set(["nazra", "nazra_revision"]);
/** The reading lesson itself. Re-reading, like sabqi, does not advance
 *  the road and so cannot set the frontier. */
export const NAZRA_LESSON_KINDS = new Set(["nazra"]);

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

/** Every para one row touches. Para-mode rows carry juz_number directly;
 *  surah/ayah rows are mapped through the Indo-Pak boundaries. */
function parasOfRow(r: ProgressRow): number[] {
  if (r.missed) return [];
  if (r.juz_number && r.juz_number >= 1 && r.juz_number <= 30) return [r.juz_number];
  if (!r.surah_number || !r.ayah_from) return [];
  if (isEmptyPosition(r)) return [];
  const start = juzOfPosition(r.surah_number, r.ayah_from);
  const end = juzOfPosition(r.surah_number, r.ayah_to ?? r.ayah_from);
  const out: number[] = [];
  for (let p = Math.min(start, end); p <= Math.max(start, end); p++) out.push(p);
  return out;
}

/** Which paras a set of rows covers. */
export function parasCovered(rows: ProgressRow[]): number[] {
  const paras = new Set<number>();
  for (const r of rows) for (const p of parasOfRow(r)) paras.add(p);
  return [...paras];
}

/** Only the new lesson advances the road. Sabqi (recent revision) and
 *  manzil (older revision) sit wherever the child's revision cycle
 *  happens to be and say nothing about how much is memorised. */
export const SABAQ_KINDS = new Set(["sabaq", "memorized"]);

/** How far down the mushaf a child has reached — their memorisation
 *  frontier — or null when nothing has been heard.
 *
 *  Hifz here runs BACKWARDS: Para 30, then 29, 28 … down to 1, and
 *  completing Para 1 is khatam — the whole Quran.
 *
 *  The LOWEST sabaq para, and sabaq only. Both halves of that were
 *  learned from Fahad Ansari (Hifz I), whom the school tells us has just
 *  completed Para 1:
 *
 *    sabaq   2:31 → 2:141 across 4–14 Sep   … Para 1, finished
 *    sabaq   9:94 on 16 Sep                 … Para 11, he has begun dour
 *    sabqi   1:1 every day                  … revising Para 1
 *    manzil  4:24, then 78:1                … Para 5, then Para 30
 *
 *  Reading the frontier from his most recent hearing gives Para 11 and
 *  understates him by twenty-nine paras — it hides a completed Quran.
 *  Reading it from revision gives Para 5, or 30, depending on the day.
 *  The lowest sabaq gives Para 1, which is the truth.
 *
 *  This trusts sabaq completely, so a mistyped one proposes more than a
 *  child holds. That is what the teacher's review before publishing is
 *  for — and a portion that is too large is visible on the screen, where
 *  a missing khatam is not. */
export function frontierPara(
  rows: ProgressRow[],
  kinds: Set<string> = SABAQ_KINDS,
): number | null {
  const paras = rows
    .filter((r) => !r.missed && kinds.has(r.kind))
    .flatMap(parasOfRow);
  return paras.length > 0 ? Math.min(...paras) : null;
}

/** The paras a child holds, given the frontier: everything from there to
 *  the end of the mushaf, because that is the road they travelled. A
 *  child on Para 19 has 19 through 30 — twelve paras. */
function fillDownFrom(frontier: number): number[] {
  const out: number[] = [];
  for (let p = frontier; p <= 30; p++) out.push(p);
  return out;
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
    const nazraRows = rows.filter((r) => NAZRA_KINDS.has(r.kind));
    const paras = parasCovered(nazraRows);
    // A reader who has also been heard on sabaq (mid-move to hifz) still
    // has their reading counted — fall back to everything rather than
    // proposing a blank line.
    const use = paras.length > 0 ? paras : parasCovered(rows);
    const frontier = paras.length > 0
      ? frontierPara(nazraRows, NAZRA_LESSON_KINDS)
      : frontierPara(rows, new Set([...SABAQ_KINDS, ...NAZRA_LESSON_KINDS]));
    return formatParaRanges([
      ...use,
      ...(frontier === null ? [] : fillDownFrom(frontier)),
      ...baseline,
    ]);
  }
  // hifz / revision / unknown: what they have memorized.
  const portionRows = rows.filter((r) => PORTION_KINDS.has(r.kind));
  const paras = parasCovered(portionRows);
  // The road travelled, not just the fortnight we happened to record.
  // A child heard on Para 19 today memorised 30, 29, 28 … 19 to get
  // there, so the syllabus is Para 19–30 (Muneeb, 18 Sep). Without this
  // every child's portion would be understated to whatever they were
  // heard on since logging began on 3 Sep.
  const frontier = frontierPara(portionRows);
  return formatParaRanges([
    ...paras,
    ...(frontier === null ? [] : fillDownFrom(frontier)),
    ...baseline,
  ]);
}
