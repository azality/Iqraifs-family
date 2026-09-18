// Marking progress, in tests — built from the school's own weights.

import { assertEquals } from "jsr:@std/assert@1";
import {
  progressForSection, cellState, subjectSitsExam, subjectIsExamined, classOrder,
  type ProgressSubject, type ProgressScore,
} from "./markingProgress.ts";

const ORAL = { id: "oral", name: "1st Assessment — Oral" };
const WRITTEN = { id: "written", name: "1st Assessment — Written" };

// Class I, as the school set it up.
const W = (label: string, marks: number, paper: string) => ({ label, marks, paper });
const CLASS_I: ProgressSubject[] = [
  { id: "art", name: "Art and Craft", weights: [] },
  { id: "eng", name: "English", weights: [W("Written", 50, "written"), W("Dictation", 10, "written")] },
  { id: "math", name: "Maths", weights: [W("Written", 55, "written"), W("Oral", 20, "oral")] },
  { id: "nazra", name: "Nazra", weights: [W("Quran", 50, "oral")] },
  { id: "robo", name: "Robotics", weights: [] },
];
// Class VIII: written only.
const CLASS_VIII: ProgressSubject[] = [
  { id: "urdu", name: "Urdu", weights: [W("Written", 75, "written")] },
  { id: "sci", name: "Science", weights: [W("Written", 75, "written")] },
];

const mark = (exam: string, stu: string, sub: string, m: number | null = 10, absent = false): ProgressScore =>
  ({ exam_id: exam, student_id: stu, class_subject_id: sub, obtained_marks: m, absent });

Deno.test("only subjects that sit the paper are counted", () => {
  const [oral, written] = progressForSection(CLASS_I, [ORAL, WRITTEN], ["s1"], []);
  // Oral: Maths and Nazra. Art & Craft and Robotics have no paper at all.
  assertEquals(oral.subjects.map((s) => s.subjectId), ["math", "nazra"]);
  // Written: English and Maths.
  assertEquals(written.subjects.map((s) => s.subjectId), ["eng", "math"]);
});

Deno.test("Class VIII's oral has nothing to mark — not 0 of 2", () => {
  const [oral] = progressForSection(CLASS_VIII, [ORAL], ["s1", "s2"], []);
  assertEquals(oral.subjectCount, 0);
  assertEquals(cellState(oral), "none");
});

Deno.test("a subject is done when every student has a mark", () => {
  const scores = [mark("written", "s1", "urdu"), mark("written", "s2", "urdu")];
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], ["s1", "s2"], scores);
  assertEquals(w.subjects.find((s) => s.subjectId === "urdu")?.done, true);
  assertEquals(w.subjects.find((s) => s.subjectId === "sci")?.done, false);
  assertEquals(w.subjectsDone, 1);
  assertEquals(cellState(w), "partial");
});

Deno.test("an absence counts as marked; an empty cell does not", () => {
  const scores = [
    mark("written", "s1", "urdu", null, true),   // absent
    mark("written", "s2", "urdu", null, false),  // blank, not entered
  ];
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], ["s1", "s2"], scores);
  assertEquals(w.subjects.find((s) => s.subjectId === "urdu")?.marked, 1);
});

Deno.test("zero is a mark", () => {
  const scores = [mark("written", "s1", "urdu", 0), mark("written", "s1", "sci", 0)];
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], ["s1"], scores);
  assertEquals(cellState(w), "done");
});

Deno.test("a student who has left does not count towards those still here", () => {
  // s9 left; their old marks must not make a column look complete.
  const scores = [mark("written", "s9", "urdu"), mark("written", "s1", "urdu")];
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], ["s1", "s2"], scores);
  assertEquals(w.subjects.find((s) => s.subjectId === "urdu")?.marked, 1);
});

Deno.test("nothing entered where something is owed reads as empty", () => {
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], ["s1"], []);
  assertEquals(cellState(w), "empty");
  assertEquals(w.marksExpected, 2);
});

Deno.test("an empty section is never 'done'", () => {
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], [], []);
  assertEquals(w.subjectsDone, 0);
});

Deno.test("marks entered and expected add up across subjects", () => {
  const scores = [mark("written", "s1", "urdu"), mark("written", "s2", "urdu"), mark("written", "s1", "sci")];
  const [w] = progressForSection(CLASS_VIII, [WRITTEN], ["s1", "s2"], scores);
  assertEquals(w.marksEntered, 3);
  assertEquals(w.marksExpected, 4);
});

Deno.test("the sit-the-paper rule matches the marks sheet's", () => {
  assertEquals(subjectSitsExam(null, "1st Assessment — Oral"), true);   // unknown: everywhere
  assertEquals(subjectSitsExam([], "1st Assessment — Oral"), false);   // no paper at all
  assertEquals(subjectSitsExam([W("Written", 75, "written")], "Mid — Written"), true);
  assertEquals(subjectSitsExam([W("Written", 75, "written")], "Mid — Oral"), false);
  assertEquals(subjectSitsExam([W("Written", 75, "written")], "Class test"), true); // no paper named
});

Deno.test("a subject owes a sign-off only if some paper carries marks", () => {
  assertEquals(subjectIsExamined([]), false);
  assertEquals(subjectIsExamined(null), false);
  assertEquals(subjectIsExamined([W("Quran", 50, "oral")]), true);
  assertEquals(subjectIsExamined([W("Written", 0, "written")]), false);
});

Deno.test("classes sort youngest first, and IX follows VIII", () => {
  const names = ["Class X", "Class IV", "Senior", "Class IX", "Reception", "Catch Up", "Class I", "Junior", "Class VIII"];
  const sorted = [...names].sort((a, b) => classOrder(a) - classOrder(b));
  assertEquals(sorted, [
    "Reception", "Junior", "Senior",
    "Class I", "Class IV", "Class VIII", "Class IX", "Class X",
    "Catch Up",
  ]);
});
