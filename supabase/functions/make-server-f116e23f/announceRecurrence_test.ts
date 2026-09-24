import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { nextOccurrence, nextSchedule } from "./announceRecurrence.ts";

// 2026-09-25 is a Friday (the Montessori Activity Day slip). Weekday 5.
const FRI = 5;

Deno.test("weekly: the next Friday, strictly after today", () => {
  // Thu 24 Sep 2026, 10:00 PKT (05:00 UTC) -> Fri 25 Sep.
  assertEquals(nextOccurrence("weekly", FRI, new Date("2026-09-24T05:00:00Z")), "2026-09-25");
  // ON Friday itself -> the NEXT Friday, never today again.
  assertEquals(nextOccurrence("weekly", FRI, new Date("2026-09-25T05:00:00Z")), "2026-10-02");
});

Deno.test("monthly_last: last Friday of September 2026 is the 25th", () => {
  assertEquals(nextOccurrence("monthly_last", FRI, new Date("2026-09-01T05:00:00Z")), "2026-09-25");
  // After the 25th -> last Friday of October = 30 Oct 2026.
  assertEquals(nextOccurrence("monthly_last", FRI, new Date("2026-09-26T05:00:00Z")), "2026-10-30");
});

Deno.test("monthly_first: first Friday of October 2026 is the 2nd", () => {
  assertEquals(nextOccurrence("monthly_first", FRI, new Date("2026-09-26T05:00:00Z")), "2026-10-02");
});

Deno.test("PKT day boundary: late UTC evening is already the next day in Pakistan", () => {
  // 24 Sep 20:00 UTC = 25 Sep 01:00 PKT -> "after" day is the 25th,
  // so the next weekly Friday is 2 Oct, not the 25th.
  assertEquals(nextOccurrence("weekly", FRI, new Date("2026-09-24T20:00:00Z")), "2026-10-02");
});

Deno.test("nextSchedule: posts lead_days before at 07:00 PKT, expires end of the day", () => {
  const s = nextSchedule("monthly_last", FRI, 1, new Date("2026-09-20T05:00:00Z"));
  assertEquals(s.occurrence, "2026-09-25");
  assertEquals(s.postAt, "2026-09-24T02:00:00.000Z");   // 24 Sep 07:00 PKT
  assertEquals(s.expiresAt, "2026-09-25T18:59:00.000Z"); // 25 Sep 23:59 PKT
});

Deno.test("nextSchedule: a rule created AFTER its post moment rolls to the next occurrence", () => {
  // 24 Sep 10:00 PKT is past the 07:00 post moment for the 25th ->
  // the first instance is about 30 October.
  const s = nextSchedule("monthly_last", FRI, 1, new Date("2026-09-24T05:00:00Z"));
  assertEquals(s.occurrence, "2026-10-30");
  assertEquals(s.postAt, "2026-10-29T02:00:00.000Z");
});
