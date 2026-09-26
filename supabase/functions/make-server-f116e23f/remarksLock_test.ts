import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { remarkLock, remarkLockMessage } from "./remarksLock.ts";

const NOW = new Date("2026-10-01T12:00:00Z");
const PAST = "2026-09-30T17:00:00Z";
const FUTURE = "2026-10-02T17:00:00Z";

Deno.test("the office is never locked, by either lock", () => {
  const l = remarkLock({
    isOffice: true, finalizedAt: "2026-09-29T10:00:00Z", deadlineAt: PAST, now: NOW,
  });
  assertEquals(l.locked, false);
  assertEquals(l.reason, null);
});

Deno.test("finalizing closes the card to its teacher, deadline or not", () => {
  // Finalized, and the deadline has not even arrived yet.
  const l = remarkLock({ finalizedAt: "2026-09-29T10:00:00Z", deadlineAt: FUTURE, now: NOW });
  assertEquals(l.locked, true);
  assertEquals(l.reason, "finalized");
  // With no deadline set at all, finalizing is still the lock - which is
  // what governs a school that never sets a cutoff.
  assertEquals(remarkLock({ finalizedAt: "2026-09-29T10:00:00Z", now: NOW }).reason, "finalized");
});

Deno.test("before the deadline a teacher writes; after it they cannot", () => {
  const open = remarkLock({ deadlineAt: FUTURE, now: NOW });
  assertEquals(open.locked, false);
  assertEquals(open.closesAt, new Date(FUTURE).toISOString());

  const shut = remarkLock({ deadlineAt: PAST, now: NOW });
  assertEquals(shut.locked, true);
  assertEquals(shut.reason, "deadline");
});

Deno.test("no deadline set means no cutoff - only finalizing closes a card", () => {
  const l = remarkLock({ deadlineAt: null, now: NOW });
  assertEquals(l.locked, false);
  assertEquals(l.closesAt, null);
});

Deno.test("a class exempt from the marks deadline is exempt from this one", () => {
  // Hifz I-IV, Junior and Reception carry marks_deadline_off at IFS; the
  // school keeps ONE list of exempt classes, not two.
  const l = remarkLock({ deadlineAt: PAST, classExempt: true, now: NOW });
  assertEquals(l.locked, false);
  // But an exempt class's FINALIZED card is still closed - exemption is
  // from the clock, not from the office's sign-off.
  const done = remarkLock({
    deadlineAt: PAST, classExempt: true, finalizedAt: "2026-09-29T10:00:00Z", now: NOW,
  });
  assertEquals(done.locked, true);
  assertEquals(done.reason, "finalized");
});

Deno.test("a deadline exactly now has not passed yet", () => {
  const l = remarkLock({ deadlineAt: NOW.toISOString(), now: NOW });
  assertEquals(l.locked, false);
});

Deno.test("an unparseable deadline never locks anyone out", () => {
  const l = remarkLock({ deadlineAt: "not a date", now: NOW });
  assertEquals(l.locked, false);
  assertEquals(l.reason, null);
});

Deno.test("every lock explains itself, and an open card says nothing", () => {
  assertEquals(remarkLockMessage("finalized").includes("finalized"), true);
  assertEquals(remarkLockMessage("deadline").includes("deadline"), true);
  assertEquals(remarkLockMessage(null), "");
});
