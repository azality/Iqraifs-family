import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deadlineState } from "./marksDeadline.ts";

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
