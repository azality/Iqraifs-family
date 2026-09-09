// hifzTargets — the one place "tomorrow's lesson" is written and read.
//
// next_target is human-readable on purpose (parents see it in the
// portal) while staying parseable for next-day prefill. Both the Log
// Hifz modal and Round Mode write it, so the serializers live here —
// two copies had already drifted once.
//
// What "next" MEANS depends on the kind:
//
//   Sabaq:  "Sabaq: Al-Fatiha 1–7"                       one new passage
//   Sabqi:  "Sabqi: Al-Baqarah (full), Al-Imran 1–20"    recent revision,
//           several surahs, each whole or partial
//           "Sabqi: Para 5"                              or a whole para
//   Manzil: "Manzil: Para 6 (to ½)"                      older revision,
//           always by para, with how much of it to hear

import { SURAHS, getSurah } from "./quranSurahs";

export type AssignExtent =
  | "full"
  | "quarter"          // start → ruba (first quarter)
  | "second_quarter"   // ruba → nisf
  | "third_quarter"    // nisf → salasa
  | "last_quarter"     // salasa → end
  | "half"             // start → nisf (first half)
  | "second_half"      // nisf → end
  | "three_quarters";  // start → salasa

/** First (surah, ayah) of each juz — Hafs. Used to prefill para-mode
 *  entries and to place a position in its juz. */
export const JUZ_STARTS: ReadonlyArray<{ surah: number; ayah: number }> = [
  { surah: 1, ayah: 1 }, { surah: 2, ayah: 142 }, { surah: 2, ayah: 253 },
  { surah: 3, ayah: 93 }, { surah: 4, ayah: 24 }, { surah: 4, ayah: 148 },
  { surah: 5, ayah: 82 }, { surah: 6, ayah: 111 }, { surah: 7, ayah: 88 },
  { surah: 8, ayah: 41 }, { surah: 9, ayah: 93 }, { surah: 11, ayah: 6 },
  { surah: 12, ayah: 53 }, { surah: 15, ayah: 1 }, { surah: 17, ayah: 1 },
  { surah: 18, ayah: 75 }, { surah: 21, ayah: 1 }, { surah: 23, ayah: 1 },
  { surah: 25, ayah: 21 }, { surah: 27, ayah: 56 }, { surah: 29, ayah: 46 },
  { surah: 33, ayah: 31 }, { surah: 36, ayah: 28 }, { surah: 39, ayah: 32 },
  { surah: 41, ayah: 47 }, { surah: 46, ayah: 1 }, { surah: 51, ayah: 31 },
  { surah: 58, ayah: 1 }, { surah: 67, ayah: 1 }, { surah: 78, ayah: 1 },
];

/** Which juz a (surah, ayah) position falls in. */
export function juzOfPosition(surah: number, ayah: number): number {
  let j = 1;
  for (let i = 0; i < JUZ_STARTS.length; i++) {
    const st = JUZ_STARTS[i];
    if (surah > st.surah || (surah === st.surah && ayah >= st.ayah)) j = i + 1;
    else break;
  }
  return j;
}

/** One surah in a sabqi assignment. from/to null = the whole surah. */
export interface SabqiPart {
  surah: number;
  from: number | null;
  to: number | null;
}

/** Tomorrow's sabaq when today's went well: the next portion of the
 *  same length. Rolls into the NEXT surah when today's finished this
 *  one (Yunus 99–109 → Hud 1–11) — the school's call, made by the
 *  principal (7 Sep): forward order, not juz-30-back. Returns null
 *  only after An-Nas — nothing is left to assign. */
export function nextSabaqAfter(
  surahNumber: number,
  from: number,
  to: number,
): { surahNumber: number; from: number; to: number } | null {
  const len = Math.max(1, to - from + 1);
  const max = getSurah(surahNumber)?.ayahCount ?? to;
  if (to < max) {
    return { surahNumber, from: to + 1, to: Math.min(to + len, max) };
  }
  if (surahNumber >= 114) return null;
  const nextMax = getSurah(surahNumber + 1)?.ayahCount ?? 1;
  return { surahNumber: surahNumber + 1, from: 1, to: Math.min(len, nextMax) };
}

export function serializeNextSabaq(surahNumber: number, from: number, to: number): string {
  const s = getSurah(surahNumber);
  // Normalize a reversed range — a teacher typing "to" before "from"
  // produced stored targets like "An-Nur 57–51" (pilot, 8 Sep).
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return `Sabaq: ${s?.nameTransliterated ?? surahNumber} ${lo}–${hi}`;
}

export function parseNextSabaq(
  text: string,
): { surahNumber: number; from: number; to: number } | null {
  const m = /^Sabaq:\s*(.+?)\s+(\d+)\s*[–-]\s*(\d+)\s*$/.exec(text.trim());
  if (!m) return null;
  const name = m[1].toLowerCase();
  const surah = SURAHS.find((s) => s.nameTransliterated.toLowerCase() === name);
  if (!surah) return null;
  // Heal already-stored reversed ranges the same way the serializer
  // now prevents them.
  const a = Number(m[2]);
  const b = Number(m[3]);
  return { surahNumber: surah.number, from: Math.min(a, b), to: Math.max(a, b) };
}

/** "Sabqi: Para 5" → 5. Surah-list sabqi targets return null (they
 *  don't fit the round's single-range portion model). */
export function parseNextSabqiPara(text: string): number | null {
  const m = /^Sabqi:\s*Para\s+(\d{1,2})\s*$/i.exec(text.trim());
  if (!m) return null;
  const juz = Number(m[1]);
  return juz >= 1 && juz <= 30 ? juz : null;
}

export function serializeNextSabqiSurahs(parts: SabqiPart[]): string {
  const bits = parts
    .filter((p) => p.surah > 0)
    .map((p) => {
      const name = getSurah(p.surah)?.nameTransliterated ?? String(p.surah);
      return p.from == null || p.to == null ? `${name} (full)` : `${name} ${p.from}–${p.to}`;
    });
  return bits.length ? `Sabqi: ${bits.join(", ")}` : "";
}

export function serializeNextSabqiPara(juz: number): string {
  return `Sabqi: Para ${juz}`;
}

const EXTENT_SUFFIX: Record<AssignExtent, string> = {
  full: "full para",
  quarter: "first ¼ — ruba",
  second_quarter: "ruba → nisf (¼–½)",
  third_quarter: "nisf → salasa (½–¾)",
  last_quarter: "last ¼ — salasa → end",
  half: "first ½ — nisf",
  second_half: "second ½ — nisf → end",
  three_quarters: "to ¾ — salasa",
};

export function serializeNextManzil(juz: number, extent: AssignExtent): string {
  return `Manzil: Para ${juz} (${EXTENT_SUFFIX[extent]})`;
}

/** "Manzil: Para 6 (to ¾ — salasa)" → { juz: 6, extent: "three_quarters" }.
 *  Unknown extent text falls back to "full" rather than dropping the juz. */
export function parseNextManzil(
  text: string,
): { juz: number; extent: AssignExtent } | null {
  const m = /^Manzil:\s*Para\s+(\d{1,2})(?:\s*\((.+)\))?\s*$/i.exec(text.trim());
  if (!m) return null;
  const juz = Number(m[1]);
  if (juz < 1 || juz > 30) return null;
  const suffix = (m[2] ?? "").trim();
  const found = (Object.entries(EXTENT_SUFFIX) as Array<[AssignExtent, string]>)
    .find(([, s]) => s === suffix);
  return { juz, extent: found ? found[0] : "full" };
}
