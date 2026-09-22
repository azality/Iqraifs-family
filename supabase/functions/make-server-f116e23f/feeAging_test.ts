import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { countsTowardAging, owedOn } from "./feeAging.ts";

Deno.test("reading September, an October voucher is not yet arrears", () => {
  // Abu Bakar (GR 2476): Rs 200 paid over September sits on October, and
  // September's page showed the family owing Rs 5,800 (22 Sep).
  assertEquals(countsTowardAging("2026-10", "2026-09"), false);
});

Deno.test("the month being read, and every month before it, count", () => {
  assertEquals(countsTowardAging("2026-09", "2026-09"), true);
  assertEquals(countsTowardAging("2026-08", "2026-09"), true);
  // The carried-arrears row the register import writes.
  assertEquals(countsTowardAging("2026-05", "2026-09"), true);
});

Deno.test("year boundaries compare as dates, not as numbers of a string", () => {
  assertEquals(countsTowardAging("2027-01", "2026-12"), false);
  assertEquals(countsTowardAging("2026-12", "2027-01"), true);
  // Zero padding is what makes the text comparison safe.
  assertEquals(countsTowardAging("2026-09", "2026-10"), true);
  assertEquals(countsTowardAging("2026-10", "2026-09"), false);
});

Deno.test("with no window every month counts - the TRUE balance", () => {
  // The student profile and the finance rollups read it this way; that
  // was the 4000-vs-8000 fix and must not be filtered.
  assertEquals(countsTowardAging("2027-06", undefined), true);
  assertEquals(countsTowardAging("2026-01", null), true);
});

Deno.test("a voucher with no period cannot be placed in a window", () => {
  assertEquals(countsTowardAging(null, "2026-09"), false);
  // ...but with no window it is simply part of the balance.
  assertEquals(countsTowardAging(null, undefined), true);
});

Deno.test("owed is due minus paid, and never negative", () => {
  assertEquals(owedOn(6000, 0), 6000);
  assertEquals(owedOn(6000, 2000), 4000);
  assertEquals(owedOn(6000, 6000), 0);
  // Paid over: owes nothing on this month, not a negative balance that
  // would quietly cancel another month's fee.
  assertEquals(owedOn(6000, 6200), 0);
});

Deno.test("missing amounts are zero, not NaN", () => {
  assertEquals(owedOn(null, null), 0);
  assertEquals(owedOn(4850, null), 4850);
  assertEquals(owedOn(undefined, 500), 0);
});
