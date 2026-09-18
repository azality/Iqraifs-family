// Para (juz) boundaries — BACKEND MIRROR of src/utils/hifzTargets.ts.
//
// The frontend owns the canonical copy (JUZ_STARTS + juzOfPosition there);
// this is a deliberate duplicate so the server can turn a child's logged
// sabaq positions into "Para 1-12" without a round trip. The two must not
// drift: regression check 101 asserts the server agrees with the pilot's
// own Indo-Pak boundaries, the ones that differ from the Madani mushaf.
//
// INDO-PAK boundaries, confirmed against the school's mushaf (14 Sep):
// para 11 starts at 9:94, 20 at 27:60, 21 at 29:45, 23 at 36:22.

export const JUZ_STARTS: ReadonlyArray<{ surah: number; ayah: number }> = [
  { surah: 1, ayah: 1 }, { surah: 2, ayah: 142 }, { surah: 2, ayah: 253 },
  { surah: 3, ayah: 92 }, { surah: 4, ayah: 24 }, { surah: 4, ayah: 148 },
  { surah: 5, ayah: 83 }, { surah: 6, ayah: 111 }, { surah: 7, ayah: 88 },
  { surah: 8, ayah: 41 }, { surah: 9, ayah: 94 }, { surah: 11, ayah: 6 },
  { surah: 12, ayah: 53 }, { surah: 15, ayah: 1 }, { surah: 17, ayah: 1 },
  { surah: 18, ayah: 75 }, { surah: 21, ayah: 1 }, { surah: 23, ayah: 1 },
  { surah: 25, ayah: 21 }, { surah: 27, ayah: 60 }, { surah: 29, ayah: 45 },
  { surah: 33, ayah: 31 }, { surah: 36, ayah: 22 }, { surah: 39, ayah: 32 },
  { surah: 41, ayah: 47 }, { surah: 46, ayah: 1 }, { surah: 51, ayah: 31 },
  { surah: 58, ayah: 1 }, { surah: 67, ayah: 1 }, { surah: 78, ayah: 1 },
];

/** Which para a (surah, ayah) position falls in. */
export function juzOfPosition(surah: number, ayah: number): number {
  let j = 1;
  for (let i = 0; i < JUZ_STARTS.length; i++) {
    const st = JUZ_STARTS[i];
    if (surah > st.surah || (surah === st.surah && ayah >= st.ayah)) j = i + 1;
    else break;
  }
  return j;
}

/** Collapse a set of para numbers into readable ranges.
 *  [1,2,3,29,30] -> "Para 1-3, 29-30" · [7] -> "Para 7"
 *
 *  Ranges matter here: plenty of children start at Para 30 and work
 *  backwards through Amma before Para 1, so "Para 1 to N" would be a
 *  lie for them. */
export function formatParaRanges(paras: number[], word = "Para"): string {
  const sorted = [...new Set(paras.filter((p) => p >= 1 && p <= 30))].sort((a, b) => a - b);
  if (sorted.length === 0) return "";
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const p of sorted.slice(1)) {
    if (p === prev + 1) { prev = p; continue; }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = p; prev = p;
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  return `${word} ${parts.join(", ")}`;
}

/** Ayahs per surah, 1-114 — BACKEND MIRROR of src/utils/quranSurahs.ts.
 *  Needed only to find where a para ENDS: several paras begin at ayah 1
 *  of a surah, so the previous para ends at the last ayah of the one
 *  before. Sums to 6236, which is the check worth remembering. */
export const SURAH_AYAHS: ReadonlyArray<number> = [
  7, 286, 200, 176, 120, 165, 206, 75, 129, 109, 123, 111,
  43, 52, 99, 128, 111, 110, 98, 135, 112, 78, 118, 64,
  77, 227, 93, 88, 69, 60, 34, 30, 73, 54, 45, 83,
  182, 88, 75, 85, 54, 53, 89, 59, 37, 35, 38, 29,
  18, 45, 60, 49, 62, 55, 78, 96, 29, 22, 24, 13,
  14, 11, 11, 18, 12, 12, 30, 52, 52, 44, 28, 28,
  20, 56, 40, 31, 50, 40, 46, 42, 29, 19, 36, 25,
  22, 17, 19, 26, 30, 20, 15, 21, 11, 8, 8, 19,
  5, 8, 8, 11, 11, 8, 3, 9, 5, 4, 7, 3,
  6, 3, 5, 4, 5, 6,
];

/** The last (surah, ayah) of a para. */
export function paraEndPosition(para: number): { surah: number; ayah: number } {
  if (para >= 30) return { surah: 114, ayah: SURAH_AYAHS[113] };
  const next = JUZ_STARTS[para]; // JUZ_STARTS[n] starts para n+1
  if (next.ayah > 1) return { surah: next.surah, ayah: next.ayah - 1 };
  const prevSurah = next.surah - 1;
  return { surah: prevSurah, ayah: SURAH_AYAHS[prevSurah - 1] };
}

/** Has a child who reached (surah, ayah) finished this para?
 *
 *  Within a para the road runs FORWARDS, first page to last (Muneeb,
 *  18 Sep) — it is only the ORDER OF PARAS that runs backwards, 30 then
 *  29 then 28. So being heard somewhere inside Para 18 says the child is
 *  working through it, not that they hold it; that is true only once
 *  they reach its final ayah. */
export function paraIsComplete(para: number, surah: number, ayah: number): boolean {
  const end = paraEndPosition(para);
  return surah > end.surah || (surah === end.surah && ayah >= end.ayah);
}
