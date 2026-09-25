import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildUserPrompt, parseSuggestion, looksLikeUrdu, SYSTEM_PROMPT,
} from "./aiRemarks.ts";
import type { Finding } from "./reportFindings.ts";

const ctx = {
  schoolName: "Iqra Islamic Foundation School",
  studentFirstName: "Anaya",
  className: "Hifz III",
  termName: "1st Assessment",
  overallPct: 72.8,
  passMarkPct: 40,
  isMemorizer: true,
};
const finding = (en: string, severity: Finding["severity"]): Finding =>
  ({ kind: "subject_weak", severity, en, ur: "اردو", data: {} });

Deno.test("the prompt carries the findings and the pass mark, never raw marks", () => {
  const p = buildUserPrompt(ctx, [finding("Urdu is well below their own average.", "watch")]);
  assertEquals(p.includes("Urdu is well below their own average."), true);
  assertEquals(p.includes("72.8%"), true);
  assertEquals(p.includes("pass mark is 40%"), true);
  assertEquals(p.includes("hifz student"), true);
});

Deno.test("a child with nothing notable still produces a usable prompt", () => {
  const p = buildUserPrompt({ ...ctx, overallPct: null, isMemorizer: false }, []);
  assertEquals(p.includes("(nothing stands out in the numbers)"), true);
  assertEquals(p.includes("No overall result"), true);
});

Deno.test("the system prompt forbids invention and arithmetic", () => {
  assertEquals(/never invent/i.test(SYSTEM_PROMPT), true);
  assertEquals(/own arithmetic/i.test(SYSTEM_PROMPT), true);
  assertEquals(/gendered verb endings/i.test(SYSTEM_PROMPT), true);
});

Deno.test("parsing: clean JSON, JSON wrapped in chatter, and junk", () => {
  const good = `{"classTeacher":"Good effort.","classTeacherUr":"اچھی کوشش۔","principal":"Well done.","principalUr":"شاباش۔"}`;
  assertEquals(parseSuggestion(good)?.classTeacher, "Good effort.");
  assertEquals(parseSuggestion("Here you go:\n" + good + "\nHope that helps")?.principalUr, "شاباش۔");
  assertEquals(parseSuggestion("sorry, I cannot"), null);
  assertEquals(parseSuggestion(""), null);
});

Deno.test("a reply missing or emptying any field is rejected outright", () => {
  assertEquals(parseSuggestion(`{"classTeacher":"a","principal":"b","principalUr":"c"}`), null);
  assertEquals(parseSuggestion(`{"classTeacher":"a","classTeacherUr":"  ","principal":"b","principalUr":"c"}`), null);
  assertEquals(parseSuggestion(`{"classTeacher":"a","classTeacherUr":5,"principal":"b","principalUr":"c"}`), null);
});

Deno.test("the Urdu guard catches an English answer in the Urdu box", () => {
  assertEquals(looksLikeUrdu("ماشاءاللہ، بہترین نتیجہ۔ محنت اور توجہ نمایاں ہے۔"), true);
  assertEquals(looksLikeUrdu("Mashallah, an excellent result this term."), false);
  // A stray Urdu word inside an English sentence is still English.
  assertEquals(looksLikeUrdu("An excellent result, ماشاءاللہ, keep going every day."), false);
});
