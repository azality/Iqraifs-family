// Attendance carried forward from the school's own register.
//
// IFS ran on paper until 19 Aug 2026 and kept counting by hand after
// that: each class handed in one total per child — "present 58 of 62
// working days" — covering 4 May to the day the sheet was written
// (Muneeb, 21 Sep). The report card and the exam slip must print the
// whole year, so the system needs that opening balance.
//
// The carried period and the system's own roll call OVERLAP (roll call
// starts 19 Aug), so the rule is: up to and including `asOf` the
// school's total is the record, and the system's rows for those days
// are ignored here — they stay visible as daily marks, they just are
// not counted twice. After `asOf`, the system's roll call takes over.

export interface AttendanceOpening {
  /** Days present (late counts as present, as the register did). */
  daysPresent: number;
  /** Working days the count was out of. */
  workingDays: number;
  /** Last day the hand count covers, YYYY-MM-DD. */
  asOf: string;
}

export interface AttendanceRow {
  date: string;
  status: string;
}

export interface AttendanceTotals {
  present: number;
  late: number;
  absent: number;
  excused: number;
  /** Days marked present or late, carried days included. */
  daysPresent: number;
  /** Days the child could have attended, carried days included. */
  workingDays: number;
  percentage: number | null;
  /** Of `workingDays`, how many came from the school's own register. */
  carriedDays: number;
  /** True when the window ends inside the carried period, so the carried
   *  total covers days beyond the window — one number cannot be split. */
  carriedOverruns: boolean;
}

const PRESENT = new Set(["present", "late"]);

/** Totals for [start, end], the carried balance included when it belongs
 *  to that window. Rows outside the window are ignored, as are rows on or
 *  before `asOf` whenever the carried balance already covers them. */
export function attendanceTotals(
  rows: AttendanceRow[],
  window: { start: string; end: string },
  opening?: AttendanceOpening | null,
): AttendanceTotals {
  // The balance belongs to this window only when the window opens no
  // later than the carried period does. A later term starts after asOf
  // and counts its own days only.
  const carried = opening && window.start <= opening.asOf ? opening : null;

  let present = 0, late = 0, absent = 0, excused = 0;
  const days = new Set<string>();
  for (const r of rows) {
    if (r.date < window.start || r.date > window.end) continue;
    if (carried && r.date <= carried.asOf) continue;
    if (r.status === "present") present++;
    else if (r.status === "late") late++;
    else if (r.status === "absent") absent++;
    else if (r.status === "excused") excused++;
    else continue;
    days.add(r.date);
  }

  const marked = present + late;
  const daysPresent = marked + (carried?.daysPresent ?? 0);
  const workingDays = days.size + (carried?.workingDays ?? 0);
  return {
    present, late, absent, excused,
    daysPresent,
    workingDays,
    percentage: workingDays > 0 ? (daysPresent / workingDays) * 100 : null,
    carriedDays: carried?.workingDays ?? 0,
    carriedOverruns: !!carried && window.end < carried.asOf,
  };
}

/** What a school may save. Returns the reason when it must be refused —
 *  a count above the working days is a miscount, not a record. */
export function openingError(
  o: { daysPresent: number; workingDays: number; asOf: string },
): string | null {
  if (!Number.isInteger(o.daysPresent) || o.daysPresent < 0) {
    return "days present must be 0 or more";
  }
  if (!Number.isInteger(o.workingDays) || o.workingDays <= 0) {
    return "working days must be 1 or more";
  }
  if (o.daysPresent > o.workingDays) {
    return `days present (${o.daysPresent}) cannot exceed the working days (${o.workingDays})`;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(o.asOf)) return "as-of date must be YYYY-MM-DD";
  return null;
}
