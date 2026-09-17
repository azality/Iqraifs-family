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
