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
  | "quarter"              // start → ruba (first quarter)
  | "second_quarter"       // ruba → nisf
  | "third_quarter"        // nisf → salasa
  | "last_quarter"         // salasa → end
  | "half"                 // start → nisf (first half)
  | "second_half"          // nisf → end
  | "three_quarters"       // start → salasa
  | "middle_half"          // ruba → salasa (¼ → ¾)
  | "last_three_quarters"; // ruba → end (¼ → end)

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

/** Ratings that mean "the same portion again tomorrow" — one predicate
 *  for both vocabularies: the round's chips (weak / repeat) and the
 *  stored qualities (needs_practice / not_learned). Keeping it here
 *  stops the dialog and the round drifting on what counts as a repeat. */
export function isRepeatRating(q: string | null | undefined): boolean {
  return q === "weak" || q === "repeat" || q === "needs_practice" || q === "not_learned";
}

/** One segment of a sabaq. A lesson can span two surahs — the tail of
 *  the one being finished plus the start of the next (Muneeb, 10 Sep:
 *  "part of a surah (last part) that's finishing up and give a new
 *  surah that's starting") — so targets serialize as " + "-joined
 *  parts, exactly like a straddling manzil sitting. */
export interface SabaqPart {
  surahNumber: number;
  from: number;
  to: number;
}

export function serializeNextSabaqParts(parts: SabaqPart[]): string {
  return `Sabaq: ${parts
    .map((p) => {
      const s = getSurah(p.surahNumber);
      // Normalize a reversed range — a teacher typing "to" before "from"
      // produced stored targets like "An-Nur 57–51" (pilot, 8 Sep).
      const lo = Math.min(p.from, p.to);
      const hi = Math.max(p.from, p.to);
      return `${s?.nameTransliterated ?? p.surahNumber} ${lo}–${hi}`;
    })
    .join(" + ")}`;
}

/** "Sabaq: Yunus 98–109 + Hud 1–5" → both segments. Single-segment
 *  strings (the pre-existing format) parse to a one-element array.
 *  Returns null for the para-revision shape, which owns its own
 *  parser, and for anything unrecognised. */
export function parseNextSabaqParts(text: string): SabaqPart[] | null {
  const t = text.trim();
  if (!/^Sabaq:/i.test(t)) return null;
  if (/Revise\s+Para/i.test(t)) return null;
  const segs = t.replace(/^Sabaq:\s*/i, "").split(/\s*\+\s*/);
  const out: SabaqPart[] = [];
  for (const seg of segs) {
    const m = /^(.+?)\s+(\d+)\s*[–-]\s*(\d+)$/.exec(seg.trim());
    if (!m) return null;
    const name = m[1].trim().toLowerCase();
    const surah = SURAHS.find((s) => s.nameTransliterated.toLowerCase() === name);
    if (!surah) return null;
    // Heal already-stored reversed ranges the same way the serializer
    // now prevents them.
    const a = Number(m[2]);
    const b = Number(m[3]);
    out.push({ surahNumber: surah.number, from: Math.min(a, b), to: Math.max(a, b) });
  }
  return out.length ? out : null;
}

/** Tomorrow's sabaq for a lesson that may span two surahs.
 *
 *  Repeat keeps every segment as-is. On advance, a segment that ended
 *  on its surah's LAST ayah is finished and drops out — the point of a
 *  two-part lesson is to close one surah while opening the next, so
 *  the closed one must not roll forward and duplicate the other. What
 *  remains continues by the same length. If every segment finished,
 *  the lesson rolls into whatever follows the last one, which is
 *  exactly the single-segment behaviour. */
export function nextSabaqPartsAfter(
  parts: SabaqPart[],
  repeat: boolean,
): SabaqPart[] | null {
  if (parts.length === 0) return null;
  if (repeat) return parts.map((p) => ({ ...p }));
  const kept: SabaqPart[] = [];
  for (const p of parts) {
    const max = getSurah(p.surahNumber)?.ayahCount ?? p.to;
    if (p.to >= max) continue; // this surah is done
    const nxt = nextSabaqAfter(p.surahNumber, p.from, p.to);
    if (nxt) kept.push({ surahNumber: nxt.surahNumber, from: nxt.from, to: nxt.to });
  }
  if (kept.length > 0) return kept;
  const last = parts[parts.length - 1];
  const nxt = nextSabaqAfter(last.surahNumber, last.from, last.to);
  return nxt ? [{ surahNumber: nxt.surahNumber, from: nxt.from, to: nxt.to }] : null;
}

export function serializeNextSabaq(surahNumber: number, from: number, to: number): string {
  return serializeNextSabaqParts([{ surahNumber, from, to }]);
}

/** First segment of the target — kept for single-slot consumers (the
 *  round's portion, the dialog's seed). */
export function parseNextSabaq(
  text: string,
): { surahNumber: number; from: number; to: number } | null {
  return parseNextSabaqParts(text)?.[0] ?? null;
}

/** "Sabqi: Para 5" → 5. Surah-list sabqi targets return null (they
 *  don't fit the round's single-range portion model). */
export function parseNextSabqiPara(text: string): number | null {
  const m = /^Sabqi:\s*Para\s+(\d{1,2})\s*$/i.exec(text.trim());
  if (!m) return null;
  const juz = Number(m[1]);
  return juz >= 1 && juz <= 30 ? juz : null;
}

/** End-of-para consolidation (Muneeb, 10 Sep): when a sabaq finishes a
 *  juz, the method pauses new lessons while the whole para is heard —
 *  even mid-surah (juz 1 ends at Baqarah 141; the break still happens).
 *  Returns the finished juz number, or null when the portion doesn't
 *  end exactly at a juz boundary. */
export function paraFinishedBySabaq(
  surahNumber: number,
  from: number,
  to: number,
): number | null {
  void from;
  const max = getSurah(surahNumber)?.ayahCount ?? to;
  const end = Math.min(to, max);
  const endJuz = juzOfPosition(surahNumber, end);
  let nextS: number;
  let nextA: number;
  if (end < max) {
    nextS = surahNumber; nextA = end + 1;
  } else if (surahNumber < 114) {
    nextS = surahNumber + 1; nextA = 1;
  } else {
    return endJuz === 30 ? 30 : null; // An-Nas finished = juz 30 done
  }
  return juzOfPosition(nextS, nextA) > endJuz ? endJuz : null;
}

/** "Sabaq: Revise Para 17 — then Al-Mu'minun 1–6". The continuation is
 *  stashed inside the target so the resume point survives however many
 *  consolidation days the ratings extend it to. */
export function serializeSabaqParaRevision(
  juz: number,
  then: { surahNumber: number; from: number; to: number } | null,
): string {
  const tail = then
    ? ` — then ${getSurah(then.surahNumber)?.nameTransliterated ?? then.surahNumber} ${Math.min(then.from, then.to)}–${Math.max(then.from, then.to)}`
    : "";
  return `Sabaq: Revise Para ${juz}${tail}`;
}

export function parseSabaqParaRevision(
  text: string,
): { juz: number; then: { surahNumber: number; from: number; to: number } | null } | null {
  const m = /^Sabaq:\s*Revise\s+Para\s+(\d{1,2})(?:\s*—\s*then\s+(.+?)\s+(\d+)\s*[–-]\s*(\d+))?\s*$/i.exec(
    text.trim(),
  );
  if (!m) return null;
  const juz = Number(m[1]);
  if (juz < 1 || juz > 30) return null;
  let then: { surahNumber: number; from: number; to: number } | null = null;
  if (m[2]) {
    const surah = SURAHS.find(
      (s) => s.nameTransliterated.toLowerCase() === m[2].toLowerCase(),
    );
    if (surah) {
      const a = Number(m[3]);
      const b = Number(m[4]);
      then = { surahNumber: surah.number, from: Math.min(a, b), to: Math.max(a, b) };
    }
  }
  return { juz, then };
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
  middle_half: "ruba → salasa (¼–¾)",
  last_three_quarters: "ruba → end (¼–end)",
};

export function serializeNextManzil(juz: number, extent: AssignExtent): string {
  return `Manzil: Para ${juz} (${EXTENT_SUFFIX[extent]})`;
}

/** Tomorrow's manzil, following the rating like the sabaq does
 *  (Muneeb, 10 Sep — "second quarter of Juz 24 rated repeat still
 *  rotated to Juz 25"):
 *
 *    weak/repeat      → the SAME portion again.
 *    good/excellent   → the next SEGMENT of the same juz while one
 *                       remains (second quarter → third quarter);
 *                       once the juz is finished, rotate to the next
 *                       juz at the same granularity (after the last
 *                       quarter → next juz's first quarter; after a
 *                       full para → next juz full).
 */
const NEXT_SEGMENT: Partial<Record<AssignExtent, AssignExtent>> = {
  quarter: "second_quarter",
  second_quarter: "third_quarter",
  third_quarter: "last_quarter",
  half: "second_half",
  three_quarters: "last_quarter",
  middle_half: "last_quarter",
};
const NEXT_JUZ_START: Partial<Record<AssignExtent, AssignExtent>> = {
  full: "full",
  last_quarter: "quarter",
  second_half: "half",
  last_three_quarters: "quarter",
};

export function nextManzilAfter(
  juz: number,
  extent: AssignExtent,
  repeat: boolean,
): { juz: number; extent: AssignExtent } {
  if (repeat) return { juz, extent };
  const seg = NEXT_SEGMENT[extent];
  if (seg) return { juz, extent: seg };
  return { juz: (juz % 30) + 1, extent: NEXT_JUZ_START[extent] ?? "full" };
}

/** One slice of a manzil sitting. A sitting can straddle paras —
 *  "second half of Para 16 + first half of Para 17" (Muneeb, 10 Sep) —
 *  so targets serialize as " + "-joined parts. */
export interface ManzilPart {
  juz: number;
  extent: AssignExtent;
}

export function serializeNextManzilParts(parts: ManzilPart[]): string {
  return `Manzil: ${parts
    .map((p) => `Para ${p.juz} (${EXTENT_SUFFIX[p.extent]})`)
    .join(" + ")}`;
}

/** "Manzil: Para 16 (second ½ — nisf → end) + Para 17 (first ½ — nisf)"
 *  → both parts. Single-part strings (the pre-existing format) parse to
 *  a one-element array. Unknown extent text falls back to "full". */
export function parseNextManzilParts(text: string): ManzilPart[] | null {
  const t = text.trim();
  if (!/^Manzil:/i.test(t)) return null;
  const segs = t.replace(/^Manzil:\s*/i, "").split(/\s*\+\s*/);
  const out: ManzilPart[] = [];
  for (const seg of segs) {
    const m = /^Para\s+(\d{1,2})(?:\s*\((.+)\))?$/i.exec(seg.trim());
    if (!m) return null;
    const juz = Number(m[1]);
    if (juz < 1 || juz > 30) return null;
    const suffix = (m[2] ?? "").trim();
    const found = (Object.entries(EXTENT_SUFFIX) as Array<[AssignExtent, string]>)
      .find(([, s]) => s === suffix);
    out.push({ juz, extent: found ? found[0] : "full" });
  }
  return out.length ? out : null;
}

/** First part of the target — kept for single-slot consumers (the Log
 *  dialog's manzil seed). */
export function parseNextManzil(
  text: string,
): { juz: number; extent: AssignExtent } | null {
  const parts = parseNextManzilParts(text);
  return parts ? parts[0] : null;
}
