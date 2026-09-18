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

import {
  juzOfPosition,
  formatParaRanges,
  paraIsComplete,
} from "./quranParas.ts";

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
  /** Para-mode rows record how much of the para the lesson covered
   *  ("full", "half", "quarter", …) instead of an ayah range. */
  juz_extent?: string | null;
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
  // Neither the form's untouched default nor Al-Fatiha describes a
  // portion — see isEmptyPosition and isFatihaOnly.
  if (isEmptyPosition(r) || isFatihaOnly(r)) return [];
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
  const f = frontier(rows, kinds);
  return f === null ? null : f.para;
}

/** Where a child has reached, and whether that para is finished.
 *
 *  `para` is the lowest para any sabaq has touched. `complete` says
 *  whether the sabaq reached its final ayah — within a para the road
 *  runs forwards, first page to last, so being partway in means the
 *  child is working through it, not that they hold it. `at` is that
 *  furthest position, for naming it on the slip; null when the lesson
 *  was logged in para mode, which records an extent rather than an ayah.
 */
export interface Frontier {
  para: number;
  complete: boolean;
  at: { surah: number; ayah: number } | null;
}

export function frontier(
  rows: ProgressRow[],
  kinds: Set<string> = SABAQ_KINDS,
): Frontier | null {
  const usable = rows.filter(
    (r) => !r.missed && kinds.has(r.kind) && !isFatihaOnly(r) && parasOfRow(r).length > 0,
  );
  if (usable.length === 0) return null;
  const para = Math.min(...usable.flatMap(parasOfRow));

  // Of the hearings inside that para, how far did the child get?
  let at: { surah: number; ayah: number } | null = null;
  let complete = false;
  for (const r of usable) {
    if (!parasOfRow(r).includes(para)) continue;
    if (r.juz_number) {
      // Para mode records an extent, not an ayah, so there is no point
      // to name. An explicit part of a para ("half", "quarter", …) means
      // the child is still inside it; "full", or no extent at all, means
      // the para itself was the lesson and is done.
      if (!r.juz_extent || r.juz_extent === "full") complete = true;
      continue;
    }
    const surah = r.surah_number as number;
    const ayah = (r.ayah_to ?? r.ayah_from) as number;
    // Keep the furthest point reached, not the latest logged.
    if (!at || surah > at.surah || (surah === at.surah && ayah > at.ayah)) {
      at = { surah, ayah };
    }
  }
  if (at && paraIsComplete(para, at.surah, at.ayah)) complete = true;
  return { para, complete, at: complete ? null : at };
}

/** Al-Fatiha, and nothing else in the row.
 *
 *  Al-Fatiha sits in Para 1, and every child recites it — the beginner
 *  on his third day as much as the hafiz at khatam. Muhammad Aliyan
 *  Noman (Hifz IV, nazra) is working through Surahs 114, 113 and 111 a
 *  few ayahs at a time; the one 1:1–7 in his record would otherwise set
 *  his frontier to Para 1 and announce that he has memorised the Quran.
 *
 *  So Al-Fatiha never sets the frontier. Real evidence of holding Para 1
 *  is Al-Baqarah running up to 2:141, which is where the para ends — or
 *  Para 1 chosen outright in para mode, which carries juz_number and is
 *  not affected by this. Such a row adds nothing to the portion either;
 *  it remains in the diary and the child's history untouched. */
export function isFatihaOnly(r: ProgressRow): boolean {
  return !r.juz_number && r.surah_number === 1;
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
    const readingRows = paras.length > 0 ? nazraRows : rows;
    const kinds = paras.length > 0
      ? NAZRA_LESSON_KINDS
      : new Set([...SABAQ_KINDS, ...NAZRA_LESSON_KINDS]);
    return portionLine(
      paras.length > 0 ? paras : parasCovered(rows),
      frontier(readingRows, kinds),
      baseline,
    );
  }
  // hifz / revision / unknown: what they have memorized.
  const portionRows = rows.filter((r) => PORTION_KINDS.has(r.kind));
  return portionLine(parasCovered(portionRows), frontier(portionRows), baseline);
}

/** Assemble the line: the paras held, then how far into the current one.
 *
 *  "Para 19–30, and Para 18 up to 23:50" — the finished paras named as
 *  ranges, and the para still in progress named separately with the
 *  point reached, because a question must not land past it. */
function portionLine(
  heard: number[],
  f: Frontier | null,
  baseline: number[],
): string {
  const held = new Set<number>([...baseline]);
  for (const p of heard) held.add(p);
  let partial: string | null = null;

  if (f) {
    // Everything below the frontier's para is finished ground.
    for (let p = f.complete ? f.para : f.para + 1; p <= 30; p++) held.add(p);
    if (!f.complete) {
      // The para in progress is not held, however often it was heard.
      held.delete(f.para);
      partial = f.at
        ? `Para ${f.para} up to ${f.at.surah}:${f.at.ayah}`
        : `part of Para ${f.para}`;
    }
  }

  const ranges = formatParaRanges([...held]);
  if (!partial) return ranges;
  return ranges ? `${ranges}, and ${partial}` : partial;
}
