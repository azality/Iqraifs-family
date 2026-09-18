// How a hifz hearing reads to a parent — one wording, used everywhere.
//
// The diary card had this inline. Learning → Lessons now shows a hifz
// child's classwork too, and two copies of "Surah An-Nur, ayah 62–64
// (Good)" would drift. Both screens call this.

import { surahDisplayName } from "./quranSurahs";
import { formatJuzExtent } from "./hifzExtent";

type T = (key: string, opts?: Record<string, unknown>) => string;

/** A hearing in whichever shape it arrives — the diary's camelCase or the
 *  server's raw snake_case rows. */
export interface HeardLike {
  kind: string;
  surahNumber?: number | null;
  ayahFrom?: number | null;
  ayahTo?: number | null;
  juzNumber?: number | null;
  juzExtent?: string | null;
  qaidaLesson?: number | null;
  quality?: string | null;
  surah_number?: number | null;
  ayah_from?: number | null;
  ayah_to?: number | null;
  juz_number?: number | null;
  juz_extent?: string | null;
  qaida_lesson?: number | null;
}

/** "Sabaq", "Sabqi", "Nazra revision", … in the viewer's language. */
export function hifzKindWord(kind: string, t: T): string {
  if (kind === "qaida") return t("portal.hifz.kindQaida");
  if (kind === "nazra") return t("portal.hifz.kindNazra");
  if (kind === "nazra_revision") return t("portal.hifz.kindNazraRevision");
  if (kind === "sabaq" || kind === "sabqi" || kind === "manzil") return t(`hifzTeach.${kind}`);
  return kind;
}

/** The quality rating as a word, or "" when none was given. */
export function hifzQualityWord(q: string | null | undefined, t: T): string {
  if (!q) return "";
  const map: Record<string, string> = {
    excellent: t("hifzTeach.qExcellent"),
    good: t("hifzTeach.qGood"),
    weak: t("hifzTeach.qWeak"),
    needs_practice: t("hifzTeach.qNeedsPractice"),
    not_learned: t("hifzTeach.qNotLearned"),
  };
  return map[q] ?? q;
}

/** The portion itself: "Surah An-Nur, ayah 62–64", "Juz 18 — ¾", … */
export function hifzPortion(e: HeardLike, t: T, lang: string): string {
  const surah = e.surahNumber ?? e.surah_number ?? null;
  const from = e.ayahFrom ?? e.ayah_from ?? null;
  const to = e.ayahTo ?? e.ayah_to ?? from;
  const juz = e.juzNumber ?? e.juz_number ?? null;
  const extent = e.juzExtent ?? e.juz_extent ?? null;
  const takhti = e.qaidaLesson ?? e.qaida_lesson ?? null;

  if (e.kind === "qaida") return t("portal.hifz.qaidaLesson", { n: takhti ?? "—" });
  if ((e.kind === "manzil" || extent) && juz) {
    return `${t("hifzTeach.juzN", { n: juz })}${formatJuzExtent(extent)}`;
  }
  if (surah != null) {
    const range = `${from ?? 0}${to != null && to !== from ? `–${to}` : ""}`;
    const name = surahDisplayName(surah, lang) || String(surah);
    return `${t("hifzTeach.surah")} ${name}, ${t("portal.hifz.ayahWord")} ${range}`;
  }
  if (juz) return t("hifzTeach.juzN", { n: juz });
  return "";
}

/** One full line: "Sabaq — Surah An-Nur, ayah 62–64 (Good)". */
export function hifzLine(e: HeardLike, t: T, lang: string): string {
  const portion = hifzPortion(e, t, lang);
  const q = hifzQualityWord(e.quality, t);
  return `${hifzKindWord(e.kind, t)}${portion ? ` — ${portion}` : ""}${q ? ` (${q})` : ""}`;
}
