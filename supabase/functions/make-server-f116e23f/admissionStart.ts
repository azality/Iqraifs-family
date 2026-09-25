// When a child actually started, and what that means for the attendance
// figure carried over from the school's paper register.
//
// The problem (Muneeb, 25 Sep): the register sheets gave EVERY child in a
// class the same denominator - "present 14 of 61 working days" - including
// children who were admitted in September. Minsa Hassan Siddiqui joined on
// 27 Aug and her card read 23%; Muhammad Yousuf Arsalan joined on 9 Sep and
// his read 5%. A parent reads that as a truant child. It is an artifact of
// dividing by a register that started on 4 May, months before the child did.
//
// One class DID get it right - the Hifz IV sheet gave Syeda Aisha Shakeel
// 6 of 8 - so the fix is not to override the school, it is to spot the
// figures that cannot be true and stop printing a percentage for them.
//
// We deliberately do NOT estimate the missing denominator. There is no
// working-day calendar for 4 May - 19 Aug (the school was on paper), and
// our own roll call is too patchy to stand in for one (Reception was marked
// on 16 of 33 days). A guessed percentage on a report card is worse than no
// percentage: the days-present count is real, so we print that and the
// joining date, and the office can supply the true denominator whenever it
// suits them - the percentage then comes back on its own.

/** Sunday, the one day the school is shut. Saturday IS a working day here
 *  (roll call has 5 of them), which is why the upper bound below counts it. */
const SUNDAY = 0;

/** Days the office treats as the weekend when working out a start date.
 *  The rule came from Muneeb on 25 Sep: "if the admission was today (since
 *  today is friday) so the first day would be monday". Saturday is a
 *  teaching day for some classes, so this errs one day LATE - which is the
 *  safe direction: it never claims a child was present before they were. */
const WEEKEND = new Set([0, 6]); // Sunday, Saturday

const DAY_MS = 86_400_000;

function parse(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** The child's first day in class: the next day the school is open, strictly
 *  after the admission date. Admitted Friday -> starts Monday. Returns null
 *  if the date is unusable, so callers fall back to "we don't know". */
export function firstSchoolDay(admissionDate: string | null | undefined): string | null {
  if (!admissionDate) return null;
  const d = parse(admissionDate.slice(0, 10));
  if (!d) return null;
  // Step forward at least one day, then past any weekend.
  do {
    d.setTime(d.getTime() + DAY_MS);
  } while (WEEKEND.has(d.getUTCDay()));
  return fmt(d);
}

/** The most working days that could possibly fall in [from, to] inclusive:
 *  every day except Sunday. Holidays only ever reduce the real figure, so
 *  this is a true ceiling for both the 5-day mainstream week and the 6-day
 *  Hifz week - we only ever call a register figure impossible when it
 *  exceeds even this. Returns 0 when the range is empty or backwards. */
export function maxWorkingDaysBetween(from: string, to: string): number {
  const a = parse(from.slice(0, 10));
  const b = parse(to.slice(0, 10));
  if (!a || !b || a.getTime() > b.getTime()) return 0;
  let n = 0;
  for (let t = a.getTime(); t <= b.getTime(); t += DAY_MS) {
    if (new Date(t).getUTCDay() !== SUNDAY) n++;
  }
  return n;
}

export interface OpeningCheck {
  /** True when the carried working-day count cannot belong to this child. */
  impossible: boolean;
  /** The ceiling it was measured against, for the office's worklist. */
  maxPossible: number;
  /** First day in class, when the admission date allowed us to work it out. */
  startsOn: string | null;
  /** The date on file is a re-admission — the child predates it. */
  readmitted?: boolean;
}

/** Is this child's carried register figure arithmetically possible?
 *
 *  Measured from the ADMISSION date rather than the first school day, so the
 *  ceiling is as generous as it can be - a figure we call impossible really
 *  is. A child with no admission date on file is never flagged: absence of
 *  evidence is not evidence of a bad number.
 *
 *  `earliestMark` is the child's first day in our own roll call. When it
 *  falls BEFORE the admission date the child was plainly already at the
 *  school, so that date is a re-admission or a change of class, not a
 *  joining - and their register figure is their own. Two children hit this
 *  (25 Sep): Areeba and Abdullah Bilal, both long-standing pupils carrying
 *  a 31 Aug date, and Areeba's own pro-rated 19-of-19 would otherwise have
 *  been thrown away. */
export function checkOpeningAgainstAdmission(
  opening: { workingDays: number; asOf: string } | null | undefined,
  admissionDate: string | null | undefined,
  earliestMark?: string | null,
): OpeningCheck {
  const startsOn = firstSchoolDay(admissionDate);
  if (!opening || !admissionDate) {
    return { impossible: false, maxPossible: 0, startsOn };
  }
  const admitted = admissionDate.slice(0, 10);
  if (earliestMark && earliestMark.slice(0, 10) < admitted) {
    return { impossible: false, maxPossible: 0, startsOn: null, readmitted: true };
  }
  const maxPossible = maxWorkingDaysBetween(admitted, opening.asOf);
  return {
    impossible: opening.workingDays > maxPossible,
    maxPossible,
    startsOn,
  };
}
