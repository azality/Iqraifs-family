import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isFailing, failedSubjectNames, failedTerm } from "./passMarkRules.ts";

// The default lives with the DB reader; asserted here as documentation.
const DEFAULT_PASS_MARK_PCT = 40;

const PASS = 40;
const sub = (name: string, percentage: number | null) => ({ name, percentage });

Deno.test("isFailing: below the line fails, null never does", () => {
  assertEquals(isFailing(39.9, PASS), true);
  assertEquals(isFailing(40, PASS), false);
  assertEquals(isFailing(null, PASS), false);
  assertEquals(isFailing(undefined, PASS), false);
});

Deno.test("one failed subject fails the term, however good the rest", () => {
  // Fizza Tariq's real card: 53.8% overall, Science 21.3%.
  const subjects = [
    sub("Science", 21.3), sub("Urdu", 55.3), sub("Quran", 84), sub("Social Studies", 93.3),
  ];
  assertEquals(failedSubjectNames(subjects, PASS), ["Science"]);
  assertEquals(failedTerm(53.8, subjects, PASS), true);
  // Even a straight-A card fails on a single subject.
  assertEquals(failedTerm(95, [sub("Maths", 100), sub("Urdu", 12)], PASS), true);
});

Deno.test("every subject passing means the term turns on the grand total", () => {
  // Abu Bakar: Urdu 41.3% is above the 40 line, so he passes.
  const subjects = [sub("Urdu", 41.3), sub("Science", 89.3), sub("Maths", 78.7)];
  assertEquals(failedSubjectNames(subjects, PASS), []);
  assertEquals(failedTerm(72.8, subjects, PASS), false);
  // A weak overall still fails even with no single subject below.
  assertEquals(failedTerm(38, [sub("Maths", 41), sub("Urdu", 42)], PASS), true);
});

Deno.test("an unmarked subject is not a fail - a pending paper brands nobody", () => {
  const subjects = [sub("Science", null), sub("Urdu", 70)];
  assertEquals(failedSubjectNames(subjects, PASS), []);
  assertEquals(failedTerm(70, subjects, PASS), false);
  // And a child with nothing at all is not failed.
  assertEquals(failedTerm(null, [sub("Urdu", null)], PASS), false);
});

Deno.test("the school's own pass mark is honoured, not a hardcoded 40", () => {
  const subjects = [sub("Urdu", 35)];
  assertEquals(failedTerm(60, subjects, 33), false); // 35 clears a 33 line
  assertEquals(failedTerm(60, subjects, 40), true);  // and fails a 40 line
  assertEquals(DEFAULT_PASS_MARK_PCT, 40);
});

Deno.test("every failing subject is named, in the order given", () => {
  const subjects = [sub("Urdu", 12), sub("Maths", 90), sub("Science", 20)];
  assertEquals(failedSubjectNames(subjects, PASS), ["Urdu", "Science"]);
});
