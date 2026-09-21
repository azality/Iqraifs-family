import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { attendanceTotals, openingError } from "./attendanceOpening.ts";

// Class VI: 62 working days to 18 Sep, Nabiha present 60 of them.
const OPENING = { daysPresent: 60, workingDays: 62, asOf: "2026-09-18" };
const TERM1 = { start: "2026-05-04", end: "2026-09-20" };

Deno.test("the carried balance counts, and roll call after it adds on", () => {
  const t = attendanceTotals(
    [{ date: "2026-09-19", status: "present" }],
    TERM1,
    OPENING,
  );
  assertEquals(t.daysPresent, 61);
  assertEquals(t.workingDays, 63);
  assertEquals(t.carriedDays, 62);
});

Deno.test("roll call INSIDE the carried period is never counted twice", () => {
  // 19 Aug - 18 Sep is in both the school's hand count and our roll call.
  const rows = [
    { date: "2026-08-19", status: "present" },
    { date: "2026-09-01", status: "absent" },
    { date: "2026-09-18", status: "present" },
    { date: "2026-09-19", status: "present" },
  ];
  const t = attendanceTotals(rows, TERM1, OPENING);
  assertEquals(t.daysPresent, 61);
  assertEquals(t.workingDays, 63);
  assertEquals(t.absent, 0, "an absence already inside the hand count is not re-counted");
});

Deno.test("late counts as present, the way the register did", () => {
  const t = attendanceTotals([{ date: "2026-09-19", status: "late" }], TERM1, OPENING);
  assertEquals(t.daysPresent, 61);
  assertEquals(t.late, 1);
});

Deno.test("a later term ignores the balance entirely", () => {
  const term2 = { start: "2026-09-21", end: "2026-12-23" };
  const t = attendanceTotals(
    [{ date: "2026-09-21", status: "present" }, { date: "2026-09-22", status: "absent" }],
    term2,
    OPENING,
  );
  assertEquals(t.daysPresent, 1);
  assertEquals(t.workingDays, 2);
  assertEquals(t.carriedDays, 0);
  assertEquals(t.percentage, 50);
});

Deno.test("with no balance it behaves exactly as before", () => {
  const rows = [
    { date: "2026-09-19", status: "present" },
    { date: "2026-09-21", status: "absent" },
  ];
  const t = attendanceTotals(rows, TERM1, null);
  assertEquals(t.workingDays, 1, "21 Sep is outside the term");
  assertEquals(t.percentage, 100);
});

Deno.test("one day marked twice is still one working day", () => {
  const rows = [
    { date: "2026-09-19", status: "present" },
    { date: "2026-09-19", status: "present" },
  ];
  assertEquals(attendanceTotals(rows, TERM1, OPENING).workingDays, 63);
});

Deno.test("a window ending inside the carried period says so", () => {
  const t = attendanceTotals([], { start: "2026-05-04", end: "2026-06-30" }, OPENING);
  assertEquals(t.carriedOverruns, true);
  assertEquals(t.carriedDays, 62);
});

Deno.test("no attendance at all yields no percentage", () => {
  assertEquals(attendanceTotals([], TERM1, null).percentage, null);
});

Deno.test("a count above the working days is refused", () => {
  assertEquals(openingError({ daysPresent: 63, workingDays: 62, asOf: "2026-09-18" }),
    "days present (63) cannot exceed the working days (62)");
  assertEquals(openingError({ daysPresent: 0, workingDays: 62, asOf: "2026-09-18" }), null);
  assertEquals(openingError({ daysPresent: 5, workingDays: 0, asOf: "2026-09-18" }),
    "working days must be 1 or more");
  assertEquals(openingError({ daysPresent: 5, workingDays: 62, asOf: "18-09-2026" }),
    "as-of date must be YYYY-MM-DD");
});
