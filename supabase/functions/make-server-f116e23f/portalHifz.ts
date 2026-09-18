// What a hifz parent needs to see: what was heard, and what to prepare.
//
// "As a parent I want to see what my kid memorized or learned today and
// what was the homework" (Muneeb, 18 Sep — relaying parents who said
// hifz homework was invisible).
//
// It was never missing. Teachers record the next lesson on 97% of sabaq
// hearings (`hifz_progress.next_target`, e.g. "Sabaq: Al-Furqan 1–8") and
// the staff Hifz history shows it as "Next lesson". No parent screen ever
// read that column: the diary, Learning → Lessons and Learning → Homework
// all come from the `lesson` / `assignment` tables, which hifz teachers
// never write because they log the hifz round instead. Four screens, one
// column nobody selected.
//
// Pure — no database — so every parent screen answers from the same rules.

/** Same default as tz.ts. Not imported from there: tz.ts reaches into the
 *  database module for orgTimezone, and this file must stay pure so its
 *  rules can be tested without a Supabase client. */
const DEFAULT_TZ = "Asia/Karachi";

/** YYYY-MM-DD on a wall clock in `tz` — the same computation as
 *  tz.ts's todayInOrgTz, which en-CA formats as YYYY-MM-DD directly. */
function dateInTz(at: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Teaching order: the new lesson first, then its revisions. */
export const HIFZ_KIND_ORDER = [
  "sabaq", "sabqi", "manzil", "nazra", "nazra_revision", "qaida",
];

export interface HifzRow {
  kind: string;
  surah_number: number | null;
  ayah_from: number | null;
  ayah_to: number | null;
  juz_number: number | null;
  juz_extent: string | null;
  qaida_lesson: number | null;
  quality: string | null;
  next_target: string | null;
  recorded_at: string | null;
  missed: boolean | null;
}

/** One line of homework: what the teacher said to prepare next. */
export interface HomeworkLine {
  kind: string;
  text: string;
  /** The school day it was set, so a parent can see how current it is. */
  setOn: string | null;
}

/** A school day's hifz: what was heard, and what was set to prepare. */
export interface HifzDay {
  date: string;
  heard: HifzRow[];
  homework: HomeworkLine[];
}

const kindRank = (k: string) => {
  const i = HIFZ_KIND_ORDER.indexOf(k);
  return i === -1 ? 99 : i;
};

/** The school day a hearing belongs to, on the school's clock.
 *
 *  Not `recorded_at.slice(0, 10)`: that is the UTC date, and a hearing
 *  saved after 19:00 in Karachi would land on tomorrow. The same trap has
 *  already been fixed four times elsewhere in this codebase. */
export function schoolDateOf(recordedAt: string | null, tz?: string): string | null {
  if (!recordedAt) return null;
  const at = new Date(recordedAt);
  if (Number.isNaN(at.getTime())) return null;
  return dateInTz(at, tz ?? DEFAULT_TZ);
}

/** The homework a child is carrying right now: for each kind, the next
 *  target set on the most recent hearing of that kind that carries one.
 *
 *  Rows without a target are passed over rather than ending the search —
 *  a teacher who rates a hearing and moves on has not cancelled the
 *  homework she set yesterday. Rows must arrive newest-first. */
export function currentHomework(rowsNewestFirst: HifzRow[], tz?: string): HomeworkLine[] {
  const byKind = new Map<string, HomeworkLine>();
  for (const r of rowsNewestFirst) {
    if (byKind.has(r.kind)) continue;
    const text = (r.next_target ?? "").trim();
    if (!text) continue;
    byKind.set(r.kind, { kind: r.kind, text, setOn: schoolDateOf(r.recorded_at, tz) });
  }
  return [...byKind.values()].sort((a, b) => kindRank(a.kind) - kindRank(b.kind));
}

/** Group hearings into school days, newest day first.
 *
 *  `heard` keeps one row per kind (the latest that day) and skips the
 *  not-heard markers — an absence is not classwork. `homework` is every
 *  next target set that day, one per kind. */
export function groupByDay(rowsNewestFirst: HifzRow[], tz?: string): HifzDay[] {
  const days = new Map<string, { heard: Map<string, HifzRow>; hw: Map<string, HomeworkLine> }>();
  for (const r of rowsNewestFirst) {
    const date = schoolDateOf(r.recorded_at, tz);
    if (!date) continue;
    const d = days.get(date) ?? { heard: new Map(), hw: new Map() };
    days.set(date, d);
    if (!r.missed && !d.heard.has(r.kind)) d.heard.set(r.kind, r);
    const text = (r.next_target ?? "").trim();
    if (text && !d.hw.has(r.kind)) d.hw.set(r.kind, { kind: r.kind, text, setOn: date });
  }
  return [...days.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, d]) => ({
      date,
      heard: [...d.heard.values()].sort((a, b) => kindRank(a.kind) - kindRank(b.kind)),
      homework: [...d.hw.values()].sort((a, b) => kindRank(a.kind) - kindRank(b.kind)),
    }))
    // A day with nothing heard and nothing set tells a parent nothing.
    .filter((d) => d.heard.length > 0 || d.homework.length > 0);
}

/** Which hifz kind a timetable period teaches, from its subject's name.
 *
 *  The parent's "Up next" card showed "Topic to be announced" under the
 *  Sabqi and Manzil periods forever: it looks for a curriculum topic, and
 *  hifz has none — each child is on their own portion. Knowing the kind
 *  lets that card show the child's own next target instead.
 *
 *  Subject names are the school's, so match generously on the common
 *  spellings, in both scripts. Anything unrecognised returns null and the
 *  card simply says nothing about a topic. Sabqi is tested before sabaq
 *  because every spelling of one begins with the other. */
export function hifzKindOfSubject(name: string | null): string | null {
  if (!name) return null;
  const raw = name.trim();
  const urdu = raw.replace(/\s+/g, "");
  if (urdu === "سبقی" || urdu === "سبقئ") return "sabqi";
  if (urdu === "سبق") return "sabaq";
  if (urdu === "منزل") return "manzil";
  const n = raw.toLowerCase().replace(/[^a-z]/g, "");
  if (["sabqi", "sabaqi", "sabki", "sabqee", "sabaqee", "sabqy"].includes(n)) return "sabqi";
  if (["sabaq", "sabak", "sabq"].includes(n)) return "sabaq";
  if (["manzil", "manzal", "manzel"].includes(n)) return "manzil";
  return null;
}
