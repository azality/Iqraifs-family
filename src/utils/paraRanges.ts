// Para sets as humans write them: "1-10, 30" <-> [1..10, 30].
//
// Used for the hifz prior-memorization baseline, where a teacher says
// "this child had done Para 1 to 10 and Amma" rather than listing
// thirty checkboxes. Ranges (not a count) because plenty of children do
// 28-30 before Para 1, so "4 paras" cannot be turned back into which.
//
// formatParaList mirrors formatParaRanges in the Edge Function's
// quranParas.ts — keep the two in step.

/** "1-10, 28-30" -> [1,…,10,28,29,30]. Tolerates Urdu/Arabic-Indic
 *  digits, en/em dashes, "to", and stray spaces. Returns null when the
 *  text has something it cannot read, so the caller can show an error
 *  rather than silently dropping a child's portion. */
export function parseParaList(text: string): number[] | null {
  const normalized = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[–—]/g, "-")
    // No \b around تا: JS word boundaries are ASCII-only, so \bتا\b can
    // never match (caught by paraRanges.test.ts).
    .replace(/\bto\b/gi, "-")
    .replace(/تا/g, "-")
    .replace(/[،؛]/g, ",")
    .trim();
  if (!normalized) return [];

  const out = new Set<number>();
  for (const chunk of normalized.split(",")) {
    const part = chunk.trim();
    if (!part) continue;
    const range = /^(\d{1,2})\s*-\s*(\d{1,2})$/.exec(part);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (!inRange(a) || !inRange(b)) return null;
      for (let p = Math.min(a, b); p <= Math.max(a, b); p++) out.add(p);
      continue;
    }
    const single = /^(\d{1,2})$/.exec(part);
    if (!single) return null;
    const n = Number(single[1]);
    if (!inRange(n)) return null;
    out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function inRange(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && n <= 30;
}

/** [1,…,10,28,29,30] -> "1-10, 28-30". */
export function formatParaList(paras: number[] | null | undefined): string {
  const sorted = [...new Set((paras ?? []).filter(inRange))].sort((a, b) => a - b);
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
  return parts.join(", ");
}
