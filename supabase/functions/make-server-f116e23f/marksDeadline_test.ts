import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deadlineState, effectiveSchedule } from "./marksDeadline.ts";

const TWO_PM = "2026-09-24T09:00:00.000Z"; // 2pm PKT
const ONE_PM = new Date("2026-09-24T08:00:00.000Z");
const THREE_PM = new Date("2026-09-24T10:00:00.000Z");

Deno.test("before the deadline a teacher works; after it they are locked", () => {
  const before = deadlineState({ deadlineAt: TWO_PM, exceptionUntil: null, isAdmin: false, now: ONE_PM });
  assertEquals(before.locked, false);
  assertEquals(before.effectiveAt, TWO_PM);
  const after = deadlineState({ deadlineAt: TWO_PM, exceptionUntil: null, isAdmin: false, now: THREE_PM });
  assertEquals(after.locked, true);
});

Deno.test("no deadline set - nothing locks, no countdown", () => {
  const s = deadlineState({ deadlineAt: null, exceptionUntil: null, isAdmin: false, now: THREE_PM });
  assertEquals(s.locked, false);
  assertEquals(s.effectiveAt, null);
});

Deno.test("admin and principal are never locked", () => {
  const s = deadlineState({ deadlineAt: TWO_PM, exceptionUntil: null, isAdmin: true, now: THREE_PM });
  assertEquals(s.locked, false);
});

Deno.test("an exception is the teacher's own later moment", () => {
  const FOUR_PM = "2026-09-24T11:00:00.000Z";
  const s = deadlineState({ deadlineAt: TWO_PM, exceptionUntil: FOUR_PM, isAdmin: false, now: THREE_PM });
  assertEquals(s.locked, false);
  assertEquals(s.effectiveAt, FOUR_PM);
  const later = deadlineState({ deadlineAt: TWO_PM, exceptionUntil: FOUR_PM, isAdmin: false, now: new Date("2026-09-24T12:00:00.000Z") });
  assertEquals(later.locked, true);
});

Deno.test("an exception EARLIER than the deadline never shortens anyone's time", () => {
  const NOON = "2026-09-24T07:00:00.000Z";
  const s = deadlineState({ deadlineAt: TWO_PM, exceptionUntil: NOON, isAdmin: false, now: ONE_PM });
  assertEquals(s.locked, false);
  assertEquals(s.effectiveAt, TWO_PM);
});

// ── effectiveSchedule: whole school vs one class's override ────────────

const SCHOOL = { marksDeadlineAt: TWO_PM, resultsPublishAt: "2026-09-30T05:00:00.000Z" };

Deno.test("no override - a class follows the whole school", () => {
  assertEquals(effectiveSchedule(SCHOOL, null), SCHOOL);
});

Deno.test("deadline OFF exempts the class even when the school has one", () => {
  const s = effectiveSchedule(SCHOOL, { marksDeadlineAt: null, marksDeadlineOff: true, resultsPublishAt: null });
  assertEquals(s.marksDeadlineAt, null);
  assertEquals(s.resultsPublishAt, SCHOOL.resultsPublishAt); // results still inherit
});

Deno.test("a class's own moments beat the school's; a null field inherits", () => {
  const OWN_DL = "2026-09-25T09:00:00.000Z";
  const OWN_RES = "2026-10-02T05:00:00.000Z";
  const both = effectiveSchedule(SCHOOL, { marksDeadlineAt: OWN_DL, marksDeadlineOff: false, resultsPublishAt: OWN_RES });
  assertEquals(both, { marksDeadlineAt: OWN_DL, resultsPublishAt: OWN_RES });
  const onlyResults = effectiveSchedule(SCHOOL, { marksDeadlineAt: null, marksDeadlineOff: false, resultsPublishAt: OWN_RES });
  assertEquals(onlyResults, { marksDeadlineAt: TWO_PM, resultsPublishAt: OWN_RES });
});

Deno.test("deadline OFF wins even when an own deadline is also stored", () => {
  const s = effectiveSchedule(SCHOOL, { marksDeadlineAt: "2026-09-25T09:00:00.000Z", marksDeadlineOff: true, resultsPublishAt: null });
  assertEquals(s.marksDeadlineAt, null);
});
