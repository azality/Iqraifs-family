// A hifz child's recent days, one row per day — the "This week" card on
// the portal's Today page.
//
// The old "This week" digest mixed every kind of activity into ONE list
// capped at five rows. A hifz child is heard three times a day (sabaq,
// sabqi, manzil), so five rows covered barely two days and a parent
// looking on Saturday could not see Monday (18 Sep). This groups the
// hearings by day across a chosen range instead.

export type HifzRange = "week" | "lastWeek" | "month";

export const HIFZ_RANGES: HifzRange[] = ["week", "lastWeek", "month"];

/** Just the fields this module reads off a hearing. */
export interface HifzHeard {
  id: string;
  kind: string;
  recordedAt: string;
  missed?: boolean;
}

export interface HifzDayRow<E extends HifzHeard> {
  /** YYYY-MM-DD, the viewer's calendar day. */
  date: string;
  /** Hearings that day in the order a teacher hears them: sabaq, sabqi,
   *  manzil, then anything else (nazra, qaida, …). */
  entries: E[];
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A Date's calendar day, YYYY-MM-DD, in the device's own clock — the
 *  same clock the rest of the Today page reads. */
export function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return localDate(d);
}

/** 0 = Monday … 6 = Sunday. A school week starts on Monday. */
function mondayIndex(iso: string): number {
  return (new Date(`${iso}T12:00:00`).getDay() + 6) % 7;
}

/** First and last day (inclusive) of a range, as seen on `today`.
 *  - week:     this Monday → today
 *  - lastWeek: last Monday → last Sunday
 *  - month:    the 1st of this month → today */
export function rangeBounds(range: HifzRange, today: string): { from: string; to: string } {
  const monday = addDays(today, -mondayIndex(today));
  if (range === "week") return { from: monday, to: today };
  if (range === "lastWeek") return { from: addDays(monday, -7), to: addDays(monday, -1) };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

/** The earliest day any range can reach — what to fetch once so every
 *  switch is instant. */
export function earliestFrom(today: string): string {
  return HIFZ_RANGES.map((r) => rangeBounds(r, today).from).sort()[0];
}

const KIND_ORDER: Record<string, number> = { sabaq: 0, sabqi: 1, manzil: 2 };

/** Days in [from, to], newest first. A weekday with nothing heard still
 *  gets a row (empty entries) so a gap shows as a gap; Saturday and
 *  Sunday only appear when something was heard. Blank days before
 *  `notBefore` (the first hearing on record) are left out — the school
 *  began logging mid-September, and a week of "nothing recorded" before
 *  that is not a gap in the child's hifz. */
export function daysInRange<E extends HifzHeard>(
  entries: E[], from: string, to: string, notBefore?: string,
): HifzDayRow<E>[] {
  const byDay = new Map<string, E[]>();
  for (const e of entries) {
    const d = new Date(e.recordedAt);
    if (!Number.isFinite(d.getTime())) continue;
    const day = localDate(d);
    if (day < from || day > to) continue;
    const list = byDay.get(day) ?? [];
    list.push(e);
    byDay.set(day, list);
  }
  const rows: HifzDayRow<E>[] = [];
  for (let day = to; day >= from; day = addDays(day, -1)) {
    const list = byDay.get(day) ?? [];
    if (list.length === 0 && (mondayIndex(day) >= 5 || (notBefore && day < notBefore))) continue;
    list.sort((a, b) =>
      (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
      a.recordedAt.localeCompare(b.recordedAt));
    rows.push({ date: day, entries: list });
  }
  return rows;
}

/** The first day anything was heard, or undefined for no hearings. */
export function firstHeardDay(entries: HifzHeard[]): string | undefined {
  let first: string | undefined;
  for (const e of entries) {
    const d = new Date(e.recordedAt);
    if (!Number.isFinite(d.getTime())) continue;
    const day = localDate(d);
    if (!first || day < first) first = day;
  }
  return first;
}

/** Headline counts for a range: days something was heard, and days the
 *  SABAQ was marked missed (a skipped sabqi/manzil is not a missed day). */
export function rangeSummary<E extends HifzHeard>(rows: HifzDayRow<E>[]): {
  heardDays: number; missedSabaqDays: number;
} {
  let heardDays = 0;
  let missedSabaqDays = 0;
  for (const r of rows) {
    if (r.entries.some((e) => !e.missed)) heardDays++;
    if (r.entries.some((e) => e.missed && e.kind === "sabaq")) missedSabaqDays++;
  }
  return { heardDays, missedSabaqDays };
}
