import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  firstSchoolDay,
  maxWorkingDaysBetween,
  checkOpeningAgainstAdmission,
} from "./admissionStart.ts";

Deno.test("first school day is the next open day, never the admission day", () => {
  // Muneeb's own example: admitted Friday 25 Sep -> starts Monday 28 Sep.
  assertEquals(firstSchoolDay("2026-09-25"), "2026-09-28");
  // Thursday -> Friday. GR 2490 Abiha Imran, admitted 24 Sep.
  assertEquals(firstSchoolDay("2026-09-24"), "2026-09-25");
  // Saturday and Sunday both land on Monday.
  assertEquals(firstSchoolDay("2026-09-26"), "2026-09-28");
  assertEquals(firstSchoolDay("2026-09-27"), "2026-09-28");
  // Monday -> Tuesday: the child never starts the day they are admitted.
  assertEquals(firstSchoolDay("2026-09-21"), "2026-09-22");
});

Deno.test("no admission date means no start date - we do not invent one", () => {
  assertEquals(firstSchoolDay(null), null);
  assertEquals(firstSchoolDay(""), null);
  assertEquals(firstSchoolDay("not a date"), null);
  // A timestamp is tolerated; only the date part is read.
  assertEquals(firstSchoolDay("2026-09-25T11:30:00Z"), "2026-09-28");
});

Deno.test("the ceiling counts every day but Sunday, both ends included", () => {
  // Mon 21 Sep to Sat 26 Sep is six days, none of them Sunday.
  assertEquals(maxWorkingDaysBetween("2026-09-21", "2026-09-26"), 6);
  // Extending to Sunday adds nothing.
  assertEquals(maxWorkingDaysBetween("2026-09-21", "2026-09-27"), 6);
  // A single day counts itself, unless it is a Sunday.
  assertEquals(maxWorkingDaysBetween("2026-09-21", "2026-09-21"), 1);
  assertEquals(maxWorkingDaysBetween("2026-09-27", "2026-09-27"), 0);
  // Backwards or unparseable ranges are empty, not negative.
  assertEquals(maxWorkingDaysBetween("2026-09-26", "2026-09-21"), 0);
  assertEquals(maxWorkingDaysBetween("rubbish", "2026-09-21"), 0);
});

Deno.test("Hifz's six-day week is not mistaken for an impossible figure", () => {
  // The Hifz sheets carried 92 working days to 2 Sep, counting Saturdays.
  // 4 May - 2 Sep has 105 non-Sunday days, so 92 clears the ceiling and a
  // Hifz child who was there from the start is left alone.
  assertEquals(maxWorkingDaysBetween("2026-05-04", "2026-09-02"), 105);
  const check = checkOpeningAgainstAdmission(
    { workingDays: 92, asOf: "2026-09-02" },
    "2026-05-04",
  );
  assertEquals(check.impossible, false);
});

Deno.test("the real September joiners are caught", () => {
  // Muhammad Yousuf Arsalan, GR 2484: admitted 9 Sep, card said 3 of 60.
  const arsalan = checkOpeningAgainstAdmission(
    { workingDays: 60, asOf: "2026-09-16" },
    "2026-09-09",
  );
  assertEquals(arsalan.impossible, true);
  assertEquals(arsalan.maxPossible, 7); // 9-16 Sep less one Sunday
  assertEquals(arsalan.startsOn, "2026-09-10");

  // Minsa Hassan Siddiqui, GR 2482: admitted 27 Aug, card said 14 of 61.
  const minsa = checkOpeningAgainstAdmission(
    { workingDays: 61, asOf: "2026-09-17" },
    "2026-08-27",
  );
  assertEquals(minsa.impossible, true);
  assertEquals(minsa.startsOn, "2026-08-28");
});

Deno.test("a denominator the school already fixed by hand is left alone", () => {
  // Syeda Aisha Shakeel's Hifz IV row was pro-rated to 8 days by the
  // school. Whatever her sheet date, a figure that fits must not be
  // second-guessed - 8 days sits well inside a mid-September joining.
  const fixed = checkOpeningAgainstAdmission(
    { workingDays: 8, asOf: "2026-09-25" },
    "2026-09-12",
  );
  assertEquals(fixed.impossible, false);
});

Deno.test("a child with no admission date on file is never flagged", () => {
  // Most of the school predates the admission-date load; their register
  // figures are correct and must keep printing a percentage.
  const unknown = checkOpeningAgainstAdmission(
    { workingDays: 62, asOf: "2026-09-18" },
    null,
  );
  assertEquals(unknown.impossible, false);
  assertEquals(unknown.startsOn, null);
  // And a child with no carried row at all is not flagged either.
  assertEquals(checkOpeningAgainstAdmission(null, "2026-09-09").impossible, false);
});

Deno.test("a pupil already on the register is not treated as a new joiner", () => {
  // Areeba, GR 1626: carries a 31 Aug date but roll call has her from
  // 24 Aug, so 31 Aug is a move into Catch Up, not a joining. Her own
  // pro-rated 19-of-19 must survive.
  const areeba = checkOpeningAgainstAdmission(
    { workingDays: 19, asOf: "2026-09-02" },
    "2026-08-31",
    "2026-08-24",
  );
  assertEquals(areeba.impossible, false);
  assertEquals(areeba.readmitted, true);
  assertEquals(areeba.startsOn, null); // no "joined" line for a returning pupil

  // Abdullah Bilal, GR 1817: marked from 20 Aug against a 31 Aug date.
  const bilal = checkOpeningAgainstAdmission(
    { workingDays: 62, asOf: "2026-09-18" },
    "2026-08-31",
    "2026-08-20",
  );
  assertEquals(bilal.impossible, false);

  // But a genuine joiner whose first mark comes AFTER the date is still
  // caught - roll call only exonerates, it never condemns.
  const arsalan = checkOpeningAgainstAdmission(
    { workingDays: 60, asOf: "2026-09-16" },
    "2026-09-09",
    "2026-09-10",
  );
  assertEquals(arsalan.impossible, true);
  assertEquals(arsalan.readmitted, undefined);
});

Deno.test("a figure exactly at the ceiling is allowed, one over is not", () => {
  // Admitted Mon 21 Sep, sheet dated Sat 26 Sep: six possible days.
  const at = checkOpeningAgainstAdmission({ workingDays: 6, asOf: "2026-09-26" }, "2026-09-21");
  assertEquals(at.impossible, false);
  const over = checkOpeningAgainstAdmission({ workingDays: 7, asOf: "2026-09-26" }, "2026-09-21");
  assertEquals(over.impossible, true);
});
